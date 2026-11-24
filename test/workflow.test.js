import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createAuth } from '../server/auth.js'
import { accountTransaction, openDatabase } from '../server/db.js'
import { createApp } from '../server/http.js'

test('REST dan RLS mendukung dua siklus, koreksi, dan finalisasi atomik', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'stokbulanan-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const database = await openDatabase()
  const auth = await createAuth({ demo: true, directory })
  const server = createServer(createApp({ database, auth, publicDirectory: 'dist' }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await database.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  function client() {
    let cookie
    return async (path, method = 'GET', body, expected = 200, headers = {}) => {
      const response = await fetch(`${base}/api/v1${path}`, {
        method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const supplied = response.headers.get('set-cookie')
      if (supplied) cookie = supplied.split(';', 1)[0]
      const data = await response.json()
      assert.equal(response.status, expected, `${method} ${path} ${JSON.stringify(data)}`)
      if (expected >= 400) assert.ok(data.error?.code)
      return data
    }
  }

  const api = client()
  await api('/products', 'GET', undefined, 401)
  const { user } = await api('/auth/demo', 'POST', { sample: false }, 201)
  await api('/settings', 'PATCH', { household_name: 'Dapur Kami', default_cycle_days: 30, timezone: 'Asia/Jakarta' })
  await api('/settings', 'PATCH', { safety_days: 1 }, 403, { Origin: 'https://other.example' })
  const category = await api('/categories', 'POST', { name: 'Kebutuhan Bulanan' }, 201)
  await api('/categories', 'POST', { name: 'kebutuhan bulanan' }, 409)
  const create = name => api('/products', 'POST', { name, category_id: category.id, base_unit: 'pcs',
    pack_label: 'pack', pack_size_base: 1, initial_packs: 2 }, 201)
  const soap = await create('Sabun')
  const detergent = await create('Deterjen')
  const tissue = await create('Tisu')
  const archive = await create('Pewangi')
  const a = await api('/cycles', 'POST', { start_date: '2026-11-01', end_date: '2026-11-30' }, 201)
  const b = await api('/cycles', 'POST', { start_date: '2026-12-01', end_date: '2026-12-30' }, 201)
  const overlap = await api('/cycles', 'POST', { start_date: '2026-11-30', end_date: '2026-12-10' }, 201)
  await api(`/cycles/${a.id}`, 'PATCH', { status: 'active' })
  await api(`/cycles/${overlap.id}`, 'PATCH', { status: 'active' }, 409)
  await api(`/cycles/${b.id}`, 'PATCH', { status: 'active' }, 409)
  for (const p of [soap, detergent, tissue]) await api(`/cycles/${a.id}/opening-stock`, 'POST', { product_id: p.id, qty_base: 0 })
  await api(`/cycles/${a.id}/opening-stock`, 'POST', { product_id: detergent.id, qty_base: 1 })
  const purchase = await api(`/cycles/${a.id}/purchases`, 'POST', { purchased_on: '2026-11-01', items: [
    { product_id: soap.id, qty_packs: 2, price_total_idr: 22000 },
    { product_id: detergent.id, qty_packs: 3 },
    { product_id: tissue.id, qty_packs: 5 },
    { product_id: archive.id, qty_packs: 1 },
  ] })
  const review = (p, payload, expected = 200) => api(`/cycles/${a.id}/reviews/${p.id}`, 'PUT', payload, expected)
  await review(soap, { status: 'kurang', stockout_date: '2026-10-30' }, 400)
  await review(soap, { status: 'kurang', stockout_date: '2026-11-20' })
  await review(detergent, { status: 'cukup' }, 400)
  await review(detergent, { status: 'cukup', remaining_qty_base: 5 }, 400)
  await review(detergent, { status: 'cukup', remaining_qty_base: 1 })
  await review(tissue, { status: 'berlebih', remaining_qty_base: 4 })
  await api(`/cycles/${a.id}/close`, 'POST', {})
  assert.equal((await api(`/cycles/${a.id}`)).reviews.length, 3)
  await api(`/cycles/${overlap.id}`, 'PATCH', { status: 'active' }, 409)
  const archived = await api(`/products/${archive.id}`, 'PATCH', { is_active: false })
  assert.equal(archived.category_id, category.id)
  assert.equal(Number(archived.initial_packs), 2)
  assert.equal((await api('/products?status=kurang&sort=priority'))[0].id, soap.id)
  assert.equal((await api(`/products?category=${category.id}&q=DETERJEN`)).length, 1)

  const recPath = `/cycles/${b.id}/recommendations`
  let recommendations = await api(recPath)
  assert.equal(recommendations.find(rec => rec.product_id === soap.id).suggested_packs, 3)
  assert.equal(recommendations.find(rec => rec.product_id === detergent.id).suggested_packs, 2)
  assert.equal(recommendations.find(rec => rec.product_id === tissue.id).suggested_packs, 0)
  assert.ok(!recommendations.some(rec => rec.product_id === archive.id))
  const { id: listId } = await api(`/cycles/${b.id}/shopping-list`, 'POST', {
    overrides: [{ product_id: soap.id, planned_qty_packs: 4 }],
  })
  const listPath = `/shopping-lists/${listId}`
  await review(soap, { status: 'pas' })
  recommendations = await api(recPath)
  assert.equal(recommendations.find(rec => rec.product_id === soap.id).suggested_packs, 2)
  const snapshot = await api(listPath)
  const frozen = snapshot.items.find(item => item.product_id === soap.id)
  assert.equal(Number(frozen.suggested_qty_packs), 3)
  assert.equal(Number(frozen.planned_qty_packs), 4)
  const budgeted = await api(listPath, 'PATCH', { version: snapshot.version, budget_idr: 100000 })
  assert.equal(Number(budgeted.budget_idr), 100000)
  await api(`/cycles/${b.id}/shopping-list`, 'POST', { regenerate: true, version: snapshot.version }, 409)
  const priced = await api(listPath, 'PATCH', { version: budgeted.version,
    items: [{ product_id: tissue.id, actual_qty_packs: 1, price_total_idr: 4000 }] })
  assert.equal((await api(`/cycles/${b.id}`)).planned_count, 3)
  const repriced = await api(listPath, 'PATCH', { version: priced.version,
    items: [{ product_id: tissue.id, actual_qty_packs: 2 }] })
  assert.equal(repriced.items.find(item => item.product_id === tissue.id).price_total_idr, null)

  await api(`/purchases/${purchase.items.find(item => item.product_id === detergent.id).id}`, 'PATCH',
    { qty_packs: 3, price_total_idr: 17000 })
  await api(`/products/${soap.id}`, 'PATCH', { base_unit: 'ml' }, 409)
  const armed = await api(listPath, 'PATCH', { version: repriced.version, start_shopping: true,
    items: [{ product_id: soap.id, is_checked: true, actual_qty_packs: 5, price_total_idr: 50000 },
      { product_id: detergent.id, is_checked: true }] })
  await api(listPath, 'PATCH', { version: snapshot.version, items: [] }, 409)
  const finalize = { purchased_on: '2026-12-01', version: armed.version }

  await database.run(tx => tx.exec(`
    CREATE FUNCTION stock.fail_test_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.product_id = '${detergent.id}' THEN RAISE EXCEPTION 'test rollback'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_test_insert BEFORE INSERT ON stock.purchase_items
      FOR EACH ROW EXECUTE FUNCTION stock.fail_test_insert();
  `))
  await api(`${listPath}/finalize`, 'POST', finalize, 500)
  assert.equal((await api(listPath)).status, 'shopping')
  const rolledBack = await api(`/cycles/${b.id}`)
  assert.equal(rolledBack.status, 'draft')
  assert.equal(rolledBack.purchases.length, 0)
  assert.equal(rolledBack.opening.length, 0)
  await database.run(tx => tx.exec('DROP TRIGGER fail_test_insert ON stock.purchase_items; DROP FUNCTION stock.fail_test_insert()'))

  const [first, second] = await Promise.all([api(`${listPath}/finalize`, 'POST', finalize), api(`${listPath}/finalize`, 'POST', finalize)])
  assert.equal(first.purchase_batch_id, second.purchase_batch_id)
  assert.equal(Number(first.budget_idr), 100000)
  const completed = await api(`/cycles/${b.id}`)
  assert.equal(completed.purchases.length, 2)
  assert.equal(completed.status, 'active')
  assert.equal(Number(completed.opening.find(item => item.product_id === detergent.id).qty_base), 1)
  const resized = await api(`/products/${soap.id}`, 'PATCH', { pack_size_base: 2 })
  assert.equal(resized.category_id, category.id)
  assert.equal(Number(resized.initial_packs), 2)
  let soapHistory = await api(`/products/${soap.id}/history`)
  assert.equal(Number(soapHistory.purchases[0].qty_base), 5)
  assert.equal(Number(soapHistory.purchases[0].qty_packs), 5)
  assert.equal(Number(soapHistory.purchases[0].pack_size_base_snapshot), 1)
  assert.equal(Number(soapHistory.purchases[0].price_total_idr), 50000)
  await api(`/cycles/${b.id}/purchases`, 'POST', { purchased_on: '2026-12-15', items: [{ product_id: soap.id, qty_packs: 2 }] })
  soapHistory = await api(`/products/${soap.id}/history`)
  assert.equal(Number(soapHistory.purchases[0].qty_base), 4)
  assert.equal(Number(soapHistory.purchases[1].qty_base), 5)
  assert.equal((await api(`/products/${archive.id}/history`)).purchases.length, 1)
  const catalog = await api('/products')
  assert.equal(Number(catalog.find(item => item.id === soap.id).last_qty_packs), 2)
  assert.equal(Number(catalog.find(item => item.id === tissue.id).last_qty_packs), 5)

  const other = client()
  await other('/auth/demo', 'POST', { sample: false }, 201)
  assert.deepEqual(await other('/products'), [])
  await other(`/products/${soap.id}`, 'GET', undefined, 404)
  await other(`/products/${soap.id}`, 'PATCH', { name: 'Diubah' }, 404)
  await other(`/cycles/${b.id}/opening-stock`, 'POST', { product_id: soap.id, qty_base: 1 }, 404)
  await other(`${listPath}/finalize`, 'POST', finalize, 404)
  const isolated = await accountTransaction(database, randomUUID(), false, tx => tx.rows('SELECT id FROM products'))
  assert.deepEqual(isolated, [])
  await accountTransaction(database, user.id, false, async tx => {
    assert.equal((await tx.one('SELECT count(*)::int AS total FROM purchase_batches WHERE shopping_list_id=$1', [listId])).total, 1)
    assert.equal((await tx.one('SELECT count(*)::int AS total FROM events WHERE cycle_id=$1', [a.id])).total, 1)
  })
})
