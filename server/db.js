import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const migrations = [
  ['stock.profiles', '001_initial.sql'],
  ['stock_auth.accounts', '002_email_auth_and_budget.sql'],
]
const dateColumns = ['start_date', 'end_date', 'purchased_on', 'stockout_date']

async function migrateSchema(client, execute) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('stokbulanan_migration'))")
  for (const [table, file] of migrations) {
    const { rows } = await client.query('SELECT to_regclass($1) AS installed', [table])
    if (!rows[0].installed) await execute(await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8'))
  }
}

export async function openDatabase({ connectionString, directory, ca, ssl = true, migrate = false } = {}) {
  if (!connectionString) {
    const { PGlite } = await import('@electric-sql/pglite')
    if (directory) await mkdir(resolve(directory), { recursive: true })
    const db = await PGlite.create(directory ? resolve(directory) : undefined)
    try { await db.transaction(tx => migrateSchema(tx, sql => tx.exec(sql))) }
    catch (error) { await db.close(); throw error }
    return {
      run: work => db.transaction(work),
      close: () => db.close(),
    }
  }

  const { default: pg } = await import('pg')
  pg.types.setTypeParser(1082, value => value)
  let url
  try { url = new URL(connectionString) } catch { throw new Error('DATABASE_URL PostgreSQL tidak valid.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Gunakan URL PostgreSQL.')
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat']) url.searchParams.delete(key)
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 4,
    connectionTimeoutMillis: 5000,
    ssl: ssl ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
  })
  const run = async work => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  if (migrate) {
    try { await run(client => migrateSchema(client, sql => client.query(sql))) }
    catch (error) { await pool.end(); throw error }
  }
  return { run, close: () => pool.end() }
}

export function authTransaction(database, work) {
  return database.run(async client => {
    await client.query('SET LOCAL statement_timeout = 7000')
    await client.query('SET LOCAL ROLE stokbulanan_auth')
    await client.query('SET LOCAL search_path = stock_auth, pg_catalog')
    return work(async (query, values = []) => (await client.query(query, values)).rows[0])
  })
}

export function accountTransaction(database, userId, write, work) {
  return database.run(async client => {
    await client.query(write ? 'SET LOCAL statement_timeout = 7000' : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query('SET LOCAL ROLE stokbulanan_app')
    await client.query('SET LOCAL search_path = stock, pg_catalog')
    await client.query("SELECT set_config('stokbulanan.owner_id', $1, true)", [userId])
    if (write) {
      // Serialize account mutations, including cycle overlap checks and list finalization.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId])
      await client.query('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
    }
    const rows = async (sql, params = []) => {
      const result = await client.query(sql, params)
      for (const row of result.rows) {
        for (const key of dateColumns) {
          if (row[key] instanceof Date) row[key] = row[key].toISOString().slice(0, 10)
        }
      }
      return result.rows
    }
    const one = async (sql, params = []) => (await rows(sql, params))[0]
    return work({ rows, one })
  })
}
