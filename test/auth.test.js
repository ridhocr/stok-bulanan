import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'
import { createAuth } from '../server/auth.js'
import { authTransaction, openDatabase } from '../server/db.js'
import { createApp } from '../server/http.js'

const digest = value => createHash('sha256').update(value).digest('hex')
const origin = 'https://stok.example.com'

test('magic link Resend sekali pakai, pembatasan kirim dan pencabutan sesi berlaku lintas request', async t => {
  const database = await openDatabase()
  const delivered = []
  const actualFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url !== 'https://api.resend.com/emails') return actualFetch(url, options)
    delivered.push({ ...JSON.parse(options.body), headers: options.headers })
    return Response.json({ id: 'test-message' })
  })
  const auth = await createAuth({
    database, key: 'resend-test-key', from: 'StokBulanan <login@example.com>', origin, demo: false,
    allowedEmails: 'user@example.com,second@example.com',
  })
  const server = createServer(createApp({ database, auth, origin, publicDirectory: 'dist' }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await database.close()
  })
  const request = async (path, { body, method = body ? 'POST' : 'GET', headers } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') }
  }
  const login = email => request('/auth/login', { body: { email } })
  const verify = (token, headers) => request('/auth/verify', { body: { token }, headers })

  assert.equal((await login(' USER@example.com ')).status, 200)
  assert.equal((await login('user@example.com')).status, 429)
  assert.equal((await login('unlisted@example.com')).status, 200)
  assert.equal(delivered.length, 1)
  const message = delivered[0]
  assert.deepEqual(message.to, ['user@example.com'])
  assert.equal(message.from, 'StokBulanan <login@example.com>')
  assert.equal(message.headers.Authorization, 'Bearer resend-test-key')
  const token = message.text.match(/#\/masuk\?token=([\w-]+)/)[1]
  assert.ok(message.html.includes(`${origin}/#/masuk?token=${token}`))
  const link = await authTransaction(database, q => q('SELECT token_hash, email FROM magic_links'))
  assert.equal(link.token_hash, digest(token))
  assert.equal(message.headers['Idempotency-Key'], `stok-login/${link.token_hash}`)
  assert.equal((await request('/auth/verify')).status, 401)
  assert.equal((await verify(token, { Origin: 'https://other.example.com' })).status, 403)
  const attempts = await Promise.all([verify(token), verify(token)])
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 400])

  const authenticated = attempts.find(result => result.status === 200)
  assert.match(authenticated.cookie, /^__Host-stok_session=[\w-]+; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/)
  const cookie = authenticated.cookie.split(';')[0]
  const session = await request('/auth/session', { headers: { Cookie: cookie } })
  assert.deepEqual(session.data.user, authenticated.data.user)
  assert.equal((await request('/products', { headers: { Cookie: cookie } })).status, 200)
  assert.ok(await authTransaction(database, q => q('SELECT id FROM accounts WHERE email=$1', ['user@example.com'])))
  const stored = await authTransaction(database, q => q('SELECT token_hash FROM sessions'))
  assert.equal(stored.token_hash, digest(cookie.split('=')[1]))

  const loggedOut = await request('/auth/logout', { method: 'POST', headers: { Cookie: cookie } })
  assert.match(loggedOut.cookie, /Max-Age=0/)
  assert.equal((await request('/products', { headers: { Cookie: cookie } })).status, 401)

  assert.equal((await login('second@example.com')).status, 200)
  const expired = delivered[1].text.match(/#\/masuk\?token=([\w-]+)/)[1]
  await authTransaction(database, query => query("UPDATE magic_links SET expires_at=now() - interval '1 second' WHERE token_hash=$1", [digest(expired)]))
  assert.equal((await verify(expired)).status, 400)
})
