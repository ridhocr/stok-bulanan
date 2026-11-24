import React from 'react'
import { AlertTriangle, CalendarDays, ClipboardCheck, ListChecks, Package, Plus, ShoppingBasket, Sparkles } from 'lucide-react'
import { daysBetween, localDate } from '../shared/dates.js'
import { ActionLink, Badge, Button, Empty, Panel, ProductMark, Progress, SectionHead, cycleLabels, period, qty } from './ui.jsx'

function Metric({ Icon, tone, label, value, caption }) {
  return <div className="metric">
    <span className={`icon-box ${tone}`}><Icon size={19} /></span>
    <div><strong>{value}</strong><span className="metric-label">{label}</span></div>
    <small>{caption}</small>
  </div>
}

export function Dashboard({ data, onCreate }) {
  const { products, cycles, settings } = data
  const current = cycles.find(c => c.status === 'active')
  const last = cycles.find(c => c.status === 'closed')
  const reference = current ?? last
  const next = cycles.filter(c => c.status === 'draft' && (!reference || c.start_date > reference.end_date)).at(-1)
  const active = products.filter(p => p.is_active)
  const concern = active.filter(p => p.latest_status === 'kurang')
  const priority = active.filter(p => p.latest_status === 'kurang' || p.shortage_count >= 2)
    .sort((a, b) => Number(b.latest_status === 'kurang') - Number(a.latest_status === 'kurang') || b.shortage_count - a.shortage_count)
  const shopping = current && current.shopping_status !== 'finalized' && current.shopping_list_id ? current : next
  const daysLeft = current ? Math.max(0, daysBetween(localDate(settings.timezone), current.end_date) - 1) : 0
  const reviewed = current?.reviewed_count ?? 0
  const reviewTotal = Math.max(active.length, reviewed)
  return <div className="dashboard">
    <SectionHead title="Stok rumah" description="Cek persediaan dan siapkan belanja berikutnya."
      actions={reference && <Button icon={Plus} onClick={onCreate}>Buat siklus</Button>} />
    <section className="dashboard-hero" aria-labelledby="cycle-heading">
      <div className="hero-copy">
        {reference && <div className="hero-kicker"><CalendarDays size={16} />{current ? 'Siklus berjalan' : 'Siklus terakhir'}</div>}
        <h2 id="cycle-heading">{reference ? period(reference) : 'Belanja pertama'}</h2>
        <p>{current ? daysLeft > 0 ? `${daysLeft} hari menuju akhir siklus` : 'Review stok dan tutup siklus saat siap.' :
          last ? 'Siapkan daftar untuk periode belanja berikutnya.' : 'Tentukan periode, tambahkan produk rutin, lalu catat pembelian pertama.'}</p>
        <div className="hero-actions">
          {current ? <ActionLink variant="primary" to={`/siklus/${current.id}/review`} icon={ClipboardCheck}>Review stok</ActionLink> :
            <Button variant="primary" icon={Plus} onClick={onCreate}>{last ? 'Buat siklus baru' : 'Buat siklus'}</Button>}
          {current && <div className="hero-progress">
            <div className="hero-progress-title"><span>Review</span><strong>{qty(reviewed)} / {qty(reviewTotal)}</strong></div>
            <Progress value={reviewed} max={reviewTotal} label="Progres review stok" />
          </div>}
        </div>
      </div>
      <div className="hero-visual">
        <img src="/keranjang-pasar.webp" alt="" width="1280" height="853" fetchPriority="high" />
      </div>
    </section>
    <section className="metrics" aria-label="Statistik stok">
      <Metric Icon={Package} tone="mint" label="Produk aktif" value={qty(active.length)} caption="Dalam katalog belanja" />
      <Metric Icon={AlertTriangle} tone="amber" label="Berstatus kurang" value={qty(concern.length)} caption="Menurut review terakhir" />
      <Metric Icon={ListChecks} tone="leaf" label="Rencana belanja" value={qty(shopping?.planned_count ?? 0)} caption={shopping ? period(shopping) : 'Belum ada periode belanja'} />
    </section>
    <div className="dashboard-grid">
      <Panel title="Perlu diperhatikan" description="Barang yang baru atau sering dinilai kurang" action={<ActionLink to="/produk" variant="quiet">Lihat produk</ActionLink>}>
        {!priority.length ? <Empty title="Belum ada produk berstatus kurang" description="Penilaian produk akan muncul di sini." icon={Package} /> :
          <ul className="priority-list">{priority.slice(0, 5).map(p => <li key={p.id}>
            <a href={`#/produk/${p.id}`}><ProductMark unit={p.base_unit} />
              <span><strong>{p.name}</strong><small>{p.category_name ?? 'Tanpa kategori'}{p.shortage_count > 1 ? ` · ${p.shortage_count} kali dinilai kurang` :
                p.last_qty_packs != null && ` · Belanja terakhir ${qty(p.last_qty_packs)} ${p.last_pack_label}`}</small></span>
              <Badge status={p.latest_status} /></a>
          </li>)}</ul>}
      </Panel>
      <Panel title="Belanja berikutnya" className="upcoming">
        <span className="icon-box mint"><ShoppingBasket size={21} /></span>
        <h3>{shopping ? period(shopping) : 'Rencanakan belanja berikutnya'}</h3>
        <p>{shopping?.shopping_list_id ? `${shopping.checked_count} dari ${shopping.planned_count} barang sudah dicentang.` :
          shopping ? 'Lihat jumlah yang disarankan dan sesuaikan daftar belanja.' : 'Buat periode untuk menyiapkan daftar belanja.'}</p>
        {shopping?.shopping_list_id ? <div className="actions">
          <ActionLink variant="primary" to={`/belanja/${shopping.shopping_list_id}?mode=mal`} icon={ShoppingBasket}>Mode belanja</ActionLink>
          <ActionLink variant="quiet" to={`/belanja/${shopping.shopping_list_id}`}>Lihat daftar</ActionLink>
        </div> : shopping ? <ActionLink to={`/rekomendasi/${shopping.id}`} icon={Sparkles}>Lihat rekomendasi</ActionLink> :
          <Button onClick={onCreate} icon={Plus}>Buat siklus</Button>}
      </Panel>
    </div>
    {last && <a className="history-link" href={`#/siklus/${last.id}`}><CalendarDays size={16} /> Siklus sebelumnya · {period(last)} <Badge status={last.status}>{cycleLabels[last.status]}</Badge></a>}
  </div>
}
