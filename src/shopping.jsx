import React, { useState } from 'react'
import { CalendarDays, Check, ClipboardList, Pencil, RotateCcw, Search, ShoppingBasket, Sparkles, Trash2, Wallet } from 'lucide-react'
import { effectivePacks, shoppingSummary } from '../shared/shopping.js'
import { CartAmount, Mall } from './mall.jsx'
import {
  ActionLink, Badge, Button, cycleLabels, Editor, Empty, ErrorBox, Field, go, inRange, listLabels, Loading, money,
  numericField, Panel, period, Progress, qty, SectionHead, Select, stringField, useResource,
} from './ui.jsx'

function ChooseCycle({ variant, app, onCreate }) {
  const rec = variant === 'recommendation'
  const cycles = app.cycles.filter(c => rec ? c.status !== 'closed' : c.shopping_list_id || c.status !== 'closed')
  return <>
    <SectionHead title={rec ? 'Rekomendasi' : 'Daftar belanja'}
      description={rec ? 'Lihat saran jumlah, stok terverifikasi, dan dasar perhitungannya.' : 'Siapkan checklist dan simpan pembelian aktual.'} />
    <Panel title="Pilih siklus">
      {!cycles.length ? <Empty title={rec ? 'Belum ada siklus untuk dihitung' : 'Belum ada daftar belanja'}
        icon={rec ? Sparkles : ShoppingBasket} action={<Button variant="primary" onClick={onCreate}>Buat siklus</Button>} /> :
        <ul className="detail-list">{cycles.map(c => <li key={c.id}>
          <span className="icon-box mint"><CalendarDays size={19} /></span>
          <div><strong>{period(c)}</strong><small>{c.shopping_list_id ? `Daftar belanja · ${listLabels[c.shopping_status]}` : 'Daftar belum dibuat'}</small></div>
          <Badge status={c.status}>{cycleLabels[c.status]}</Badge>
          <ActionLink to={rec || !c.shopping_list_id ? `/rekomendasi/${c.id}` : `/belanja/${c.shopping_list_id}`}>
            {rec ? 'Lihat saran' : c.shopping_list_id ? 'Buka daftar' : 'Siapkan daftar'}
          </ActionLink>
        </li>)}</ul>}
    </Panel>
  </>
}

function CatalogFilters({ categories, filter, update, filterChecks = false }) {
  return <div className="filters">
    <label className="search"><Search size={18} /><input aria-label="Cari barang" placeholder="Cari barang…" value={filter.q}
      onChange={e => update('q', e.target.value)} /></label>
    <Select aria-label="Filter kategori" value={filter.category} onChange={e => update('category', e.target.value)}>
      <option value="">Semua kategori</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
    {filterChecks && <Select aria-label="Filter ceklis" value={filter.checked} onChange={e => update('checked', e.target.value)}>
      <option value="">Semua barang</option><option value="pending">Belum dicentang</option><option value="checked">Sudah dicentang</option>
    </Select>}
    <Select aria-label="Urutan barang" value={filter.sort} onChange={e => update('sort', e.target.value)}>
      <option value="name">Nama A–Z</option><option value="priority">Prioritas</option>
    </Select>
  </div>
}

function useFilters(items = [], ignoreChecks = false) {
  const [filter, setFilter] = useState({ q: '', category: '', checked: '', sort: 'name' })
  const visible = items.filter(item => item.name.toLocaleLowerCase('id').includes(filter.q.trim().toLocaleLowerCase('id')) &&
    (!filter.category || filter.category === item.category_id) &&
    (ignoreChecks || !filter.checked || Boolean(item.is_checked) === (filter.checked === 'checked')))
    .sort((a, b) => (filter.sort === 'priority' ? Number(b.suggested_packs ?? b.planned_qty_packs ?? -1) -
      Number(a.suggested_packs ?? a.planned_qty_packs ?? -1) : 0) || a.name.localeCompare(b.name, 'id'))
  return { filter, update: (key, value) => setFilter(previous => ({ ...previous, [key]: value })), visible }
}

