import React, { useState } from 'react'
import { CalendarDays, Check, ClipboardCheck, ListChecks, Pencil, Plus, Search, ShoppingBag, Sparkles } from 'lucide-react'
import { addDays, daysBetween } from '../shared/dates.js'
import {
  ActionLink, Badge, Button, CycleEditor, cycleLabels, date, Editor, Empty, ErrorBox, Field, go, inRange, labels,
  listLabels, Loading, money, numericField, Panel, period, ProductMark, Progress, qty, SectionHead, stringField, useResource,
} from './ui.jsx'

export function Cycles({ app, onCreate }) {
  return <>
    <SectionHead title="Siklus belanja" description="Tentukan periode, catat pembelian, dan review sisa stok."
      actions={<Button variant="primary" icon={Plus} onClick={onCreate}>Buat siklus</Button>} />
    <Panel>
      {!app.cycles.length ? <Empty title="Belum ada siklus" description="Mulai dengan periode belanja pertamamu." icon={CalendarDays}
        action={<Button variant="primary" onClick={onCreate}>Buat siklus</Button>} /> :
        <ul className="detail-list">{app.cycles.map(c => <li key={c.id}>
          <span className={`icon-box ${c.status === 'active' ? 'mint' : 'neutral'}`}><CalendarDays size={20} /></span>
          <div><a href={`#/siklus/${c.id}`}><strong>{period(c)}</strong></a><small>{daysBetween(c.start_date, c.end_date)} hari · {c.reviewed_count} review</small></div>
          <Badge status={c.status}>{cycleLabels[c.status]}</Badge>
          <ActionLink to={`/siklus/${c.id}`}>Buka</ActionLink>
        </li>)}</ul>}
    </Panel>
  </>
}

function OpeningEditor({ c, product, stock, onClose, mutate }) {
  return <Editor title={`Stok awal · ${product.name}`} description="Isi jumlah yang benar-benar ada pada awal siklus. Masukkan 0 jika saat itu tidak ada stok."
    onClose={onClose} onSave={form => mutate(`/cycles/${c.id}/opening-stock`, 'POST', {
      product_id: product.id, qty_base: numericField(form, 'stock'),
    }, 'Stok awal tersimpan.')}>
    <Field label={`Stok awal (${product.base_unit})`}><input name="stock" type="number" autoFocus required min="0"
      step={product.base_unit === 'pcs' ? '1' : '0.001'} defaultValue={stock?.qty_base ?? ''} /></Field>
  </Editor>
}

function PurchaseEditor({ c, products, timezone, mutate, onClose }) {
  const [filter, setFilter] = useState('')
  const [values, setValues] = useState({})
  const setValue = (id, key, value) => setValues(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }))
  return <Editor title="Catat pembelian" description="Isi jumlah pada produk yang dibeli."
    onClose={onClose} onSave={form => mutate(`/cycles/${c.id}/purchases`, 'POST', {
      purchased_on: stringField(form, 'date'),
      items: Object.entries(values).filter(([, info]) => Number(info.qty) > 0).map(([product_id, info]) => ({
        product_id, qty_packs: Number(info.qty), price_total_idr: info.price ? Number(info.price) : null,
      })),
    }, 'Pembelian tercatat.')}>
    <Field label="Tanggal pembelian"><input name="date" required type="date" min={c.start_date} max={c.end_date} defaultValue={inRange(c, timezone)} /></Field>
    <label className="search"><Search size={17} /><input placeholder="Cari produk…" aria-label="Cari produk untuk pembelian" value={filter} onChange={e => setFilter(e.target.value)} /></label>
    <div className="purchase-editor-items">{products.map(p => <div className="purchase-editor-item" key={p.id} hidden={!p.name.toLowerCase().includes(filter.toLowerCase())}>
      <strong>{p.name}</strong>
      <div className="form-grid">
        <Field label={`Jumlah (${p.pack_label})`}><input type="number" step={p.purchase_increment_packs} min={p.purchase_increment_packs} value={values[p.id]?.qty ?? ''} onChange={e => setValue(p.id, 'qty', e.target.value)} /></Field>
        <Field label="Harga total (Rp)"><input type="number" min="0" step="1" value={values[p.id]?.price ?? ''} onChange={e => setValue(p.id, 'price', e.target.value)} /></Field>
      </div>
    </div>)}</div>
  </Editor>
}

