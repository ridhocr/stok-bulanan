import { z } from 'zod'
import { validDate } from '../shared/dates.js'

z.config(z.locales.id())

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const fail = (message, status = 400, code = status === 409 ? 'CONFLICT' : 'INVALID_INPUT') => {
  throw new ApiError(status, code, message)
}
export function required(value) {
  if (!value) fail('Data tidak ditemukan.', 404, 'NOT_FOUND')
  return value
}
export function parse(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    fail(`${issue.path.join('.') || 'Data'} — ${issue.message}`)
  }
  return result.data
}

export const id = z.uuid({ error: 'ID tidak valid.' })
const text = max => z.string().trim().min(1, 'Wajib diisi.').max(max)
const date = z.string().refine(validDate, 'Gunakan tanggal yang valid (YYYY-MM-DD).')
const quantity = z.number().min(0).max(999999999.999).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.00015, 'Maksimal tiga angka desimal.')
const positive = quantity.refine(value => value > 0, 'Harus lebih besar dari nol.')
const price = z.number().int().min(0).max(999999999999).nullable()
const adjustment = z.strictObject({ product_id: id, planned_qty_packs: quantity.nullable() })
const timezone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('id-ID', { timeZone: value }); return /^[\w+\-/]+$/.test(value) }
  catch { return false }
}, 'Zona waktu IANA tidak valid.')

const product = z.strictObject({
  name: text(100), category_id: id.nullable(), base_unit: z.enum(['pcs', 'g', 'ml']),
  pack_label: text(30), pack_size_base: positive, purchase_increment_packs: positive,
  initial_packs: positive.nullable(), is_active: z.boolean(),
})
const cycle = z.strictObject({ start_date: date, end_date: date })

export const schemas = {
  email: z.strictObject({ email: z.string().trim().pipe(z.email().max(254)) }),
  magicLink: z.strictObject({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/, 'Tautan masuk tidak valid.') }),
  product: product.extend({
    category_id: product.shape.category_id.default(null),
    purchase_increment_packs: positive.default(1),
    initial_packs: product.shape.initial_packs.default(null),
    is_active: product.shape.is_active.default(true),
  }),
  productPatch: product.partial(),
  category: z.strictObject({ name: text(60) }),
  cycle, cyclePatch: cycle.partial().extend({ status: z.literal('active').optional() }),
  opening: z.strictObject({ product_id: id, qty_base: quantity }),
  purchases: z.strictObject({
    purchased_on: date,
    items: z.array(z.strictObject({ product_id: id, qty_packs: positive, price_total_idr: price.default(null) })).min(1).max(100),
  }),
  purchasePatch: z.strictObject({ purchased_on: date, qty_packs: positive, price_total_idr: price }).partial(),
  review: z.strictObject({
    status: z.enum(['kurang', 'pas', 'cukup', 'berlebih']),
    remaining_qty_base: quantity.nullable().default(null), stockout_date: date.nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
  }),
  generate: z.strictObject({
    regenerate: z.boolean().default(false), version: z.number().int().positive().optional(),
    overrides: z.array(adjustment).max(100).default([]),
  }),
  listPatch: z.strictObject({
    version: z.number().int().positive(),
    budget_idr: price.optional(),
    start_shopping: z.boolean().optional(),
    items: z.array(adjustment.partial({ planned_qty_packs: true }).extend({
      actual_qty_packs: positive.nullable().optional(), is_checked: z.boolean().optional(),
      price_total_idr: price.optional(), remove: z.boolean().optional(),
    })).max(100).default([]),
  }),
  finalize: z.strictObject({ purchased_on: date, version: z.number().int().positive().optional() }),
  settings: z.strictObject({
    household_name: z.string().trim().max(80), timezone,
    default_cycle_days: z.number().int().min(1).max(366), safety_days: z.number().int().min(0).max(30),
  }).partial(),
}