export function Recommendations({ cycleId, app, version, mutate, onCreate }) {
  const { data, error } = useResource(cycleId ? `/cycles/${cycleId}/recommendations` : null, version)
  const cycle = app.cycles.find(c => c.id === cycleId)
  const [overrides, setOverrides] = useState({})
  const [confirm, setConfirm] = useState(false)
  const { visible, ...filters } = useFilters(data ?? [])
  if (!cycleId) return <ChooseCycle variant="recommendation" app={app} onCreate={onCreate} />
  if (error) return <ErrorBox error={error} />
  if (!cycle || !data) return <Loading />
  const canGenerate = cycle.status !== 'closed' && cycle.shopping_status !== 'finalized'
  const setQty = (id, value) => setOverrides(previous => ({ ...previous, [id]: value }))
  function readOverride(row) {
    return overrides[row.product_id] ?? (row.suggested_packs == null ? '' : String(row.suggested_packs))
  }
  async function generate() {
    const saved = await mutate(`/cycles/${cycleId}/shopping-list`, 'POST', {
      regenerate: Boolean(cycle.shopping_list_id),
      ...(cycle.shopping_list_id ? { version: cycle.shopping_version } : {}),
      overrides: Object.entries(overrides).map(([product_id, amount]) => ({ product_id, planned_qty_packs: amount === '' ? null : Number(amount) })),
    }, 'Daftar belanja siap.')
    go(`/belanja/${saved.id}`)
  }
  return <>
    <div className="back-link"><a href="#/rekomendasi">Semua rekomendasi</a> / <a href={`#/siklus/${cycleId}`}>Detail siklus</a></div>
    <SectionHead title="Rekomendasi belanja" description={`${period(cycle)} · ${data[0]?.next_cycle_days ?? '—'} hari`}
      actions={<>{cycle.shopping_list_id && <ActionLink to={`/belanja/${cycle.shopping_list_id}`}>Buka daftar</ActionLink>}
        {canGenerate && <Button variant="primary" icon={cycle.shopping_list_id ? RotateCcw : ClipboardList} disabled={!data.length} onClick={() => setConfirm(true)}>
          {cycle.shopping_list_id ? 'Regenerasi daftar' : 'Buat daftar belanja'}
        </Button>}</>} />
    {!data.length ? <Panel><Empty title="Tambahkan produk untuk melihat saran" icon={Sparkles} action={<ActionLink to="/produk">Buka katalog</ActionLink>} /></Panel> :
      <Panel>
        <CatalogFilters categories={app.categories} {...filters} />
        {!visible.length && <Empty title="Barang tidak ditemukan" />}
        <ul className="recommendations">{visible.map(row => <li key={row.product_id}>
          <div className="rec-copy">
            <a href={`#/produk/${row.product_id}`}><strong>{row.name}</strong></a>
            <div className="rec-badges"><Badge status={row.confidence}>{`Keyakinan ${row.confidence}`}</Badge>{row.baseline && <Badge status="belum">Perkiraan</Badge>}</div>
            <p>{row.reason}</p>
            {row.verified_on_hand_on && <small>Stok terverifikasi per {row.verified_on_hand_on}</small>}
            {row.optional_packs !== null && canGenerate && <Button variant="quiet" onClick={() => setQty(row.product_id, String(row.optional_packs))}>
              Pakai opsi {qty(row.optional_packs)} {row.pack_label}
            </Button>}
          </div>
          <div className="rec-amount">
            <span>Saran</span><strong>{row.suggested_packs === 0 ? 'Tidak perlu beli' : row.suggested_packs == null ? 'Isi manual' : `${qty(row.suggested_packs)} ${row.pack_label}`}</strong>
            <small>Isi {qty(row.pack_size_base)} {row.unit}/kemasan</small>
            {canGenerate && <Field label="Rencana beli"><input aria-label={`Rencana beli ${row.name}`} type="number" min="0" step={row.increment_packs} value={readOverride(row)} onChange={e => setQty(row.product_id, e.target.value)} /></Field>}
          </div>
        </li>)}</ul>
      </Panel>}
    {confirm && <Editor title={cycle.shopping_list_id ? 'Regenerasi daftar belanja?' : 'Buat daftar belanja?'}
      description={cycle.shopping_list_id ? 'Versi baru memakai hasil hitung terbaru dan rencana di halaman ini. Ceklis dan isian aktual sebelumnya direset.' :
        'Saran dan rencana di halaman ini disimpan sebagai daftar untuk siklus terpilih.'}
      submit={cycle.shopping_list_id ? 'Regenerasi' : 'Buat daftar'} onClose={() => setConfirm(false)} onSave={generate} />}
  </>
}

function EditShoppingItem({ item, list, onClose, save }) {
  return <Editor title={`Jumlah belanja · ${item.name}`} description={`Satu ${item.pack_label_snapshot} berisi ${qty(item.pack_size_base_snapshot)} ${item.base_unit}.`}
    onClose={onClose} onSave={form => save(list, { items: [{
      product_id: item.product_id, planned_qty_packs: numericField(form, 'planned'), actual_qty_packs: numericField(form, 'actual'),
      price_total_idr: numericField(form, 'price'),
    }] })}>
    <div className="form-grid">
      <Field label="Jumlah rencana"><input type="number" min="0" step={item.increment_packs_snapshot} name="planned" defaultValue={item.planned_qty_packs ?? ''} /></Field>
      <Field label="Jumlah aktual" hint="Kosongkan jika sama dengan rencana."><input type="number" min={item.increment_packs_snapshot} step={item.increment_packs_snapshot} name="actual" defaultValue={item.actual_qty_packs ?? ''} /></Field>
    </div>
    <Field label="Harga total aktual (Rp)"><input type="number" name="price" min="0" step="1" defaultValue={item.price_total_idr ?? ''} /></Field>
  </Editor>
}

