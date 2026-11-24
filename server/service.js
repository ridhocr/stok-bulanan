import { addDays, daysBetween } from '../shared/dates.js'
import { recommend } from './recommendation.js'
import { fail, required } from './validation.js'

export const defaults = { household_name: '', timezone: 'Asia/Jakarta', default_cycle_days: 30, safety_days: 0 }

const asNumber = value => value == null ? null : Number(value)
const milli = value => Math.round(Number(value) * 1000)
const sumBase = items => items.reduce((sum, item) => sum + milli(item.qty_base), 0) / 1000
const distinct = (items, key) => {
  if (new Set(items.map(item => item[key])).size !== items.length) fail('Produk yang sama hanya boleh muncul sekali.')
}
function checkPack(qty, increment, size) {
  if (qty === null) return
  if (milli(qty) % milli(increment) !== 0) fail(`Jumlah harus kelipatan ${Number(increment)} kemasan.`)
  if (qty > 0 && (milli(qty * size) === 0 || qty * size > 999999999.999)) fail('Jumlah dalam satuan dasar di luar batas yang didukung.')
}
function checkUnit(qty, unit) {
  if (unit === 'pcs' && !Number.isInteger(qty)) fail('Jumlah dalam pcs harus berupa bilangan bulat.')
}
function checkInCycle(date, cycle) {
  if (date < cycle.start_date || date > cycle.end_date) fail('Tanggal pembelian harus berada dalam siklus.')
}
function checkCycleDates(cycle) {
  const days = daysBetween(cycle.start_date, cycle.end_date)
  if (days < 1 || days > 366) fail('Durasi siklus harus antara 1 dan 366 hari.')
}
const purchaseSelect = `
  SELECT pi.id, pi.user_id, pi.batch_id, pi.product_id, pi.qty_packs, pi.qty_base, pi.price_total_idr,
    pi.pack_size_base_snapshot, pi.pack_label_snapshot, pi.increment_packs_snapshot, pi.created_at,
    greatest(pi.updated_at, pb.updated_at) AS updated_at,
    pb.purchased_on, pb.cycle_id, pb.source, pb.shopping_list_id, purchased_product.name, purchased_product.base_unit
  FROM purchase_items pi JOIN purchase_batches pb ON pb.id = pi.batch_id
  JOIN products purchased_product ON purchased_product.id = pi.product_id
`
const productSelect = `
  SELECT p.*, c.name AS category_name, r.status AS latest_status, r.cycle_id AS latest_review_cycle_id,
    COALESCE(r.shortage_count, 0)::int AS shortage_count,
    b.qty_packs AS last_qty_packs, b.pack_label_snapshot AS last_pack_label,
    b.purchased_on AS last_purchased_on
  FROM products p LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN LATERAL (
    SELECT r.status, r.cycle_id, count(*) FILTER (WHERE r.status = 'kurang') OVER () AS shortage_count
    FROM cycle_reviews r JOIN cycles cy ON cy.id = r.cycle_id
    WHERE r.product_id = p.id ORDER BY cy.end_date DESC, r.updated_at DESC LIMIT 1
  ) r ON true
  LEFT JOIN LATERAL (
    ${purchaseSelect} WHERE pi.product_id = p.id ORDER BY pb.purchased_on DESC, pi.created_at DESC LIMIT 1
  ) b ON true
`
const cycleSelect = `
  SELECT c.*, l.id AS shopping_list_id, l.status AS shopping_status, l.version AS shopping_version,
    (SELECT count(*)::int FROM cycle_reviews r WHERE r.cycle_id = c.id) AS reviewed_count,
    (SELECT count(*)::int FROM shopping_list_items i WHERE i.shopping_list_id = l.id AND i.is_checked) AS checked_count,
    (SELECT count(*)::int FROM shopping_list_items i WHERE i.shopping_list_id = l.id AND coalesce(i.actual_qty_packs, i.planned_qty_packs, 1) > 0) AS planned_count
  FROM cycles c LEFT JOIN shopping_lists l ON l.cycle_id = c.id
`

