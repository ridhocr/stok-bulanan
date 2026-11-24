import React, { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ClipboardCheck, Pencil, Plus, Search, ShoppingBag, Sparkles, Tags } from 'lucide-react'
import {
  ActionLink, Badge, Button, date, Editor, Empty, ErrorBox, Field, labels, Loading, money, numericField,
  Panel, period, ProductMark, qty, SectionHead, Select, stringField, useResource,
} from './ui.jsx'

const priorities = { kurang: 0, berlebih: 1, cukup: 2, pas: 3 }

export function ProductEditor({ product, categories, onSave, onClose }) {
  const unit = product?.base_unit ?? 'pcs'
  const [baseUnit, setBaseUnit] = useState(unit)
  const fractional = baseUnit === 'pcs' ? '1' : '0.001'
  return <Editor title={product ? 'Edit produk' : 'Tambah produk'} description="Isi kemasan menentukan konversi ke satuan dasar."
    onClose={onClose} onSave={form => onSave({
      name: stringField(form, 'name'), category_id: stringField(form, 'category') || null,
      base_unit: baseUnit, pack_label: stringField(form, 'pack_label'), pack_size_base: numericField(form, 'pack_size'),
      purchase_increment_packs: numericField(form, 'increment'), initial_packs: numericField(form, 'initial'),
    })}>
    <Field label="Nama produk"><input name="name" placeholder="Contoh Beras" autoFocus required maxLength={100} defaultValue={product?.name} /></Field>
    <div className="form-grid">
      <Field label="Kategori"><Select name="category" defaultValue={product?.category_id ?? ''}><option value="">Tanpa kategori</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Satuan dasar"><Select value={baseUnit} onChange={e => setBaseUnit(e.target.value)}>
        <option value="pcs">pcs</option><option value="g">gram</option><option value="ml">ml</option>
      </Select></Field>
    </div>
    <div className="form-grid">
      <Field label="Nama kemasan"><input name="pack_label" required maxLength={30} placeholder="Contoh pouch" defaultValue={product?.pack_label ?? 'pack'} /></Field>
      <Field label={`Isi per kemasan (${baseUnit})`}><input name="pack_size" type="number" required min={fractional} step={fractional} defaultValue={product?.pack_size_base ?? 1} /></Field>
    </div>
    <div className="form-grid">
      <Field label="Kelipatan beli"><input name="increment" type="number" min={fractional} step={fractional} required defaultValue={product?.purchase_increment_packs ?? 1} /></Field>
      <Field label="Jumlah awal (opsional)" hint="Kemasan untuk saran pertama."><input name="initial" type="number" min={fractional} step={fractional} defaultValue={product?.initial_packs ?? ''} /></Field>
    </div>
  </Editor>
}