export function Shopping({ listId, app, version, mutate, onCreate, mallMode }) {
  const resource = useResource(listId ? `/shopping-lists/${listId}` : null, version)
  const [cached, setCached] = useState(null)
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [mallView, setMallView] = useState('pending')
  const [recent, setRecent] = useState(null)
  const list = cached && cached.id === listId && cached.version >= (resource.data?.version ?? 0) ? cached : resource.data
  const { visible, ...filters } = useFilters(list?.items ?? [], mallMode)
  if (!listId) return <ChooseCycle variant="shopping" app={app} onCreate={onCreate} />
  if (resource.error && !list) return <ErrorBox error={resource.error} />
  if (!list) return <Loading />
  const finished = list.status === 'finalized'
  const editable = !finished && list.cycle.status !== 'closed'
  const focused = mallMode && editable
  const summary = shoppingSummary(list.items, list.budget_idr)
  const priced = list.items.filter(item => item.last_price_per_pack_idr != null && Number(item.planned_qty_packs) > 0)
  const close = () => setEditor(null)
  async function save(current, patch) {
    setError(null)
    setBusy(true)
    try {
      const next = await mutate(`/shopping-lists/${listId}`, 'PATCH', { version: current.version, ...patch })
      setCached(next)
      return next
    } finally { setBusy(false) }
  }
  const immediate = patch => save(list, patch).catch(setError)
  const updateItem = (item, patch) => immediate({ items: [{ product_id: item.product_id, ...patch }] })
  async function checkItem(item, checked) {
    const result = await updateItem(item, { is_checked: checked })
    if (focused && result) setRecent(checked ? item : null)
  }
  return <>
    {focused ? <Mall list={list} visible={visible} summary={summary} categories={app.categories} busy={busy}
      view={mallView} setView={setMallView} filter={filters.filter} updateFilter={filters.update}
      updateItem={updateItem} checkItem={checkItem} recent={recent && list.items.some(item => item.product_id === recent.product_id && item.is_checked) ? recent : null}
      clearRecent={() => setRecent(null)} editPrice={item => setEditor({ type: 'price', item })}
      editBudget={() => setEditor({ type: 'budget' })} finalize={() => setEditor({ type: 'finalize' })} error={error ?? resource.error} /> : <>
    <div className="back-link"><a href="#/belanja">Semua daftar</a> / <a href={`#/siklus/${list.cycle_id}`}>Detail siklus</a></div>
    <SectionHead title="Daftar belanja" description={period(list.cycle)}
      actions={<>{editable && <ActionLink variant="primary" icon={ShoppingBasket} to={`/belanja/${list.id}?mode=mal`}>Mode belanja</ActionLink>}
        {editable && <Button icon={Wallet} disabled={busy} onClick={() => setEditor({ type: 'budget' })}>Atur anggaran</Button>}
        {editable && <Button icon={Check} disabled={!summary.checked || busy} onClick={() => setEditor({ type: 'finalize' })}>Finalisasi</Button>}
        {mallMode && !editable && <ActionLink to={`/belanja/${list.id}`}>Kembali ke daftar</ActionLink>}</>} />
    <Panel title={finished ? 'Belanja selesai' : 'Progres belanja'} className="review-progress"
      action={<Badge status={list.status}>{listLabels[list.status]}</Badge>}>
      <Progress value={summary.checked} max={summary.planned} /><div className="shopping-summary">
        <strong>{summary.checked} / {summary.planned} dicentang</strong>
        {priced.length > 0 && <span>Estimasi {money(priced.reduce((sum, item) => sum + Number(item.last_price_per_pack_idr) * Number(item.planned_qty_packs), 0))} · {priced.length} harga tersedia</span>}
        {summary.budget !== null && <span>Anggaran {money(summary.budget)}</span>}
      </div>
      {(summary.checked > 0 || summary.budget !== null) && <div className="shopping-cart-summary"><CartAmount summary={summary} /></div>}
    </Panel>
    <ErrorBox error={error ?? resource.error} />
    <Panel>
      <CatalogFilters categories={app.categories} {...filters} filterChecks />
      {!visible.length && <Empty title="Barang tidak ditemukan" icon={ShoppingBasket} />}
      <ul className="shopping-list">{visible.map(item => {
        const chosenQty = item.actual_qty_packs ?? item.planned_qty_packs
        const noQty = !(Number(chosenQty) > 0)
        return <li key={item.id} className={item.is_checked ? 'is-checked' : ''}>
          <label className="shopping-check"><input type="checkbox" aria-label={`Centang ${item.name}`} checked={item.is_checked}
            disabled={!editable || busy || (!item.is_checked && (noQty || item.pack_changed))} onChange={e => checkItem(item, e.target.checked)} /></label>
          <div className="shopping-copy"><strong>{item.name}</strong><small>{item.category_name ?? 'Tanpa kategori'} · {qty(item.pack_size_base_snapshot)} {item.base_unit}/{item.pack_label_snapshot}</small>
            {editable && item.pack_changed && <small>Kemasan berubah. Regenerasi daftar untuk membeli dengan kemasan aktif.</small>}
            <details><summary>Alasan saran · {item.confidence}</summary><p>{item.reason_text}</p></details></div>
          <div className="shopping-qty">
            <strong>{item.planned_qty_packs == null ? 'Isi rencana' : Number(item.planned_qty_packs) === 0 ? 'Tidak perlu beli' : `${qty(item.planned_qty_packs)} ${item.pack_label_snapshot}`}</strong>
            {item.actual_qty_packs != null || (finished && item.is_checked) ? <small>Aktual {qty(chosenQty)} {item.pack_label_snapshot}</small> : null}
            {item.price_total_idr != null && <small>{money(item.price_total_idr)}</small>}
          </div>
          {editable && <div className="row-actions">
            <Button className="icon-button" icon={Pencil} aria-label={`Edit belanja ${item.name}`} onClick={() => setEditor({ type: 'edit', item })} disabled={busy} />
            <Button className="icon-button" icon={Trash2} aria-label={`Hapus ${item.name} dari daftar`} onClick={() => setEditor({ type: 'remove', item })} disabled={busy} />
          </div>}
        </li>
      })}</ul>
    </Panel>
    <div className="quick-actions">
      {finished ? <ActionLink variant="primary" to={`/siklus/${list.cycle_id}/review`}>Buka review siklus</ActionLink> :
        <>{editable && <ActionLink to={`/rekomendasi/${list.cycle_id}`}>Lihat rekomendasi terbaru</ActionLink>}
          <Button variant="quiet" icon={Trash2} disabled={busy} onClick={() => setEditor({ type: 'delete' })}>Hapus daftar</Button></>}
    </div>
    </>}
    {editor?.type === 'edit' && <EditShoppingItem item={editor.item} list={list} onClose={close} save={save} />}
    {editor?.type === 'price' && <Editor title={`Harga · ${editor.item.name}`}
      description={`Masukkan harga total untuk ${qty(effectivePacks(editor.item))} ${editor.item.pack_label_snapshot}.`}
      onClose={close} onSave={form => save(list, { items: [{
        product_id: editor.item.product_id, price_total_idr: numericField(form, 'price'),
      }] })}>
      <Field label="Harga total (Rp)"><input type="number" inputMode="numeric" name="price" min="0" step="1"
        autoFocus defaultValue={editor.item.price_total_idr ?? ''} /></Field>
    </Editor>}
    {editor?.type === 'budget' && <Editor title="Anggaran belanja" description="Isi batas belanja untuk daftar ini."
      onClose={close} onSave={form => save(list, { budget_idr: numericField(form, 'budget') })}>
      <Field label="Anggaran (Rp)"><input type="number" inputMode="numeric" name="budget" min="0" step="1"
        autoFocus defaultValue={list.budget_idr ?? ''} /></Field>
    </Editor>}
    {editor?.type === 'remove' && <Editor title={`Hapus ${editor.item.name} dari daftar?`} submit="Hapus barang"
      onClose={close} onSave={() => save(list, { items: [{ product_id: editor.item.product_id, remove: true }] })} />}
    {editor?.type === 'delete' && <Editor title="Hapus daftar belanja?" description="Kamu bisa membuat daftar baru dari halaman rekomendasi."
      submit="Hapus daftar" onClose={close} onSave={async () => {
        await mutate(`/shopping-lists/${listId}`, 'DELETE', undefined, 'Daftar dihapus.'); go(`/siklus/${list.cycle_id}`)
      }} />}
    {editor?.type === 'finalize' && <Editor title="Finalisasi belanja" description={`${summary.checked} barang yang dicentang akan masuk histori pembelian.`}
      submit="Simpan pembelian" onClose={close} onSave={async form => {
        const next = await mutate(`/shopping-lists/${listId}/finalize`, 'POST', {
          purchased_on: stringField(form, 'date'), version: list.version,
        }, 'Pembelian tercatat di histori.')
        setCached(next)
        if (mallMode) go(`/belanja/${list.id}`)
      }}>
      <Field label="Tanggal belanja"><input name="date" type="date" required min={list.cycle.start_date} max={list.cycle.end_date}
        defaultValue={inRange(list.cycle, app.settings.timezone)} /></Field>
    </Editor>}
  </>
}
