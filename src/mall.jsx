import React from 'react'
import { Check, CircleCheck, Minus, Plus, Search, ShoppingBasket, Tag, Wallet, X } from 'lucide-react'
import { effectivePacks, isSkipped, stepPacks } from '../shared/shopping.js'
import { Button, Empty, ErrorBox, money, period, Progress, qty, Select } from './ui.jsx'

const views = [
  ['pending', 'Perlu dibeli'],
  ['checked', 'Di keranjang'],
  ['all', 'Semua'],
]

function MallRow({ item, busy, update, check, editPrice }) {
  const packs = effectivePacks(item)
  const minus = stepPacks(item, -1)
  const price = item.price_total_idr
  return <li className={item.is_checked ? 'mall-item mall-checked' : 'mall-item'}>
    <label className="mall-check">
      <input type="checkbox" aria-label={`Centang ${item.name}`} checked={item.is_checked}
        disabled={busy || (!item.is_checked && (!packs || item.pack_changed))} onChange={event => check(item, event.target.checked)} />
    </label>
    <div className="mall-item-main">
      <strong>{item.name}</strong>
      <small>{item.pack_label_snapshot} · {qty(item.pack_size_base_snapshot)} {item.base_unit}/kemasan</small>
      {item.pack_changed && <small className="mall-warning">Kemasan berubah. Perbarui daftar sebelum membeli.</small>}
    </div>
    <div className="mall-item-controls">
      <div className="mall-stepper" aria-label={`Jumlah ${item.name}`} role="group">
        <Button className="icon-button" icon={Minus} aria-label={`Kurangi ${item.name}`}
          disabled={busy || minus <= 0 || item.pack_changed} onClick={() => update(item, { actual_qty_packs: minus })} />
        <output aria-label={`Jumlah aktual ${item.name}`}>{packs ? qty(packs) : '—'}</output>
        <Button className="icon-button" icon={Plus} aria-label={`Tambah ${item.name}`}
          disabled={busy || item.pack_changed} onClick={() => update(item, { actual_qty_packs: stepPacks(item, 1) })} />
      </div>
      <Button className="mall-price" variant="quiet" icon={Tag} disabled={busy || !packs}
        onClick={() => editPrice(item)}>{price == null ? 'Isi harga' : money(price)}</Button>
    </div>
  </li>
}

export function CartAmount({ summary }) {
  const { cartTotal, estimated, unknown, checked, remaining } = summary
  const hasPrice = checked > unknown
  const tentative = estimated > 0 || unknown > 0
  return <div className="cart-amount">
    <small>{estimated > 0 ? 'Perkiraan keranjang' : 'Total tercatat'}</small>
    <strong>{hasPrice || !checked ? money(cartTotal) : '—'}</strong>
    {remaining !== null && <span className={remaining < 0 ? 'cart-over' : ''}>{remaining < 0 ?
      `Lewat anggaran ${money(-remaining)}` : `${tentative ? 'Sisa sementara' : 'Sisa anggaran'} ${money(remaining)}`}</span>}
    {unknown > 0 && <span>{unknown} barang belum ada harga</span>}
  </div>
}

export function Mall({ list, visible, summary, categories, view, setView, filter, updateFilter, updateItem,
  checkItem, recent, clearRecent, busy, editPrice, editBudget, finalize, error }) {
  const items = visible.filter(item => view === 'all' || (view === 'checked' ? item.is_checked : !item.is_checked && !isSkipped(item)))
  const groups = Map.groupBy(items, item => item.category_name ?? 'Tanpa kategori')
  const counts = { pending: summary.planned - summary.checked, checked: summary.checked, all: list.items.length }
  let empty = { title: 'Barang tidak ditemukan', description: 'Coba ubah pencarian atau kategori.', icon: ShoppingBasket }
  if (view === 'pending' && counts.pending === 0) {
    empty = summary.planned
      ? { title: 'Semua rencana sudah dicentang', description: 'Periksa keranjang sebelum finalisasi.', icon: CircleCheck }
      : { title: 'Tidak ada rencana beli', description: 'Pilih Semua untuk melihat barang lain.', icon: ShoppingBasket }
  } else if (view === 'checked' && summary.checked === 0) {
    empty = { title: 'Keranjang masih kosong', description: 'Centang barang yang sudah masuk keranjang.', icon: ShoppingBasket }
  }
  return <div className="mall">
    <div className="mall-toolbar">
      <header className="mall-header">
        <a className="button icon-button" href={`#/belanja/${list.id}`} aria-label="Keluar mode belanja"><X size={22} /></a>
        <div><h1>Mode belanja</h1><p>{period(list.cycle)}</p></div>
        <Button className="icon-button" icon={Wallet} aria-label="Atur anggaran" onClick={editBudget} disabled={busy} />
      </header>
      <div className="mall-progress">
        <Progress value={summary.checked} max={summary.planned} label="Progres belanja" />
        <span>{summary.checked} / {summary.planned} dicentang</span>
      </div>
      <div className="mall-filters">
        <label className="search"><Search size={19} /><input aria-label="Cari barang di mal" type="search" placeholder="Cari barang…" value={filter.q}
          onChange={e => updateFilter('q', e.target.value)} /></label>
        <Select aria-label="Pilih kategori di mal" value={filter.category} onChange={e => updateFilter('category', e.target.value)}>
          <option value="">Kategori</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <div className="mall-tabs" aria-label="Status barang">
        {views.map(([key, label]) => <Button key={key} variant="quiet" onClick={() => setView(key)} aria-pressed={view === key}>
          {label} <span>{counts[key]}</span>
        </Button>)}
      </div>
      <ErrorBox error={error} />
    </div>
    <div className="mall-groups">
      {items.length === 0 && <Empty {...empty} />}
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'id')).map(([category, group]) =>
        <section key={category} className="mall-group">
          <h2>{category}</h2>
          <ul>{group.map(item => <MallRow key={item.id} item={item} busy={busy} update={updateItem} check={checkItem} editPrice={editPrice} />)}</ul>
        </section>)}
    </div>
    <footer className="mall-footer">
      {recent && <div className="mall-undo" role="status"><span>{recent.name} dicentang</span>
        <Button variant="quiet" disabled={busy} onClick={() => { checkItem(recent, false); clearRecent() }}>Urungkan</Button></div>}
      <div className="mall-total">
        <CartAmount summary={summary} />
        <Button variant="primary" icon={Check} disabled={!summary.checked || busy} onClick={finalize}>Finalisasi</Button>
      </div>
    </footer>
  </div>
}
