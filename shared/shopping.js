export const effectivePacks = item => Number(item.actual_qty_packs ?? item.planned_qty_packs ?? 0)
export const isSkipped = item => !item.is_checked && item.planned_qty_packs != null && effectivePacks(item) === 0

export function stepPacks(item, direction) {
  const current = Math.round(effectivePacks(item) * 1000)
  const step = Math.round(Number(item.increment_packs_snapshot) * 1000)
  return Math.max(0, current + direction * step) / 1000
}

export function shoppingSummary(items, budgetValue) {
  const summary = { planned: 0, checked: 0, unknown: 0, estimated: 0, actual: 0, cartTotal: 0 }
  for (const item of items) {
    if (!isSkipped(item)) summary.planned++
    if (!item.is_checked) continue
    summary.checked++
    if (item.price_total_idr != null) {
      summary.actual += Number(item.price_total_idr)
      summary.cartTotal += Number(item.price_total_idr)
    } else if (item.last_price_per_pack_idr != null) {
      summary.estimated++
      summary.cartTotal += Math.round(effectivePacks(item) * Number(item.last_price_per_pack_idr))
    } else summary.unknown++
  }
  const budget = budgetValue == null ? null : Number(budgetValue)
  return { ...summary, budget, remaining: budget === null ? null : budget - summary.cartTotal }
}