export function service({ rows, one }) {
  const product = async id => required(await one(`${productSelect} WHERE p.id = $1`, [id]))
  const cycle = async id => required(await one('SELECT * FROM cycles WHERE id = $1', [id]))
  const list = async id => required(await one('SELECT * FROM shopping_lists WHERE id = $1', [id]))
  const settings = async () => (await one('SELECT * FROM profiles')) ?? defaults
  const categories = () => rows('SELECT * FROM categories ORDER BY sort_order, lower(name)')
  const purchases = (cycleId, productId = null) => rows(`${purchaseSelect}
    WHERE pb.cycle_id = $1 AND ($2::uuid IS NULL OR pi.product_id = $2)
    ORDER BY pb.purchased_on DESC, pi.created_at DESC`, [cycleId, productId])
  const opening = (cycleId, productId) => one('SELECT * FROM cycle_opening_stock WHERE cycle_id = $1 AND product_id = $2', [cycleId, productId])
  const cycleReview = (cycleId, productId) => one('SELECT * FROM cycle_reviews WHERE cycle_id = $1 AND product_id = $2', [cycleId, productId])

  async function products({ q = '', category = null, status = null, archived = false, sort = 'name' } = {}) {
    const order = sort === 'priority'
      ? "CASE r.status WHEN 'kurang' THEN 0 WHEN 'berlebih' THEN 1 WHEN 'cukup' THEN 2 WHEN 'pas' THEN 3 ELSE 4 END, lower(p.name)"
      : 'lower(p.name)'
    return rows(`${productSelect}
      WHERE ($1 OR p.is_active) AND strpos(lower(p.name), lower($2)) > 0
        AND ($3::uuid IS NULL OR p.category_id = $3)
        AND ($4::text IS NULL OR COALESCE(r.status::text, 'belum') = $4)
      ORDER BY ${order}, p.id`, [archived, q, category, status])
  }

  async function saveProduct(input, id) {
    const current = id ? await product(id) : null
    const data = { ...current, ...input }
    if (current && current.base_unit !== data.base_unit) {
      const used = await one(`SELECT 1 FROM purchase_items WHERE product_id = $1
        UNION ALL SELECT 1 FROM cycle_reviews WHERE product_id = $1
        UNION ALL SELECT 1 FROM cycle_opening_stock WHERE product_id = $1
        UNION ALL SELECT 1 FROM shopping_list_items WHERE product_id = $1 LIMIT 1`, [id])
      if (used) fail('Satuan dasar terkunci setelah produk dipakai.', 409)
    }
    checkUnit(Number(data.pack_size_base), data.base_unit)
    if (data.base_unit === 'pcs') checkUnit(Number(data.purchase_increment_packs), 'pcs')
    checkPack(data.initial_packs, data.purchase_increment_packs, data.pack_size_base)
    if (data.category_id) required(await one('SELECT id FROM categories WHERE id = $1', [data.category_id]))
    const values = [data.name, data.category_id, data.base_unit, data.pack_label, data.pack_size_base, data.purchase_increment_packs, data.initial_packs, data.is_active]
    return id ? one(`UPDATE products SET name=$1, category_id=$2, base_unit=$3, pack_label=$4,
      pack_size_base=$5, purchase_increment_packs=$6, initial_packs=$7, is_active=$8, updated_at=now()
      WHERE id=$9 RETURNING *`, [...values, id]) : one(`INSERT INTO products
      (name, category_id, base_unit, pack_label, pack_size_base, purchase_increment_packs, initial_packs, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, values)
  }

  async function saveSettings(input) {
    const updated = { ...await settings(), ...input }
    return one(`UPDATE profiles SET household_name=$1, timezone=$2, default_cycle_days=$3, safety_days=$4, updated_at=now()
      RETURNING *`, [updated.household_name, updated.timezone, updated.default_cycle_days, updated.safety_days])
  }

  async function createCycle(input) {
    checkCycleDates(input)
    return one('INSERT INTO cycles (start_date, end_date) VALUES ($1,$2) RETURNING *', [input.start_date, input.end_date])
  }

  async function checkOverlap(candidate) {
    if (await one(`SELECT id FROM cycles WHERE id <> $1 AND status <> 'draft'
      AND start_date <= $3 AND end_date >= $2 LIMIT 1`, [candidate.id, candidate.start_date, candidate.end_date])) {
      fail('Tanggal bertumpang tindih dengan siklus aktif atau siklus yang sudah ditutup.', 409)
    }
  }

  async function carryFor(candidate) {
    return rows(`SELECT r.product_id, r.remaining_qty_base, c.end_date
      FROM cycle_reviews r JOIN cycles c ON c.id = r.cycle_id
      WHERE c.status='closed' AND c.end_date = $1::date - 1
        AND (r.status <> 'kurang' OR NOT EXISTS (
          SELECT FROM purchase_items i JOIN purchase_batches b ON b.id=i.batch_id
          WHERE b.cycle_id=c.id AND i.product_id=r.product_id
            AND (r.stockout_date IS NULL OR b.purchased_on > r.stockout_date)
        ))`, [candidate.start_date])
  }

  async function activate(candidate) {
    await checkOverlap(candidate)
    if (await one("SELECT id FROM cycles WHERE status = 'active' AND id <> $1", [candidate.id])) {
      fail('Tutup siklus aktif sebelum mengaktifkan periode berikutnya.', 409)
    }
    const carry = await carryFor(candidate)
    if (carry.length) {
      await rows(`INSERT INTO cycle_opening_stock (cycle_id, product_id, qty_base, source)
        SELECT $1, item.product_id, item.remaining_qty_base, 'carried'
        FROM jsonb_to_recordset($2::jsonb) AS item(product_id uuid, remaining_qty_base numeric)
        ON CONFLICT DO NOTHING`, [candidate.id, JSON.stringify(carry)])
    }
    return one("UPDATE cycles SET status='active' WHERE id=$1 RETURNING *", [candidate.id])
  }

  async function changeCycle(id, input) {
    const current = await cycle(id)
    if (input.status === 'active' && current.status === 'active' && !input.start_date && !input.end_date) return current
    if (current.status !== 'draft') fail('Tanggal hanya bisa diubah pada draf siklus.', 409)
    const candidate = { ...current, ...input }
    checkCycleDates(candidate)
    const newDates = candidate.start_date !== current.start_date || candidate.end_date !== current.end_date
    if (newDates && await one('SELECT id FROM shopping_lists WHERE cycle_id=$1', [id])) {
      fail('Regenerasi daftar setelah menghapus daftar draf untuk mengubah tanggal siklus.', 409)
    }
    await rows('UPDATE cycles SET start_date=$1, end_date=$2 WHERE id=$3', [candidate.start_date, candidate.end_date, id])
    return input.status === 'active' ? activate(candidate) : cycle(id)
  }

  async function validateReview(data, p, c, start, transactions) {
    const hasRemainder = data.status === 'cukup' || data.status === 'berlebih'
    const remaining = hasRemainder ? asNumber(data.remaining_qty_base) : 0
    if (hasRemainder && !(remaining > 0)) fail('Masukkan sisa aktual lebih besar dari nol.')
    if (!hasRemainder && Number(data.remaining_qty_base) !== 0) fail('Sisa untuk Kurang atau Pas harus nol.')
    if (data.stockout_date && data.status !== 'kurang') fail('Tanggal habis hanya berlaku untuk status Kurang.')
    if (data.stockout_date && (data.stockout_date < c.start_date || data.stockout_date >= c.end_date)) {
      fail('Tanggal habis harus berada dalam siklus dan sebelum tanggal akhir.')
    }
    const stock = Number(start?.qty_base ?? 0)
    checkUnit(remaining, p.base_unit)
    if (milli(remaining) > milli(stock) + milli(sumBase(transactions))) {
      fail('Sisa melebihi stok tercatat. Periksa pembelian atau isi stok awal.')
    }
    if (data.stockout_date && start && stock + sumBase(transactions.filter(item => item.purchased_on <= data.stockout_date)) <= 0) {
      fail('Belum ada stok yang tercatat sebelum tanggal habis.')
    }
    return remaining
  }

  async function verifyExisting(p, c) {
    const review = await cycleReview(c.id, p.id)
    if (review) await validateReview(review, p, c, await opening(c.id, p.id), await purchases(c.id, p.id))
  }

  async function saveOpening(cycleId, input) {
    const c = await cycle(cycleId)
    const p = await product(input.product_id)
    checkUnit(input.qty_base, p.base_unit)
    const value = await one(`INSERT INTO cycle_opening_stock (cycle_id, product_id, qty_base, source)
      VALUES ($1,$2,$3,'manual') ON CONFLICT (cycle_id, product_id) DO UPDATE
      SET qty_base=excluded.qty_base, source='manual', recorded_at=now() RETURNING *`, [c.id, p.id, input.qty_base])
    await verifyExisting(p, c)
    return value
  }

  function insertPurchases(batchId, items) {
    return rows(`INSERT INTO purchase_items (batch_id, product_id, qty_packs, pack_size_base_snapshot,
      pack_label_snapshot, increment_packs_snapshot, price_total_idr)
      SELECT $1, x.product_id, x.qty_packs, x.pack_size_base_snapshot, x.pack_label_snapshot, x.increment_packs_snapshot, x.price_total_idr
      FROM jsonb_to_recordset($2::jsonb) AS x(product_id uuid, qty_packs numeric, pack_size_base_snapshot numeric,
        pack_label_snapshot text, increment_packs_snapshot numeric, price_total_idr bigint) RETURNING *`, [batchId, JSON.stringify(items)])
  }

  async function addPurchases(cycleId, input) {
    const c = await cycle(cycleId)
    if (c.status !== 'active') fail('Aktifkan siklus untuk mencatat pembelian baru.', 409)
    checkInCycle(input.purchased_on, c)
    distinct(input.items, 'product_id')
    const byId = new Map((await rows('SELECT * FROM products WHERE id = ANY($1::uuid[])', [input.items.map(item => item.product_id)])).map(p => [p.id, p]))
    const items = input.items.map(item => {
      const p = required(byId.get(item.product_id))
      if (!p.is_active) fail('Aktifkan kembali produk yang diarsipkan untuk mencatat pembelian.', 409)
      checkPack(item.qty_packs, p.purchase_increment_packs, p.pack_size_base)
      return { ...item, pack_size_base_snapshot: p.pack_size_base, pack_label_snapshot: p.pack_label, increment_packs_snapshot: p.purchase_increment_packs }
    })
    const batch = await one("INSERT INTO purchase_batches (cycle_id, purchased_on, source) VALUES ($1,$2,'manual') RETURNING *", [c.id, input.purchased_on])
    return { ...batch, items: await insertPurchases(batch.id, items) }
  }

  async function editPurchase(id, input) {
    const item = required(await one(`${purchaseSelect} WHERE pi.id=$1`, [id]))
    const c = await cycle(item.cycle_id)
    const data = { ...item, ...input }
    checkPack(data.qty_packs, item.increment_packs_snapshot, item.pack_size_base_snapshot)
    if (input.purchased_on && input.purchased_on !== item.purchased_on) {
      checkInCycle(input.purchased_on, c)
      await rows('UPDATE purchase_batches SET purchased_on=$1, updated_at=now() WHERE id=$2', [input.purchased_on, item.batch_id])
    }
    const saved = await one('UPDATE purchase_items SET qty_packs=$1, price_total_idr=$2, updated_at=now() WHERE id=$3 RETURNING *', [data.qty_packs, data.price_total_idr, id])
    const affected = await rows('SELECT p.* FROM purchase_items i JOIN products p ON p.id=i.product_id WHERE i.batch_id=$1', [item.batch_id])
    for (const p of affected) await verifyExisting(p, c)
    return saved
  }

  async function saveReview(cycleId, productId, input) {
    const c = await cycle(cycleId)
    if (c.status === 'draft') fail('Aktifkan siklus sebelum menyimpan ulasan.', 409)
    const p = await product(productId)
    const remaining = await validateReview(input, p, c, await opening(c.id, p.id), await purchases(c.id, p.id))
    return one(`INSERT INTO cycle_reviews (cycle_id,product_id,status,remaining_qty_base,stockout_date,note)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cycle_id,product_id) DO UPDATE
      SET status=excluded.status, remaining_qty_base=excluded.remaining_qty_base,
        stockout_date=excluded.stockout_date, note=excluded.note, updated_at=now() RETURNING *`,
    [c.id, p.id, input.status, remaining, input.stockout_date, input.note])
  }

  async function closeCycle(id) {
    const c = await cycle(id)
    if (c.status === 'closed') return c
    if (c.status !== 'active') fail('Hanya siklus aktif yang dapat ditutup.', 409)
    checkCycleDates(c)
    const snapshot = await one(`SELECT count(*)::int AS reviewed, (SELECT count(*)::int FROM products WHERE is_active) AS active_products
      FROM cycle_reviews WHERE cycle_id=$1`, [id])
    const closed = await one("UPDATE cycles SET status='closed', closed_at=now() WHERE id=$1 RETURNING *", [id])
    await rows("INSERT INTO events (cycle_id,name,details) VALUES ($1,'cycle_review_completed',$2)", [id, JSON.stringify(snapshot)])
    return closed
  }

  async function getCycle(id) {
    required(await cycle(id))
    const details = await one(`${cycleSelect} WHERE c.id=$1`, [id])
    const openingStock = await rows('SELECT * FROM cycle_opening_stock WHERE cycle_id=$1', [id])
    const reviews = await rows('SELECT * FROM cycle_reviews WHERE cycle_id=$1 ORDER BY updated_at DESC', [id])
    return { ...details, opening: openingStock, reviews, purchases: await purchases(id) }
  }

  async function history(productId) {
    const p = await product(productId)
    return {
      product: p,
      purchases: await rows(`${purchaseSelect} WHERE pi.product_id=$1 ORDER BY pb.purchased_on DESC, pi.created_at DESC`, [p.id]),
      reviews: await rows(`SELECT r.*, c.start_date, c.end_date FROM cycle_reviews r JOIN cycles c ON c.id=r.cycle_id
        WHERE r.product_id=$1 ORDER BY c.end_date DESC`, [p.id]),
      recommendations: await rows(`SELECT i.*, c.start_date, c.end_date, l.generated_at, l.status AS list_status
        FROM shopping_list_items i JOIN shopping_lists l ON l.id=i.shopping_list_id JOIN cycles c ON c.id=l.cycle_id
        WHERE i.product_id=$1 ORDER BY c.start_date DESC`, [p.id]),
    }
  }

  async function recommendations(cycleId) {
    const nextCycle = await cycle(cycleId)
    const activeProducts = await products()
    const profile = await settings()
    const latestClosed = await one("SELECT id FROM cycles WHERE status='closed' AND end_date < $1 ORDER BY end_date DESC LIMIT 1", [nextCycle.start_date])
    const historic = await rows(`SELECT r.product_id, r.status, r.stockout_date, r.remaining_qty_base,
      c.start_date, c.end_date, c.id AS cycle_id, o.qty_base AS opening
      FROM cycle_reviews r JOIN cycles c ON c.id=r.cycle_id JOIN products p ON p.id=r.product_id AND p.is_active
      LEFT JOIN cycle_opening_stock o ON o.cycle_id=c.id AND o.product_id=r.product_id
      WHERE c.end_date < $1 AND c.status='closed' ORDER BY c.end_date DESC`, [nextCycle.start_date])
    const transactions = await rows(`${purchaseSelect} WHERE pb.purchased_on < $1 AND pb.cycle_id <> $2
      ORDER BY pb.purchased_on DESC, pi.created_at DESC`, [nextCycle.start_date, cycleId])
    const plannedPeriod = await purchases(cycleId)
    const targetOpening = new Map((await rows('SELECT * FROM cycle_opening_stock WHERE cycle_id=$1', [cycleId])).map(item => [item.product_id, item]))
    const carried = new Map((nextCycle.status === 'draft' ? await carryFor(nextCycle) : []).map(item => [item.product_id, item]))
    const grouped = Map.groupBy(transactions, item => item.product_id)
    const byCycleProduct = Map.groupBy(transactions, item => `${item.cycle_id}/${item.product_id}`)
    const historicByProduct = Map.groupBy(historic, item => item.product_id)
    const currentByProduct = Map.groupBy(plannedPeriod, item => item.product_id)
    return activeProducts.map(p => {
      const previous = grouped.get(p.id) ?? []
      const target = targetOpening.get(p.id)
      const prior = carried.get(p.id)
      const onHand = target ? { qty: target.qty_base, date: target.source === 'carried' ? addDays(nextCycle.start_date, -1) : nextCycle.start_date } :
        prior ? { qty: prior.remaining_qty_base, date: prior.end_date } : null
      const relevant = (historicByProduct.get(p.id) ?? []).map(item => ({
        review: item, cycle: item, opening: item.opening,
        purchases: byCycleProduct.get(`${item.cycle_id}/${p.id}`) ?? [],
      }))
      const lastPurchase = previous[0] ?? null
      const lastPriced = previous.find(item => item.price_total_idr != null)
      const packPrice = lastPriced ? Math.round(Number(lastPriced.price_total_idr) / Number(lastPriced.qty_base) * Number(p.pack_size_base)) : null
      return {
        ...recommend({ product: p, nextCycle, history: relevant, onHand, safetyDays: profile.safety_days,
          lastPurchase, allocated: sumBase(currentByProduct.get(p.id) ?? []),
          missingLatestReview: Boolean(latestClosed && relevant[0]?.cycle.cycle_id !== latestClosed.id) }),
        name: p.name, category_name: p.category_name, category_id: p.category_id,
        last_price_per_pack_idr: Number.isSafeInteger(packPrice) ? packPrice : null,
      }
    })
  }

  async function getList(id) {
    const summary = await list(id)
    const items = await rows(`SELECT i.*, p.name, p.base_unit, c.name AS category_name, p.category_id,
      (i.pack_size_base_snapshot <> p.pack_size_base OR i.pack_label_snapshot <> p.pack_label OR
       i.increment_packs_snapshot <> p.purchase_increment_packs) AS pack_changed
      FROM shopping_list_items i JOIN products p ON p.id=i.product_id
      LEFT JOIN categories c ON c.id=p.category_id WHERE i.shopping_list_id=$1 ORDER BY lower(p.name)`, [id])
    return { ...summary, items, cycle: await cycle(summary.cycle_id) }
  }

  async function generateList(cycleId, input) {
    const c = await cycle(cycleId)
    if (c.status === 'closed') fail('Siklus sudah ditutup.', 409)
    const existing = await one('SELECT * FROM shopping_lists WHERE cycle_id=$1', [cycleId])
    if (existing && (!input.regenerate || existing.status === 'finalized')) fail('Daftar sudah tersedia untuk siklus ini.', 409)
    if (existing && existing.version !== input.version) fail('Daftar berubah. Muat ulang sebelum regenerasi.', 409)
    distinct(input.overrides, 'product_id')
    const results = await recommendations(cycleId)
    if (!results.length) fail('Tambahkan produk aktif sebelum membuat daftar.')
    const byId = new Map(results.map(item => [item.product_id, item]))
    for (const override of input.overrides) required(byId.get(override.product_id))
    const overrides = new Map(input.overrides.map(item => [item.product_id, item.planned_qty_packs]))
    const items = results.map(item => {
      const planned = overrides.has(item.product_id) ? overrides.get(item.product_id) : item.suggested_packs
      checkPack(planned, item.increment_packs, item.pack_size_base)
      return { ...item, planned, recommendation: item }
    })
    const saved = existing ?? await one('INSERT INTO shopping_lists (cycle_id) VALUES ($1) RETURNING *', [cycleId])
    if (existing) {
      await rows('DELETE FROM shopping_list_items WHERE shopping_list_id=$1', [saved.id])
      await rows("UPDATE shopping_lists SET generated_at=now(), version=version+1, status='draft' WHERE id=$1", [saved.id])
    }
    await rows(`INSERT INTO shopping_list_items (shopping_list_id,product_id,suggested_qty_packs,planned_qty_packs,
      confidence,reason_text,recommendation,pack_size_base_snapshot,pack_label_snapshot,increment_packs_snapshot,last_price_per_pack_idr)
      SELECT $1, x.product_id, x.suggested_packs, x.planned, x.confidence, x.reason, x.recommendation, x.pack_size_base,
        x.pack_label, x.increment_packs, x.last_price_per_pack_idr
      FROM jsonb_to_recordset($2::jsonb) AS x(product_id uuid, suggested_packs numeric, planned numeric,
        confidence text, reason text, recommendation jsonb, pack_size_base numeric, pack_label text, increment_packs numeric, last_price_per_pack_idr bigint)`,
    [saved.id, JSON.stringify(items)])
    return getList(saved.id)
  }

  async function changeList(id, input) {
    const current = await getList(id)
    if (current.status === 'finalized') fail('Daftar sudah difinalisasi.', 409)
    if (current.cycle.status === 'closed') fail('Siklus sudah ditutup.', 409)
    if (current.version !== input.version) fail('Daftar berubah. Muat ulang sebelum menyimpan.', 409)
    const byId = new Map(current.items.map(item => [item.product_id, item]))
    distinct(input.items, 'product_id')
    for (const patch of input.items) {
      const item = required(byId.get(patch.product_id))
      if (patch.remove) {
        await rows('DELETE FROM shopping_list_items WHERE id=$1', [item.id])
      } else {
        const next = { ...item, ...patch }
        checkPack(next.planned_qty_packs, item.increment_packs_snapshot, item.pack_size_base_snapshot)
        checkPack(next.actual_qty_packs, item.increment_packs_snapshot, item.pack_size_base_snapshot)
        if (patch.price_total_idr === undefined && Number(next.actual_qty_packs ?? next.planned_qty_packs) !== Number(item.actual_qty_packs ?? item.planned_qty_packs)) {
          next.price_total_idr = null
        }
        if (next.is_checked && Number(next.actual_qty_packs ?? next.planned_qty_packs) <= 0) {
          if (patch.is_checked) fail('Isi jumlah beli sebelum mencentang barang.')
          next.is_checked = false
        }
        await rows(`UPDATE shopping_list_items SET planned_qty_packs=$1, actual_qty_packs=$2,
          is_checked=$3,price_total_idr=$4 WHERE id=$5`,
        [next.planned_qty_packs, next.actual_qty_packs, next.is_checked, next.price_total_idr, item.id])
      }
    }
    const start = input.start_shopping || input.items.some(item => item.is_checked)
    const budget = input.budget_idr === undefined ? current.budget_idr : input.budget_idr
    await rows('UPDATE shopping_lists SET status=$1, budget_idr=$2, version=version+1 WHERE id=$3', [start ? 'shopping' : current.status, budget, id])
    return getList(id)
  }

  async function removeList(id) {
    const current = await list(id)
    if (current.status === 'finalized') fail('Daftar sudah difinalisasi.', 409)
    return one('DELETE FROM shopping_lists WHERE id=$1 RETURNING id', [id])
  }

  async function finalize(id, input) {
    const current = await getList(id)
    if (current.status === 'finalized') {
      return { ...current, purchase_batch_id: (await one('SELECT id FROM purchase_batches WHERE shopping_list_id=$1', [id])).id }
    }
    if (input.version !== undefined && current.version !== input.version) fail('Daftar berubah. Muat ulang sebelum finalisasi.', 409)
    checkInCycle(input.purchased_on, current.cycle)
    if (current.cycle.status === 'closed') fail('Siklus sudah ditutup.', 409)
    const checked = current.items.filter(item => item.is_checked)
    if (!checked.length) fail('Centang setidaknya satu barang yang dibeli.')
    if (checked.some(item => item.pack_changed)) fail('Kemasan produk yang dicentang berubah. Regenerasi daftar sebelum finalisasi.', 409)
    if (current.cycle.status === 'draft') await activate(current.cycle)
    const batch = await one(`INSERT INTO purchase_batches (cycle_id,purchased_on,source,shopping_list_id)
      VALUES ($1,$2,'shopping_list',$3) RETURNING id`, [current.cycle_id, input.purchased_on, id])
    await insertPurchases(batch.id, checked.map(item => ({ ...item, qty_packs: item.actual_qty_packs ?? item.planned_qty_packs })))
    await rows("UPDATE shopping_lists SET status='finalized', finalized_at=now(), version=version+1 WHERE id=$1", [id])
    return { ...await getList(id), purchase_batch_id: batch.id }
  }

  return {
    settings, saveSettings, products, product, saveProduct, history,
    categories, createCategory: name => one('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]),
    cycles: () => rows(`${cycleSelect} ORDER BY c.start_date DESC, c.created_at DESC`),
    cycle: getCycle, createCycle, changeCycle, saveOpening, addPurchases, editPurchase,
    saveReview, closeCycle, recommendations,
    getList, generateList, changeList, removeList, finalize,
  }
}
