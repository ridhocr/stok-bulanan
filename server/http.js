import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { accountTransaction } from './db.js'
import { seedDemo } from './demo.js'
import { service } from './service.js'
import { ApiError, fail, id, parse, schemas } from './validation.js'

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp',
}
const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const log = (event, detail) => console.log(JSON.stringify({ event, ...detail }))

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) fail('Kirim data sebagai JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE')
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 125000) fail('Ukuran permintaan terlalu besar.', 413, 'TOO_LARGE')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { return fail('JSON tidak valid.') }
}

function send(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

function filter(params) {
  const category = params.get('category')
  const status = params.get('status')
  const sort = params.get('sort') ?? 'name'
  if (status && !['kurang', 'pas', 'cukup', 'berlebih', 'belum'].includes(status)) fail('Filter status tidak valid.')
  if (!['name', 'priority'].includes(sort)) fail('Urutan tidak valid.')
  return { q: (params.get('q') ?? '').trim().slice(0, 100), category: category ? parse(id, category) : null, status, sort, archived: params.get('archived') === 'true' }
}

async function dispatch(s, route, method, url, body) {
  const args = route.split('/').filter(Boolean)
  const [root, resource, sub, extra] = args
  const is = (m, count) => method === m && args.length === count
  const input = name => parse(schemas[name], body)
  if (root === 'dashboard' && is('GET', 1)) {
    return {
      settings: await s.settings(), products: await s.products({ archived: true }),
      categories: await s.categories(), cycles: await s.cycles(),
    }
  }
  if (root === 'settings') {
    if (is('GET', 1)) return s.settings()
    if (is('PATCH', 1)) return s.saveSettings(input('settings'))
  }
  if (root === 'categories') {
    if (is('GET', 1)) return s.categories()
    if (is('POST', 1)) return s.createCategory(input('category').name)
  }
  if (root === 'products') {
    if (is('GET', 1)) return s.products(filter(url.searchParams))
    if (is('POST', 1)) return s.saveProduct(input('product'))
    if (is('GET', 2)) return s.product(parse(id, resource))
    if (is('PATCH', 2)) return s.saveProduct(input('productPatch'), parse(id, resource))
    if (sub === 'history' && is('GET', 3)) return s.history(parse(id, resource))
  }
  if (root === 'cycles') {
    if (is('GET', 1)) return s.cycles()
    if (is('POST', 1)) return s.createCycle(input('cycle'))
    const cycleId = parse(id, resource)
    if (is('GET', 2)) return s.cycle(cycleId)
    if (is('PATCH', 2)) return s.changeCycle(cycleId, input('cyclePatch'))
    if (sub === 'opening-stock' && is('POST', 3)) return s.saveOpening(cycleId, input('opening'))
    if (sub === 'purchases' && is('POST', 3)) return s.addPurchases(cycleId, input('purchases'))
    if (sub === 'reviews' && is('PUT', 4)) return s.saveReview(cycleId, parse(id, extra), input('review'))
    if (sub === 'close' && is('POST', 3)) return s.closeCycle(cycleId)
    if (sub === 'recommendations' && is('GET', 3)) return s.recommendations(cycleId)
    if (sub === 'shopping-list' && is('POST', 3)) return s.generateList(cycleId, input('generate'))
  }
  if (root === 'purchases' && is('PATCH', 2)) return s.editPurchase(parse(id, resource), input('purchasePatch'))
  if (root === 'shopping-lists') {
    const listId = parse(id, resource)
    if (is('GET', 2)) return s.getList(listId)
    if (is('PATCH', 2)) return s.changeList(listId, input('listPatch'))
    if (is('DELETE', 2)) return s.removeList(listId)
    if (sub === 'finalize' && is('POST', 3)) return s.finalize(listId, input('finalize'))
  }
  fail('Endpoint tidak ditemukan.', 404, 'NOT_FOUND')
}

export function createApp({ database, auth, origin, dev = false, publicDirectory }) {
  const publicPath = resolve(publicDirectory)
  return async (request, response) => {
    const traceId = randomUUID()
    const started = performance.now()
    const method = request.method
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'")
    if (origin?.startsWith('https:')) response.setHeader('Strict-Transport-Security', 'max-age=31536000')

    try {
      const appOrigin = origin ?? new URL(`http://${request.headers.host}`).origin
      const url = new URL(request.url, appOrigin)
      if (url.origin !== appOrigin || !request.url.startsWith('/')) fail('Alamat permintaan tidak valid.')
      if (url.pathname.startsWith('/api/')) {
        response.setHeader('X-Request-Id', traceId)
        response.on('finish', () => log('api', { traceId, method, status: response.statusCode, durationMs: Math.round(performance.now() - started) }))
        if (!url.pathname.startsWith('/api/v1/')) fail('Endpoint tidak ditemukan.', 404, 'NOT_FOUND')
        if (unsafe.has(method) && ((request.headers.origin && request.headers.origin !== appOrigin) ||
          request.headers['sec-fetch-site'] === 'cross-site')) {
          fail('Asal permintaan tidak diizinkan.', 403, 'FORBIDDEN')
        }
        const route = url.pathname.slice('/api/v1/'.length).replace(/\/$/, '')
        if (route === 'auth/login' && method === 'POST') {
          const { email } = parse(schemas.email, await readBody(request))
          await auth.send(email, request)
          return send(response, { sent: true })
        }
        if (route === 'auth/verify' && method === 'POST') {
          const { token } = parse(schemas.magicLink, await readBody(request))
          const user = await auth.verify(request, response, token)
          if (!user) fail('Tautan sudah digunakan atau kedaluwarsa. Minta tautan baru.', 400, 'LINK_EXPIRED')
          return send(response, { user })
        }
        if (route === 'auth/session' && method === 'GET') {
          return send(response, { user: await auth.session(request), demo: auth.demo })
        }
        if (route === 'auth/demo' && method === 'POST') {
          const body = await readBody(request)
          if (typeof body?.sample !== 'boolean') fail('Pilih jenis akun demo.')
          const existing = await auth.session(request)
          const user = auth.issueDemo(response, existing)
          if (body.sample && !existing) {
            try { await accountTransaction(database, user.id, true, tx => seedDemo(service(tx))) }
            catch (error) { response.removeHeader('Set-Cookie'); throw error }
          }
          return send(response, { user, demo: true }, 201)
        }
        if (route === 'auth/logout' && method === 'POST') {
          await auth.logout(request, response)
          return send(response, { user: null })
        }
        const user = await auth.session(request)
        if (!user) fail('Masuk dulu untuk melanjutkan.', 401, 'UNAUTHENTICATED')
        const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(request) : null
        const result = await accountTransaction(database, user.id, unsafe.has(method),
          tx => dispatch(service(tx), route, method, url, body))
        return send(response, result, method === 'POST' && ['products', 'cycles', 'categories'].includes(route) ? 201 : 200)
      }

      if (method !== 'GET' && method !== 'HEAD') fail('Halaman tidak ditemukan.', 404, 'NOT_FOUND')
      const pathname = decodeURIComponent(url.pathname)
      const file = resolve(publicPath, pathname === '/' || !extname(pathname) ? 'index.html' : `.${pathname}`)
      if (!file.startsWith(publicPath + sep)) fail('Halaman tidak ditemukan.', 404, 'NOT_FOUND')
      const info = await stat(file).catch(() => null)
      if (!info?.isFile()) fail('Halaman tidak ditemukan.', 404, 'NOT_FOUND')
      response.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': !dev && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      if (method === 'HEAD') return response.end()
      createReadStream(file).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      if (response.headersSent || response.destroyed) return response.destroy()
      const code = String(error.code ?? '')
      if (error instanceof ApiError) return send(response, { error: { code: error.code, message: error.message } }, error.status)
      if (code === '23505' || code === '23P01') return send(response, { error: { code: 'CONFLICT', message: 'Data dengan nilai yang sama sudah ada.' } }, 409)
      if (['23503', '23514', '22003', '22007'].includes(code)) return send(response, { error: { code: 'INVALID_INPUT', message: 'Data tidak memenuhi aturan penyimpanan.' } }, 400)
      log('error', { traceId, type: error.name, code: code || undefined })
      return send(response, { error: { code: 'INTERNAL', message: 'Terjadi gangguan. Coba lagi.' } }, 500)
    }
  }
}