function ReviewEditor({ c, product, review, availability, onClose, mutate }) {
  const [status, setStatus] = useState(review?.status ?? '')
  const [remaining, setRemaining] = useState(review?.remaining_qty_base ?? '')
  const hasRemainder = status === 'cukup' || status === 'berlebih'
  return <Editor title={`Review · ${product.name}`} description={period(c)} onClose={onClose}
    onSave={form => mutate(`/cycles/${c.id}/reviews/${product.id}`, 'PUT', {
      status, remaining_qty_base: hasRemainder ? Number(remaining) : 0,
      stockout_date: status === 'kurang' ? stringField(form, 'stockout') || null : null,
      note: stringField(form, 'note') || null,
    }, 'Review tersimpan.')}>
    <fieldset className="review-options"><legend>Bagaimana stok di akhir siklus?</legend>
      {Object.entries(labels).filter(([value]) => value !== 'belum').map(([value, label]) => <label key={value} className={`review-option ${status === value ? 'chosen' : ''}`}>
        <input type="radio" name="review-status" required value={value} checked={status === value} onChange={() => setStatus(value)} />
        <span>{label}</span>
      </label>)}
    </fieldset>
    {hasRemainder && <Field label={`Sisa aktual (${product.base_unit})`}
      hint={remaining !== '' && availability.known && Number(remaining) <= availability.total && Number(remaining) > 0 && Number(remaining) >= availability.total / 2
        ? 'Setengah stok awal dan pembelian masih tersisa. Pertimbangkan Berlebih jika sisa ini terlalu banyak.' : 'Jumlah yang dihitung pada akhir siklus.'}>
      <input type="number" name="remaining" required min={product.base_unit === 'pcs' ? '1' : '0.001'}
        step={product.base_unit === 'pcs' ? '1' : '0.001'} value={remaining} onChange={e => setRemaining(e.target.value)} />
    </Field>}
    {status === 'kurang' && <Field label="Tanggal habis (opsional)" hint="Isi bila ingat agar saran bisa memakai laju pemakaian.">
      <input name="stockout" type="date" min={c.start_date} max={addDays(c.end_date, -1)} defaultValue={review?.stockout_date ?? ''} />
    </Field>}
    <Field label="Catatan (opsional)"><textarea name="note" maxLength={500} rows={2} defaultValue={review?.note ?? ''} /></Field>
  </Editor>
}

