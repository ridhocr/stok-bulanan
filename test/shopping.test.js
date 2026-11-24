import assert from 'node:assert/strict'
import test from 'node:test'
import { isSkipped, shoppingSummary, stepPacks } from '../shared/shopping.js'

test('langkah jumlah belanja mengikuti kelipatan pecahan dan memakai aktual jika ada', () => {
  const item = { planned_qty_packs: '2', actual_qty_packs: '0.3', increment_packs_snapshot: '0.1' }
  assert.equal(stepPacks(item, 1), 0.4)
  assert.equal(stepPacks(item, -1), 0.2)
  assert.equal(stepPacks({ ...item, actual_qty_packs: '0.1' }, -1), 0)
  assert.equal(isSkipped({ planned_qty_packs: '0', actual_qty_packs: '1' }), false)
  assert.equal(isSkipped({ planned_qty_packs: null }), false)
  assert.equal(isSkipped({ planned_qty_packs: '0' }), true)
})

test('anggaran menghitung barang dicentang, harga perkiraan, dan barang tanpa harga', () => {
  const items = [
    { is_checked: true, planned_qty_packs: '0', actual_qty_packs: '2', price_total_idr: '50000', last_price_per_pack_idr: '1000' },
    { is_checked: true, planned_qty_packs: '2', actual_qty_packs: '3', last_price_per_pack_idr: '7000' },
    { is_checked: true, planned_qty_packs: '1' },
    { is_checked: false, planned_qty_packs: '2', price_total_idr: '10000' },
    { is_checked: false, planned_qty_packs: '0' },
  ]
  assert.deepEqual(shoppingSummary(items, '70000'), {
    planned: 4, checked: 3, estimated: 1, unknown: 1, actual: 50000, cartTotal: 71000, budget: 70000, remaining: -1000,
  })
  assert.equal(shoppingSummary([], null).remaining, null)
})