export function Products({ data, mutate }) {
  const [edit, setEdit] = useState(null)
  const [categoryForm, setCategoryForm] = useState(false)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('name')
  const [archive, setArchive] = useState(false)
  const visible = useMemo(() => data.products.filter(p => (archive ? !p.is_active : p.is_active) &&
    p.name.toLocaleLowerCase('id').includes(q.trim().toLocaleLowerCase('id')) && (!category || p.category_id === category) &&
    (!status || (p.latest_status ?? 'belum') === status)).sort((a, b) =>
    (sort === 'priority' ? (priorities[a.latest_status] ?? 4) - (priorities[b.latest_status] ?? 4) : 0) ||
    a.name.localeCompare(b.name, 'id')), [data.products, archive, q, category, status, sort])
  return <>
    <SectionHead title="Produk" description="Kelola barang rutin dan ukuran kemasan untuk belanja rumah."
      actions={<><Button icon={Tags} onClick={() => setCategoryForm(true)}>Kategori baru</Button>
        <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>Tambah produk</Button></>} />
    <Panel className="catalog">
      <div className="tabs" aria-label="Tampilan produk">
        <Button className={archive ? '' : 'tab-active'} variant="quiet" onClick={() => setArchive(false)}>Aktif</Button>
        <Button className={archive ? 'tab-active' : ''} variant="quiet" onClick={() => setArchive(true)}>Arsip</Button>
      </div>
      <div className="filters">
        <label className="search"><Search size={18} /><input aria-label="Cari produk" placeholder="Cari produk…" value={q} onChange={e => setQ(e.target.value)} /></label>
        <Select aria-label="Filter kategori" value={category} onChange={e => setCategory(e.target.value)}><option value="">Semua kategori</option>
          {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua status</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select aria-label="Urutkan produk" value={sort} onChange={e => setSort(e.target.value)}><option value="name">Nama A–Z</option><option value="priority">Prioritas</option></Select>
      </div>
      {visible.length ? <div className="table-wrap"><table className="responsive-table">
        <thead><tr><th>Produk</th><th>Kemasan</th><th>Pembelian terakhir</th><th>Review terakhir</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
        <tbody>{visible.map(p => <tr key={p.id}>
          <td><a className="product-name" href={`#/produk/${p.id}`}><ProductMark unit={p.base_unit} />
            <span><strong>{p.name}</strong><small>{p.category_name ?? 'Tanpa kategori'}</small></span></a></td>
          <td data-label="Kemasan">{p.pack_label} · {qty(p.pack_size_base)} {p.base_unit}</td>
          <td data-label="Pembelian">{p.last_qty_packs == null ? '—' : `${qty(p.last_qty_packs)} ${p.last_pack_label}`}</td>
          <td data-label="Review"><Badge status={p.latest_status} /></td>
          <td><Button className="icon-button" aria-label={`Edit ${p.name}`} icon={Pencil} onClick={() => setEdit(p)} /></td>
        </tr>)}</tbody>
      </table></div> : <Empty title={archive ? 'Arsip kosong' : 'Belum ada produk yang cocok'} description={archive ? undefined : 'Tambahkan produk atau ubah filter pencarian.'} />}
    </Panel>
    {edit && <ProductEditor product={edit.id ? edit : null} categories={data.categories} onClose={() => setEdit(null)}
      onSave={payload => mutate(edit.id ? `/products/${edit.id}` : '/products', edit.id ? 'PATCH' : 'POST', payload, 'Produk tersimpan.')} />}
    {categoryForm && <Editor title="Kategori baru" onClose={() => setCategoryForm(false)}
      onSave={form => mutate('/categories', 'POST', { name: stringField(form, 'name') }, 'Kategori tersimpan.')}>
      <Field label="Nama kategori"><input name="name" autoFocus required maxLength={60} placeholder="Contoh Dapur" /></Field>
    </Editor>}
  </>
}

function PurchaseCorrection({ item, onClose, mutate }) {
  return <Editor title="Koreksi pembelian" description={`Kuantitas memakai ukuran kemasan saat pembelian. Tanggal berlaku untuk semua barang dalam transaksi ini.`}
    onClose={onClose} onSave={form => mutate(`/purchases/${item.id}`, 'PATCH', {
      purchased_on: stringField(form, 'date'), qty_packs: numericField(form, 'qty'), price_total_idr: numericField(form, 'price'),
    }, 'Pembelian dikoreksi.')}>
    <Field label="Tanggal pembelian"><input name="date" type="date" required defaultValue={item.purchased_on} /></Field>
    <div className="form-grid">
      <Field label={`Jumlah (${item.pack_label_snapshot})`}><input name="qty" type="number" min={item.increment_packs_snapshot} step={item.increment_packs_snapshot} required defaultValue={item.qty_packs} /></Field>
      <Field label="Harga total (Rp)"><input name="price" type="number" min="0" step="1" defaultValue={item.price_total_idr ?? ''} /></Field>
    </div>
  </Editor>
}

export function ProductDetail({ id, app, version, mutate }) {
  const { data, error } = useResource(`/products/${id}/history`, version)
  const [edit, setEdit] = useState(false)
  const [archive, setArchive] = useState(false)
  const [correction, setCorrection] = useState(null)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading />
  const { product: p, purchases, reviews, recommendations } = data
  const last = reviews[0]
  const lastStock = last?.status === 'kurang' ? 'Terakhir dinilai Kurang' :
    last ? `Terakhir tercatat sisa ${qty(last.remaining_qty_base)} ${p.base_unit}` : 'Sisa stok belum tercatat'
  return <>
    <div className="back-link"><a href="#/produk">Semua produk</a> / Detail</div>
    <SectionHead title={p.name} description={`${p.category_name ?? 'Tanpa kategori'} · 1 ${p.pack_label} berisi ${qty(p.pack_size_base)} ${p.base_unit}`}
      actions={<><Button icon={Pencil} onClick={() => setEdit(true)}>Edit produk</Button>
        <Button icon={p.is_active ? Archive : ArchiveRestore} onClick={() => setArchive(true)}>{p.is_active ? 'Arsipkan' : 'Aktifkan kembali'}</Button></>} />
    <div className="detail-summary panel"><ProductMark unit={p.base_unit} />
      <div><strong>{lastStock}</strong>
        <p>{last?.stockout_date ? `Habis pada ${date(last.stockout_date)}` : last ? `Akhir siklus ${date(last.end_date)}` : 'Isi review siklus untuk mencatat sisa.'}</p></div>
      <Badge status={p.is_active ? p.latest_status : 'closed'}>{p.is_active ? labels[p.latest_status] ?? labels.belum : 'Diarsipkan'}</Badge>
    </div>
    <Panel title="Pembelian aktual" description="Jumlah dan ukuran kemasan saat transaksi.">
      {!purchases.length ? <Empty title="Belum ada pembelian" icon={ShoppingBag} /> :
        <ul className="detail-list">{purchases.map(item => <li key={item.id}>
          <div><strong>{date(item.purchased_on)} · {qty(item.qty_packs)} {item.pack_label_snapshot}</strong>
            <small>{qty(item.qty_base)} {p.base_unit} · Isi {qty(item.pack_size_base_snapshot)} {p.base_unit}/kemasan</small>
            {+new Date(item.updated_at) > +new Date(item.created_at) && <small>Dikoreksi {date(item.updated_at)}</small>}</div>
          <span>{money(item.price_total_idr)}</span><Button className="icon-button" icon={Pencil} aria-label={`Koreksi pembelian ${date(item.purchased_on)}`} onClick={() => setCorrection(item)} />
        </li>)}</ul>}
    </Panel>
    <Panel title="Review siklus">
      {!reviews.length ? <Empty title="Belum ada review" icon={ClipboardCheck} /> : <ul className="detail-list">{reviews.map(review => <li key={review.id}>
        <div><strong>{period(review)}</strong><small>{review.status === 'kurang' ?
          review.stockout_date ? `Habis ${date(review.stockout_date)}` : 'Tanggal habis belum dicatat' : `Sisa ${qty(review.remaining_qty_base)} ${p.base_unit}`}</small>
          {review.note && <small>{review.note}</small>}
          {+new Date(review.updated_at) > +new Date(review.reviewed_at) && <small>Dikoreksi {date(review.updated_at)}</small>}</div>
        <Badge status={review.status} /><ActionLink to={`/siklus/${review.cycle_id}/review?produk=${p.id}`} variant="quiet">Koreksi</ActionLink>
      </li>)}</ul>}
    </Panel>
    <Panel title="Riwayat saran belanja">
      {!recommendations.length ? <Empty title="Belum ada saran yang disimpan" icon={Sparkles} /> : <ul className="detail-list">{recommendations.map(item => <li key={item.id}>
        <div><strong>{period(item)} · {item.suggested_qty_packs == null ? 'Saran manual' : `${qty(item.suggested_qty_packs)} ${item.pack_label_snapshot}`}</strong>
          <small>{item.reason_text}</small><small>Rencana {qty(item.planned_qty_packs)} · Aktual {qty(item.list_status === 'finalized' && item.is_checked ? item.actual_qty_packs ?? item.planned_qty_packs : item.actual_qty_packs)} {item.pack_label_snapshot}</small></div>
        <Badge status={item.confidence}>{item.confidence}</Badge>
      </li>)}</ul>}
    </Panel>
    {edit && <ProductEditor product={p} categories={app.categories} onClose={() => setEdit(false)}
      onSave={payload => mutate(`/products/${p.id}`, 'PATCH', payload, 'Produk tersimpan.')} />}
    {correction && <PurchaseCorrection item={correction} onClose={() => setCorrection(null)} mutate={mutate} />}
    {archive && <Editor title={p.is_active ? 'Arsipkan produk?' : 'Aktifkan kembali produk?'} description={p.is_active ? 'Histori tetap tersedia. Produk berhenti muncul di daftar baru.' : 'Produk kembali diperhitungkan dalam saran belanja.'}
      submit={p.is_active ? 'Arsipkan' : 'Aktifkan'} onClose={() => setArchive(false)}
      onSave={() => mutate(`/products/${p.id}`, 'PATCH', { is_active: !p.is_active }, 'Status produk diperbarui.')} />}
  </>
}
