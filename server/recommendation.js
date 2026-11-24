import { daysBetween } from '../shared/dates.js'

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })
const fmt = value => number.format(value)
const scaled = value => Math.round(Number(value) * 1000)
const ceilDiv = (value, divisor) => (value + divisor - 1n) / divisor

function observedRate(entry) {
  const { review, cycle, purchases, opening } = entry
  if (!review || opening === null) return null
  const ranOut = review.status === 'kurang'
  if (ranOut && (!review.stockout_date || review.stockout_date < cycle.start_date || review.stockout_date >= cycle.end_date)) return null
  const included = ranOut ? purchases.filter(item => item.purchased_on <= review.stockout_date) : purchases
  const used = scaled(opening) + included.reduce((sum, item) => sum + scaled(item.qty_base), 0) - scaled(review.remaining_qty_base)
  if (used < 0 || (ranOut && used === 0)) return null
  return { used, days: daysBetween(cycle.start_date, ranOut ? review.stockout_date : cycle.end_date), ranOut }
}

export function recommend({ product, nextCycle, history, onHand = null, safetyDays = 0, lastPurchase = null, allocated = 0, missingLatestReview = false }) {
  const packSize = Number(product.pack_size_base)
  const increment = Number(product.purchase_increment_packs)
  const days = daysBetween(nextCycle.start_date, nextCycle.end_date)
  const reviewed = history.filter(entry => entry.review).map(entry => ({ entry, rate: observedRate(entry) }))
  const included = []
  const observations = []
  for (const item of reviewed) {
    included.push(item)
    if (item.rate) observations.push(item.rate)
    if (observations.length === 3) break
  }
  const recent = included[0]?.entry
  const ambiguous = included.some(({ entry, rate }) => !rate ||
    (rate.ranOut && entry.purchases.some(item => item.purchased_on > entry.review.stockout_date)))
  const needsConfirmation = recent?.review.status === 'kurang' && !recent.review.stockout_date
  const verified = onHand === null ? null : Number(onHand.qty)
  const output = {
    product_id: product.id, unit: product.base_unit, pack_label: product.pack_label,
    pack_size_base: packSize, increment_packs: increment, next_cycle_days: days,
    verified_on_hand_base: verified, verified_on_hand_on: onHand?.date ?? null,
    calculation_version: 'rec-v1',
    inputs: { observations: observations.map(entry => ({ consumed_base: entry.used / 1000, days_observed: entry.days })), safety_days: safetyDays, purchased_in_cycle_base: allocated },
  }
  const packsFor = requiredMilli => Number(ceilDiv(BigInt(Math.max(0, requiredMilli)) * 1000n, BigInt(scaled(packSize)) * BigInt(scaled(increment)))) * scaled(increment) / 1000
  const stockNote = verified === null
    ? 'Stok awal belum dikonfirmasi.'
    : `Sisa terverifikasi ${fmt(verified)} ${product.base_unit}.`
  const reviewNote = missingLatestReview ? 'Produk belum dinilai pada siklus terakhir.' : ''
  if (!observations.length || verified === null || needsConfirmation) {
    const baseline = lastPurchase ? packsFor(scaled(lastPurchase.qty_base) - scaled(allocated)) :
      product.initial_packs == null ? null : packsFor(scaled(Number(product.initial_packs) * packSize) - scaled(allocated))
    const option = needsConfirmation && baseline !== null ? baseline + 1 : null
    return {
      ...output, suggested_packs: baseline, optional_packs: option === null ? null : packsFor(scaled(option * packSize)),
      confidence: 'rendah', target_qty_base: null, baseline: true,
      reason: [
        needsConfirmation ? 'Tanggal habis belum dicatat.' : '',
        baseline === null ? 'Jumlah awal belum tersedia. Isi rencana belanja.' : lastPurchase ? 'Perkiraan memakai jumlah pada belanja terakhir, disesuaikan dengan kemasan aktif.' : 'Perkiraan memakai jumlah awal produk.',
        stockNote,
        reviewNote,
        option === null ? '' : 'Pertimbangkan menambah satu kemasan setelah memeriksa stok.',
      ].filter(Boolean).join(' '),
    }
  }

  const observedDays = observations.reduce((sum, item) => sum + item.days, 0)
  const consumed = observations.reduce((sum, item) => sum + item.used, 0)
  const target = Number(ceilDiv(BigInt(consumed) * BigInt(days + safetyDays), BigInt(observedDays) * 1000n))
  const suggested = packsFor(target * 1000 - scaled(verified) - scaled(allocated))
  const observationText = observations.length === 1 && observations[0].ranOut
    ? `${fmt(consumed / 1000)} ${product.base_unit} habis dalam ${observedDays} hari.`
    : `Pemakaian tercatat ${fmt(consumed / 1000)} ${product.base_unit} selama ${observedDays} hari.`
  return {
    ...output, suggested_packs: suggested, optional_packs: null, baseline: false, target_qty_base: target,
    confidence: ambiguous || missingLatestReview ? 'rendah' : observations.length >= 2 ? 'tinggi' : 'sedang',
    reason: [
      observationText,
      `Target ${fmt(target)} ${product.base_unit} untuk ${days} hari${safetyDays ? ` dan ${safetyDays} hari cadangan` : ''}.`,
      stockNote,
      allocated > 0 ? `Sudah dibeli ${fmt(allocated)} ${product.base_unit} di siklus tujuan.` : '',
      `Saran ${fmt(suggested)} ${product.pack_label} (isi ${fmt(packSize)} ${product.base_unit}).`,
      ambiguous ? 'Sebagian histori perlu dikonfirmasi.' : '',
      reviewNote,
    ].filter(Boolean).join(' '),
  }
}
