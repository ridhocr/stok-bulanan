import { addDays, localDate } from '../shared/dates.js'

export async function seedDemo(s, now = new Date()) {
  if ((await s.products({ archived: true })).length || (await s.cycles()).length) return
  const pantry = await s.createCategory('Dapur')
  const bath = await s.createCategory('Perawatan Diri')
  const clean = await s.createCategory('Kebersihan')
  const items = [
    ['Beras', pantry, 'g', 'karung', 5000, 2, 'pas', 0, null, 148000],
    ['Deterjen cair', clean, 'ml', 'pouch', 750, 4, 'cukup', 750, null, 86000],
    ['Minyak goreng', pantry, 'ml', 'botol', 1000, 2, 'pas', 0, null, 38000],
    ['Pasta gigi', bath, 'pcs', 'tube', 1, 2, 'cukup', 1, null, 31000],
    ['Sabun mandi', bath, 'pcs', 'batang', 1, 2, 'kurang', 0, 20, 18000],
    ['Tisu dapur', clean, 'pcs', 'roll', 1, 5, 'berlebih', 3, null, 55000],
  ]
  const today = localDate('Asia/Jakarta', now)
  const currentStart = addDays(today, -18)
  const oldStart = addDays(currentStart, -30)
  const oldCycle = await s.createCycle({ start_date: oldStart, end_date: addDays(currentStart, -1) })
  await s.changeCycle(oldCycle.id, { status: 'active' })
  const products = []
  for (const [name, category, base_unit, pack_label, pack_size_base, initial_packs] of items) {
    const p = await s.saveProduct({ name, category_id: category.id, base_unit, pack_label,
      pack_size_base, initial_packs, purchase_increment_packs: 1, is_active: true })
    products.push(p)
    await s.saveOpening(oldCycle.id, { product_id: p.id, qty_base: 0 })
  }
  await s.addPurchases(oldCycle.id, { purchased_on: oldStart, items: products.map((p, i) => ({
    product_id: p.id, qty_packs: items[i][5], price_total_idr: items[i][9],
  })) })
  for (const [i, p] of products.entries()) {
    const [, , , , , , status, remaining_qty_base, day] = items[i]
    await s.saveReview(oldCycle.id, p.id, { status, remaining_qty_base, stockout_date: day ? addDays(oldStart, day - 1) : null, note: null })
  }
  await s.closeCycle(oldCycle.id)
  const current = await s.createCycle({ start_date: currentStart, end_date: addDays(currentStart, 29) })
  await s.generateList(current.id, { regenerate: false, overrides: [] })
  const listId = (await s.cycles()).find(c => c.id === current.id).shopping_list_id
  await s.changeList(listId, { version: 1, start_shopping: true, items: products.slice(0, 3).map(p => ({
    product_id: p.id, is_checked: true,
  })) })
  await s.finalize(listId, { purchased_on: currentStart })
  await s.saveReview(current.id, products[0].id, { status: 'pas', remaining_qty_base: 0, stockout_date: null, note: null })
  await s.saveReview(current.id, products[4].id, { status: 'kurang', remaining_qty_base: 0, stockout_date: null, note: 'Perlu cek tanggal habis.' })
  await s.createCycle({ start_date: addDays(currentStart, 30), end_date: addDays(currentStart, 59) })
}
