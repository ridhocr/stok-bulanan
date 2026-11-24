import assert from 'node:assert/strict'
import test from 'node:test'
import { addDays, daysBetween, validDate } from '../shared/dates.js'
import { recommend } from '../server/recommendation.js'

const product = { id: 'sample', base_unit: 'pcs', pack_label: 'pack', pack_size_base: 1, purchase_increment_packs: 1 }
const old = { start_date: '2026-11-01', end_date: '2026-11-30' }
const nextCycle = { start_date: '2026-12-01', end_date: '2026-12-30' }
const observation = (status, purchased, remaining, stockout_date = null, opening = 0) => ({
  cycle: old,
  review: { status, remaining_qty_base: remaining, stockout_date },
  opening,
  purchases: [{ qty_base: purchased, purchased_on: old.start_date }],
})
const suggest = (history, verified, extra = {}) => recommend({
  product, nextCycle, history, onHand: verified == null ? null : { qty: verified, date: old.end_date }, ...extra,
})

test('durasi tanggal lokal inklusif, termasuk Februari kabisat', () => {
  assert.equal(daysBetween('2028-02-01', '2028-02-29'), 29)
  assert.equal(daysBetween('2026-02-01', '2026-02-28'), 28)
  assert.equal(daysBetween('2026-12-01', '2026-12-31'), 31)
  assert.equal(addDays('2028-02-29', 1), '2028-03-01')
  assert.equal(validDate('2026-02-29'), false)
})

test('contoh SDD dan stok yang cukup sampai siklus berikutnya', () => {
  const cases = [
    [observation('kurang', 2, 0, '2026-11-20'), 0, 3],
    [observation('pas', 2, 0), 0, 2],
    [observation('cukup', 4, 1), 1, 2],
    [observation('berlebih', 5, 2), 2, 1],
    [observation('berlebih', 5, 4), 4, 0],
  ]
  for (const [entry, verified, expected] of cases) {
    const result = suggest([entry], verified)
    assert.equal(result.suggested_packs, expected)
    assert.equal(result.confidence, 'sedang')
    assert.equal(result.baseline, false)
    assert.equal(result.verified_on_hand_base, verified)
  }
  assert.match(suggest([cases[0][0]], 0).reason, /2 pcs habis dalam 20 hari/)
})

test('pemakaian tertimbang, maksimal tiga observasi valid dan hari cadangan', () => {
  const result = suggest([
    observation('kurang', 2, 0, '2026-11-10'),
    observation('pas', 2, 0),
    observation('cukup', 5, 1, null, 1),
    observation('pas', 100, 0),
  ], 1, { safetyDays: 2 })
  assert.deepEqual(result.inputs.observations, [
    { consumed_base: 2, days_observed: 10 },
    { consumed_base: 2, days_observed: 30 },
    { consumed_base: 5, days_observed: 30 },
  ])
  assert.equal(result.target_qty_base, 5)
  assert.equal(result.suggested_packs, 4)
  assert.equal(result.confidence, 'tinggi')
})

test('pembelian setelah tanggal habis tidak masuk perhitungan pemakaian untuk tanggal itu', () => {
  const entry = observation('kurang', 2, 0, '2026-11-20')
  entry.purchases.push({ qty_base: 3, purchased_on: '2026-11-21' })
  const result = suggest([entry], 0)
  assert.equal(result.target_qty_base, 3)
  assert.equal(result.confidence, 'rendah')
})

test('kelipatan pembelian menggunakan presisi kemasan dan sisanya', () => {
  const entry = observation('pas', 210, 0)
  for (const [step, expected] of [[1, 3], [0.5, 2.5]]) {
    const result = suggest([entry], 0, { product: { ...product, base_unit: 'g', pack_size_base: 100, purchase_increment_packs: step } })
    assert.equal(result.suggested_packs, expected)
  }
})

test('data kurang memakai baseline dan menyatakan stok tidak diketahui', () => {
  const lastPurchase = { qty_base: 2 }
  const missingDate = suggest([observation('kurang', 2, 0)], null, { lastPurchase })
  assert.equal(missingDate.suggested_packs, 2)
  assert.equal(missingDate.optional_packs, 3)
  assert.equal(missingDate.verified_on_hand_base, null)
  assert.equal(missingDate.confidence, 'rendah')
  assert.equal(suggest([observation('pas', 2, 0, null, null)], 0, { lastPurchase }).baseline, true)
  assert.equal(suggest([observation('cukup', 2, 3)], 0, { lastPurchase }).baseline, true)
  assert.equal(suggest([observation('kurang', 2, 0, '2026-10-31')], 0).suggested_packs, null)
  assert.equal(suggest([], null).suggested_packs, null)
  assert.equal(suggest([], null, { product: { ...product, initial_packs: 3 } }).suggested_packs, 3)
})

test('histori valid digunakan dengan keyakinan lebih rendah jika review terakhir belum diisi', () => {
  const result = suggest([observation('pas', 2, 0)], 0, { missingLatestReview: true })
  assert.equal(result.suggested_packs, 2)
  assert.equal(result.confidence, 'rendah')
  assert.match(result.reason, /belum dinilai pada siklus terakhir/)
})
