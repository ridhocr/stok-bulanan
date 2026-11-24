import { loadEnvFile } from 'node:process'
import { openDatabase } from '../server/db.js'

try { loadEnvFile(new URL('../.env', import.meta.url)) }
catch (error) { if (error.code !== 'ENOENT') throw error }

const env = process.env
const connectionString = env.MIGRATION_DATABASE_URL || env.DATABASE_URL
if (!connectionString) throw new Error('Isi MIGRATION_DATABASE_URL atau DATABASE_URL untuk menjalankan migrasi.')

try {
  const database = await openDatabase({
    connectionString, migrate: true, ssl: env.DATABASE_SSL !== 'disable', ca: env.DATABASE_CA?.replaceAll('\\n', '\n'),
  })
  await database.close()
  console.log('Skema StokBulanan siap.')
} catch (error) {
  console.error(`Migrasi gagal (${error.code ?? error.name}). Periksa koneksi, TLS, dan hak role migrasi.`)
  process.exitCode = 1
}