export function CycleDetail({ id, reviewMode, focusedProduct, app, version, mutate }) {
  const resource = useResource(`/cycles/${id}`, version)
  const [editor, setEditor] = useState(null)
  const [filter, setFilter] = useState('')
  if (resource.error) return <ErrorBox error={resource.error} />
  const c = resource.data
  if (!c) return <Loading />
  const activeProducts = app.products.filter(p => p.is_active)
  const related = new Set([...c.purchases, ...c.opening, ...c.reviews].map(item => item.product_id))
  const products = app.products.filter(p => focusedProduct ? p.id === focusedProduct : p.is_active || related.has(p.id))
  const visible = products.filter(p => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const opening = new Map(c.opening.map(item => [item.product_id, item]))
  const reviews = new Map(c.reviews.map(item => [item.product_id, item]))
  const transactions = Map.groupBy(c.purchases, item => item.product_id)
  const start = p => opening.get(p.id)
  const available = p => ({ known: opening.has(p.id), total: Number(start(p)?.qty_base ?? 0) +
    (transactions.get(p.id) ?? []).reduce((sum, item) => sum + Number(item.qty_base), 0) })
  const close = () => setEditor(null)
  const nextCycle = `/rekomendasi/${c.id}`
  return <>
    <div className="back-link"><a href="#/siklus">Semua siklus</a>{reviewMode && <> / <a href={`#/siklus/${id}`}>Detail siklus</a></>}</div>
    <SectionHead title={reviewMode ? 'Review stok' : period(c)}
      description={reviewMode ? period(c) : `${daysBetween(c.start_date, c.end_date)} hari · ${cycleLabels[c.status]}`}
      actions={c.status === 'active' ? <>
        {!reviewMode && <Button icon={ShoppingBag} onClick={() => setEditor({ type: 'purchase' })} disabled={!activeProducts.length}>Catat pembelian</Button>}
        {!reviewMode && <ActionLink variant="primary" icon={ClipboardCheck} to={`/siklus/${c.id}/review`}>Review stok</ActionLink>}
        {reviewMode && <Button variant="primary" icon={Check} onClick={() => setEditor({ type: 'close' })}>Tutup siklus</Button>}
      </> : c.status === 'draft' && <>
        {!c.shopping_list_id && <Button icon={Pencil} onClick={() => setEditor({ type: 'dates' })}>Ubah tanggal</Button>}
        <Button variant="primary" icon={Check} onClick={() => setEditor({ type: 'activate' })}>Aktifkan siklus</Button>
      </>} />
    {!reviewMode && <div className="quick-actions">
      {c.shopping_list_id && <ActionLink icon={ListChecks} to={`/belanja/${c.shopping_list_id}`}>Daftar belanja · {listLabels[c.shopping_status]}</ActionLink>}
      {c.status !== 'closed' && <ActionLink icon={Sparkles} to={nextCycle}>Rekomendasi</ActionLink>}
      {c.status === 'closed' && <ActionLink icon={ClipboardCheck} to={`/siklus/${c.id}/review`}>Lihat atau koreksi review</ActionLink>}
    </div>}
    {reviewMode && <Panel title="Progres review" className="review-progress" action={<strong>{c.reviewed_count} / {Math.max(c.reviewed_count, app.products.filter(p => p.is_active || reviews.has(p.id)).length)} produk</strong>}>
      <Progress value={c.reviewed_count} max={app.products.filter(p => p.is_active || reviews.has(p.id)).length} />
      <div className="review-tally">{Object.entries(labels).slice(0, 4).map(([status, label]) =>
        <Badge key={status} status={status}>{c.reviews.filter(item => item.status === status).length} {label}</Badge>)}</div>
    </Panel>}
    {!reviewMode && c.status !== 'draft' && <Panel title="Pembelian siklus">
      {!c.purchases.length ? <Empty title="Belum ada pembelian" icon={ShoppingBag} /> :
        <ul className="detail-list">{c.purchases.map(item => <li key={item.id}>
          <div><a href={`#/produk/${item.product_id}`}><strong>{item.name}</strong></a>
            <small>{date(item.purchased_on)} · {qty(item.qty_packs)} {item.pack_label_snapshot} ({qty(item.qty_base)} {item.base_unit})</small></div>
          <span>{money(item.price_total_idr)}</span>
        </li>)}</ul>}
    </Panel>}
    <Panel title={reviewMode ? 'Penilaian per produk' : 'Stok awal'} description={reviewMode ? 'Catat keadaan produk pada akhir siklus.' : 'Konfirmasi stok pada awal periode, termasuk 0 jika stok kosong.'}>
      {!products.length ? <Empty title="Belum ada produk" action={<ActionLink to="/produk">Buka katalog</ActionLink>} /> :
        <>
          {!focusedProduct && <div className="filters"><label className="search"><Search size={18} /><input aria-label="Cari produk dalam siklus" placeholder="Cari produk…" value={filter} onChange={e => setFilter(e.target.value)} /></label></div>}
          {!visible.length && <Empty title="Produk tidak ditemukan" />}
          <ul className="detail-list">{visible.map(p => {
            const openingStock = start(p)
            const review = reviews.get(p.id)
            return <li className="review-row" key={p.id}>
              <ProductMark unit={p.base_unit} />
              <div><a href={`#/produk/${p.id}`}><strong>{p.name}</strong></a><small>{openingStock ? `Stok awal ${qty(openingStock.qty_base)} ${p.base_unit}${openingStock.source === 'carried' ? ' · dari siklus sebelumnya' : ''}` : 'Stok awal belum dikonfirmasi'}</small>
                {reviewMode && review && <small>{review.status === 'kurang' ?
                  review.stockout_date ? `Habis ${date(review.stockout_date)}` : 'Tanggal habis belum dicatat' : `Sisa ${qty(review.remaining_qty_base)} ${p.base_unit}`}</small>}</div>
              {reviewMode && <Badge status={review?.status} />}
              <div className="row-actions">
                <Button variant="quiet" icon={Pencil} onClick={() => setEditor({ type: 'opening', product: p })}>{reviewMode ? 'Stok awal' : openingStock ? 'Koreksi' : 'Isi stok'}</Button>
                {reviewMode && <Button disabled={c.status === 'draft'} onClick={() => setEditor({ type: 'review', product: p })}>{review ? 'Koreksi' : 'Nilai'}</Button>}
              </div>
            </li>
          })}</ul>
        </>}
    </Panel>
    {editor?.type === 'purchase' && <PurchaseEditor c={c} products={activeProducts} onClose={close} mutate={mutate} timezone={app.settings.timezone} />}
    {editor?.type === 'opening' && <OpeningEditor c={c} product={editor.product} stock={start(editor.product)} onClose={close} mutate={mutate} />}
    {editor?.type === 'review' && <ReviewEditor c={c} product={editor.product} review={reviews.get(editor.product.id)} availability={available(editor.product)} onClose={close} mutate={mutate} />}
    {editor?.type === 'dates' && <CycleEditor current={c} cycles={app.cycles} settings={app.settings} onClose={close}
      onSave={payload => mutate(`/cycles/${id}`, 'PATCH', payload, 'Tanggal siklus tersimpan.')} />}
    {editor?.type === 'activate' && <Editor title="Aktifkan siklus?" description="Sisa terverifikasi dari periode yang berurutan akan dibawa sebagai stok awal." submit="Aktifkan"
      onClose={close} onSave={() => mutate(`/cycles/${id}`, 'PATCH', { status: 'active' }, 'Siklus aktif.')} />}
    {editor?.type === 'close' && <Editor title="Tutup siklus?" description={`${c.reviewed_count} produk sudah dinilai. Produk yang tersisa tetap berstatus belum dinilai.`}
      submit="Tutup siklus" onClose={close} onSave={async () => { await mutate(`/cycles/${id}/close`, 'POST', {}, 'Siklus ditutup.'); go(`/siklus/${id}`) }} />}
  </>
}
