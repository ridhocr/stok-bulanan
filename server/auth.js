import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { authTransaction } from './db.js'
import { ApiError, fail } from './validation.js'

const demoName = 'sb_demo'
const sessionLifetime = 30 * 86400
const linkMinutes = 15
const validToken = /^[a-zA-Z0-9_-]{43}$/
const newToken = () => randomBytes(32).toString('base64url')
const digest = value => createHash('sha256').update(value).digest('hex')
const normalizeEmail = value => value.trim().toLowerCase()

function cookieValue(request, name) {
  return request.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''
}

function senderAddress(request, trustProxy) {
  const supplied = request.headers['x-real-ip']
  if (trustProxy && typeof supplied === 'string' && isIP(supplied.trim())) return supplied.trim()
  return request.socket?.remoteAddress ?? 'unknown'
}

const reserve = (query, scope, value, limit, seconds) => query(
  `INSERT INTO login_limits (scope_key, expires_at) VALUES ($1, now() + $2::int * interval '1 second')
   ON CONFLICT (scope_key) DO UPDATE SET
     attempts = CASE WHEN login_limits.expires_at <= now() THEN 1 ELSE login_limits.attempts + 1 END,
     expires_at = CASE WHEN login_limits.expires_at <= now() THEN excluded.expires_at ELSE login_limits.expires_at END
   WHERE login_limits.expires_at <= now() OR login_limits.attempts < $3
   RETURNING attempts`, [`${scope}:${digest(value)}`, seconds, limit],
)

export async function createAuth({ database, key, from, origin, demo, directory, allowedEmails = '', trustProxy = false }) {
  const secure = origin?.startsWith('https:') ?? false
  const sessionName = secure ? '__Host-stok_session' : 'stok_session'
  const allowed = new Set(allowedEmails.split(',').map(normalizeEmail).filter(Boolean))
  const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  let demoKey
  if (demo) {
    const file = resolve(directory, 'session.key')
    await mkdir(directory, { recursive: true })
    await writeFile(file, randomBytes(32), { mode: 0o600, flag: 'wx' }).catch(error => {
      if (error.code !== 'EEXIST') throw error
    })
    demoKey = await readFile(file)
  }
  const signature = id => createHmac('sha256', demoKey).update(id).digest()
  const tx = work => authTransaction(database, work)

  function readDemo(request) {
    const [id, signed] = cookieValue(request, demoName).split('.')
    if (!/^[\da-f-]{36}$/.test(id) || !/^[\da-f]{64}$/.test(signed ?? '')) return null
    if (!timingSafeEqual(signature(id), Buffer.from(signed, 'hex'))) return null
    return { id, demo: true }
  }

  return {
    demo,
    async session(request) {
      if (demo) return readDemo(request)
      const token = cookieValue(request, sessionName)
      if (!validToken.test(token)) return null
      const account = await tx(query => query(`SELECT a.id, a.email FROM sessions s
        JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at > now()`, [digest(token)]))
      return account && (!allowed.size || allowed.has(account.email)) ? { ...account, demo: false } : null
    },
    issueDemo(response, existing, newId = randomUUID()) {
      if (!demo) fail('Demo hanya tersedia pada server lokal.', 404, 'NOT_FOUND')
      if (existing) return existing
      response.setHeader('Set-Cookie', cookie(demoName, `${newId}.${signature(newId).toString('hex')}`, sessionLifetime))
      return { id: newId, demo: true }
    },
    async send(input, request) {
      if (demo) fail('Pengiriman email belum dikonfigurasi.', 503, 'AUTH_UNAVAILABLE')
      const email = normalizeEmail(input)
      const token = newToken()
      const hash = digest(token)
      const outcome = await tx(async query => {
        if (!await reserve(query, 'ip', senderAddress(request, trustProxy), 12, 900)) return 'limited'
        if (!await reserve(query, 'email', email, 1, 45)) return 'limited'
        if (allowed.size && !allowed.has(email)) return 'skip'
        await query('DELETE FROM login_limits WHERE expires_at <= now()')
        await query('DELETE FROM magic_links WHERE expires_at <= now()')
        await query(`INSERT INTO magic_links (token_hash,email,expires_at)
          VALUES ($1,$2,now() + $3::int * interval '1 minute')`, [hash, email, linkMinutes])
        return 'send'
      })
      if (outcome === 'limited') fail('Tunggu sebentar sebelum meminta tautan baru.', 429, 'RATE_LIMITED')
      if (outcome !== 'send') return

      const link = `${origin}/#/masuk?token=${token}`
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `stok-login/${hash}` },
        body: JSON.stringify({
          from, to: [email], subject: 'Tautan masuk StokBulanan',
          text: `Masuk ke StokBulanan: ${link}\n\nTautan ini berlaku ${linkMinutes} menit dan hanya bisa dipakai sekali.`,
          html: `<p><a href="${link}">Masuk ke StokBulanan</a></p><p>Tautan berlaku ${linkMinutes} menit dan hanya bisa dipakai sekali.</p>`,
        }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => { throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Tautan masuk belum bisa dikirim. Coba lagi.') })
      await response.body?.cancel().catch(() => {})
      if (!response.ok) fail('Tautan masuk belum bisa dikirim. Coba lagi.', 503, 'EMAIL_UNAVAILABLE')
    },
    async verify(request, response, token) {
      if (demo || !validToken.test(token)) return null
      const session = newToken()
      const prior = cookieValue(request, sessionName)
      const account = await tx(async query => {
        const link = await query('DELETE FROM magic_links WHERE token_hash=$1 AND expires_at>now() RETURNING email', [digest(token)])
        if (!link || (allowed.size && !allowed.has(link.email))) return null
        const account = await query(`INSERT INTO accounts (email) VALUES ($1) ON CONFLICT (email) DO UPDATE
          SET email=excluded.email RETURNING id, email`, [link.email])
        await query('DELETE FROM sessions WHERE expires_at <= now()')
        if (validToken.test(prior)) await query('DELETE FROM sessions WHERE token_hash=$1', [digest(prior)])
        await query(`INSERT INTO sessions (token_hash,account_id,expires_at)
          VALUES ($1,$2,now() + $3::int * interval '1 second')`, [digest(session), account.id, sessionLifetime])
        return account
      })
      if (!account) return null
      response.setHeader('Set-Cookie', cookie(sessionName, session, sessionLifetime))
      return { ...account, demo: false }
    },
    async logout(request, response) {
      const session = cookieValue(request, sessionName)
      if (!demo && validToken.test(session)) await tx(query => query('DELETE FROM sessions WHERE token_hash=$1', [digest(session)]))
      response.setHeader('Set-Cookie', [sessionName, demoName].map(name => cookie(name, '', 0)))
    },
  }
}
