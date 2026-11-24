import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle, ShoppingBasket as Basket, ChevronDown, Droplets, Package, PackageOpen, Wheat, X } from 'lucide-react'
import { addDays, daysBetween, localDate } from '../shared/dates.js'

export const labels = { kurang: 'Kurang', pas: 'Pas', cukup: 'Cukup', berlebih: 'Berlebih', belum: 'Belum dinilai' }
export const cycleLabels = { draft: 'Draf', active: 'Aktif', closed: 'Ditutup' }
export const listLabels = { draft: 'Draf', shopping: 'Sedang belanja', finalized: 'Selesai' }
export const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
export const qty = value => value == null ? '—' : number.format(Number(value))
export const money = value => value == null ? '—' : currency.format(value)
export const date = value => value ? dateFormat.format(new Date(value)) : '—'
export const period = c => c ? `${dayFormat.format(new Date(c.start_date))} – ${date(c.end_date)}` : '—'
export const go = path => { window.location.hash = path }

export function inRange(cycle, timezone) {
  const today = localDate(timezone)
  return today < cycle.start_date ? cycle.start_date : today > cycle.end_date ? cycle.end_date : today
}

export function suggestedDates(cycles, settings) {
  const latest = cycles.find(c => c.status !== 'draft')
  const today = localDate(settings.timezone)
  const start = latest ? addDays(latest.end_date, 1) : today
  return { start, end: addDays(start, settings.default_cycle_days - 1) }
}

export async function api(path, method = 'GET', data) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  }).catch(() => { throw new Error('Koneksi terputus. Periksa jaringan dan coba lagi.') })
  const json = await response.json().catch(() => null)
  if (!response.ok || json === null) {
    if (response.status === 401) window.dispatchEvent(new Event('stokbulanan:session-expired'))
    const error = new Error(json?.error?.message ?? 'Server belum bisa merespons. Coba lagi.')
    error.status = response.status
    throw error
  }
  return json
}

export function useResource(path, version = 0) {
  const [state, setState] = useState({ data: null, error: null, path: null })
  useEffect(() => {
    let live = true
    if (path) {
      api(path).then(data => { if (live) setState({ data, error: null, path }) })
        .catch(error => { if (live) setState(previous => ({ data: previous.path === path ? previous.data : null, error, path })) })
    }
    return () => { live = false }
  }, [path, version])
  return state.path === path ? state : { data: null, error: null }
}

export function Brand() {
  return <div className="brand"><span className="brand-icon"><Basket size={22} strokeWidth={2.2} /></span><span>Stok<span>Bulanan</span></span></div>
}

const unitMarks = { g: [Wheat, 'amber'], ml: [Droplets, 'mint'], pcs: [Package, 'leaf'] }

export function ProductMark({ unit }) {
  const [Icon, tone] = unitMarks[unit] ?? unitMarks.pcs
  return <span className={`icon-box ${tone}`} aria-hidden="true"><Icon size={19} /></span>
}

export function Badge({ status, children }) {
  return <span className={`badge badge-${status ?? 'belum'}`}>{children ?? labels[status] ?? labels.belum}</span>
}

export function Button({ children, icon: Icon, className = '', variant = 'secondary', ...props }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</button>
}

export function ActionLink({ children, to, icon: Icon, variant = 'secondary', className = '' }) {
  return <a className={`button ${variant} ${className}`} href={`#${to}`}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</a>
}

export function SectionHead({ title, description, actions }) {
  return <div className="page-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="actions">{actions}</div>}
  </div>
}

export function Panel({ title, description, action, className = '', children }) {
  return <section className={`panel ${className}`}>
    {(title || action) && <div className="panel-head"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}
    {children}
  </section>
}

export function Empty({ title, description, action, icon: Icon = PackageOpen }) {
  return <div className="empty"><span className="icon-box neutral"><Icon size={22} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}

export function ErrorBox({ error }) {
  return error && <div className="error-box" role="alert"><AlertCircle size={18} />{error.message ?? error}</div>
}

export function Loading() {
  return <div className="loading" role="status"><span />Memuat data…</div>
}

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function Select({ children, ...props }) {
  return <span className="select-wrap"><select {...props}>{children}</select><ChevronDown size={16} /></span>
}

export function Progress({ value, max, label = 'Progres' }) {
  return <progress className="progress" aria-label={label} value={Math.min(value, max || 1)} max={max || 1} />
}

export function Dialog({ title, description, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-inner">
      <div className="dialog-head"><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
        <Button className="icon-button" aria-label="Tutup dialog" icon={X} onClick={onClose} />
      </div>
      {children}
    </div>
  </dialog>
}

export function Editor({ title, description, onClose, onSave, submit = 'Simpan', children }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const close = () => { if (!busy) onClose() }
  async function handle(event) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try { await onSave(new FormData(event.currentTarget)); onClose() }
    catch (error) { setError(error); setBusy(false) }
  }
  return <Dialog title={title} description={description} onClose={close}>
    <form onSubmit={handle} className="form">
      <ErrorBox error={error} />
      {children}
      <div className="dialog-actions"><Button onClick={close} disabled={busy}>Batal</Button><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : submit}</Button></div>
    </form>
  </Dialog>
}

export const numericField = (form, key, fallback = null) => {
  const value = form.get(key)
  return value === null || value === '' ? fallback : Number(value)
}
export const stringField = (form, key) => String(form.get(key) ?? '')

export function CycleEditor({ current, cycles, settings, onClose, onSave }) {
  const defaults = current ? { start: current.start_date, end: current.end_date } : suggestedDates(cycles, settings)
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)
  return <Editor title={current ? 'Ubah tanggal siklus' : 'Buat siklus belanja'} onClose={onClose}
    onSave={() => onSave({ start_date: start, end_date: end })}>
    <div className="form-grid">
      <Field label="Tanggal mulai"><input type="date" required value={start} onChange={event => {
        setStart(event.target.value)
        if (event.target.value && !current) setEnd(addDays(event.target.value, settings.default_cycle_days - 1))
      }} /></Field>
      <Field label="Tanggal akhir"><input type="date" required min={start} value={end} onChange={event => setEnd(event.target.value)} /></Field>
    </div>
    {start && end && <p className="muted">{Math.max(0, daysBetween(start, end))} hari</p>}
  </Editor>
}
