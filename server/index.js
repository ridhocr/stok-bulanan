import { createServer } from 'node:http'
import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuth } from './auth.js'
import { accountTransaction, authTransaction, openDatabase } from './db.js'
import { createApp } from './http.js'

const root = fileURLToPath(new URL('../', import.meta.url))
try { loadEnvFile(resolve(root, '.env')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const dev = process.argv.includes('--dev')
const env = process.env
const host = env.HOST ?? '127.0.0.1'
const port = Number(env.PORT ?? 3000)
const credentials = [env.DATABASE_URL, env.RESEND_API_KEY, env.EMAIL_FROM, env.APP_ORIGIN]
const demo = credentials.every(value => !value)
if (!demo && !credentials.every(Boolean)) throw new Error('Isi DATABASE_URL, RESEND_API_KEY, EMAIL_FROM dan APP_ORIGIN.')
if (demo && (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host))) {
  throw new Error('Mode demo hanya dapat berjalan pada loopback di luar environment produksi.')
}
const origin = demo ? undefined : new URL(env.APP_ORIGIN).origin
if (!demo && !origin.startsWith('https:') &&
  (env.NODE_ENV === 'production' || !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin))) {
  throw new Error('Gunakan APP_ORIGIN HTTPS. HTTP tersedia untuk pengembangan loopback.')
}

const directory = resolve(root, env.DATA_DIR ?? '.data')
const database = await openDatabase({
  connectionString: env.DATABASE_URL, directory: resolve(directory, 'postgres'), ca: env.DATABASE_CA?.replaceAll('\\n', '\n'),
  ssl: env.DATABASE_SSL !== 'disable',
})
if (!demo) {
  try {
    await authTransaction(database, query => query('SELECT id FROM accounts LIMIT 1'))
    await accountTransaction(database, '00000000-0000-0000-0000-000000000000', false, tx => tx.one('SELECT user_id FROM profiles LIMIT 1'))
  } catch (error) {
    await database.close()
    throw new Error(`Database belum siap (${error.code ?? error.name}). Periksa koneksi, migrasi, dan role runtime.`)
  }
}
const auth = await createAuth({
  database, key: env.RESEND_API_KEY, from: env.EMAIL_FROM, origin, demo, directory,
  allowedEmails: env.AUTH_ALLOWED_EMAILS, trustProxy: env.TRUST_PROXY === 'true',
})
const server = createServer()
const publicDirectory = resolve(root, dev ? '.data/frontend-dev' : 'dist')
const compiler = dev ? await (await import('../scripts/build.js')).buildFrontend({ watch: true, outputDirectory: publicDirectory }) : null
server.on('request', createApp({ database, auth, origin, dev, publicDirectory }))
server.on('error', async error => { console.error(error.message); await database.close(); process.exit(1) })
server.listen(port, host, () => console.log(`StokBulanan ${demo ? '(demo lokal)' : ''} → http://${host}:${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await compiler?.dispose()
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    await database.close()
  })
}
