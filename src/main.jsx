import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CalendarDays, Check, CircleHelp, LayoutDashboard, LogOut, Mail, Ellipsis, Package,
  Settings, ShoppingBasket, Sparkles,
} from 'lucide-react'
import { Dashboard } from './dashboard.jsx'
import { Products, ProductDetail } from './products.jsx'
import { Cycles, CycleDetail } from './cycles.jsx'
import { Recommendations, Shopping } from './shopping.jsx'
import {
  api, Brand, Button, CycleEditor, Editor, ErrorBox, Field, go, Loading, numericField, Panel,
  SectionHead, stringField, useResource,
} from './ui.jsx'
import './style.css'

const navigation = [
  ['/', 'Ringkasan', LayoutDashboard],
  ['/produk', 'Produk', Package],
  ['/siklus', 'Siklus belanja', CalendarDays],
  ['/rekomendasi', 'Rekomendasi', Sparkles],
  ['/belanja', 'Daftar belanja', ShoppingBasket],
  ['/pengaturan', 'Pengaturan', Settings],
]
const mobileTabs = [
  ['/', 'Ringkasan', LayoutDashboard],
  ['/produk', 'Produk', Package],
  ['/siklus', 'Siklus', CalendarDays],
  ['/belanja', 'Belanja', ShoppingBasket],
]

function SignIn({ session, onLogin, magicToken, cancelConfirmation }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  async function submit(work) {
    setBusy(true)
    setError(null)
    try { await work() } catch (error) { setError(error) } finally { setBusy(false) }
  }
  function demo(sample) {
    return submit(async () => {
      const result = await api('/auth/demo', 'POST', { sample })
      onLogin(result.user)
    })
  }
  return <main className="login-layout">
    <section className="login-visual">
      <Brand />
      <div className="login-visual-copy">
        <h1>Belanja bulanan lebih terencana.</h1>
        <p>Cek sisa stok, lihat saran, dan buka daftar saat belanja.</p>
      </div>
      <img className="login-photo" src="/keranjang-pasar.webp" alt="" width="1280" height="853" fetchPriority="high" />
    </section>
    <section className="login-form">
      <div className="login-form-inner">
        <span className="icon-box mint">{session.demo && magicToken === null ? <ShoppingBasket size={22} /> : <Mail size={22} />}</span>
        <h2>{magicToken !== null ? 'Konfirmasi masuk' : session.demo ? 'Coba StokBulanan' : sent ? 'Cek emailmu' : 'Masuk ke StokBulanan'}</h2>
        <p>{magicToken !== null ? 'Gunakan tautan dari email untuk membuka StokBulanan di perangkat ini.' :
          session.demo ? 'Buka contoh belanja yang sudah terisi atau mulai dengan katalog kosong.' :
          sent ? 'Buka tautan masuk yang dikirim untuk melanjutkan.' : 'Kami akan mengirim tautan masuk sekali pakai ke emailmu.'}</p>
        <ErrorBox error={error} />
        {magicToken !== null ? <div className="login-actions">
          <Button variant="primary" icon={Check} disabled={busy || !magicToken} onClick={() => submit(async () => {
            const result = await api('/auth/verify', 'POST', { token: magicToken })
            onLogin(result.user)
          })}>{busy ? 'Memeriksa tautan…' : 'Masuk dengan tautan ini'}</Button>
          <Button disabled={busy} onClick={cancelConfirmation}>Kembali</Button>
        </div> : session.demo ? <div className="login-actions">
          <Button variant="primary" icon={Sparkles} disabled={busy} onClick={() => demo(true)}>{busy ? 'Menyiapkan…' : 'Coba dengan data contoh'}</Button>
          <Button disabled={busy} onClick={() => demo(false)}>Mulai dari kosong</Button>
          <p className="login-note"><CircleHelp size={16} /> Mode demo lokal di perangkat ini</p>
        </div> : sent ? <Button onClick={() => { setError(null); setSent(false) }}>Kembali ke form</Button> :
          <form className="form" onSubmit={event => {
            event.preventDefault()
            const email = stringField(new FormData(event.currentTarget), 'email')
            submit(async () => { await api('/auth/login', 'POST', { email }); setSent(true) })
          }}>
            <Field label="Alamat email"><input name="email" autoComplete="email" type="email" required placeholder="nama@email.com" /></Field>
            <Button icon={Mail} variant="primary" disabled={busy} type="submit">{busy ? 'Mengirim…' : 'Kirim tautan masuk'}</Button>
          </form>}
      </div>
    </section>
  </main>
}

function SettingsPage({ settings, user, mutate, onLogout }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setBusy(true)
    try {
      await mutate('/settings', 'PATCH', {
        household_name: stringField(form, 'name'), timezone: stringField(form, 'timezone'),
        default_cycle_days: numericField(form, 'days'), safety_days: numericField(form, 'safety'),
      }, 'Pengaturan tersimpan.')
    } catch (error) { setError(error) } finally { setBusy(false) }
  }
  return <>
    <SectionHead title="Pengaturan" description="Sesuaikan periode belanja dan profil rumah." />
    <Panel title="Preferensi rumah" description="Durasi bawaan mengisi siklus baru. Hari cadangan dipakai saat menghitung saran.">
      <form className="form settings-form" onSubmit={save}>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Nama rumah (opsional)"><input name="name" maxLength={80} defaultValue={settings.household_name} placeholder="Rumah saya" /></Field>
          <Field label="Zona waktu" hint="Gunakan nama IANA, misalnya Asia/Jakarta."><input name="timezone" required defaultValue={settings.timezone} /></Field>
        </div>
        <div className="form-grid">
          <Field label="Durasi siklus (hari)"><input name="days" type="number" min="1" max="366" required defaultValue={settings.default_cycle_days} /></Field>
          <Field label="Hari cadangan"><input name="safety" type="number" min="0" max="30" required defaultValue={settings.safety_days} /></Field>
        </div>
        <div><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button></div>
      </form>
    </Panel>
    <Panel title="Akun" description={user.demo ? 'Katalog demo tersimpan di server lokal.' : user.email} className="account-panel">
      <Button icon={LogOut} onClick={() => setConfirm(true)}>Keluar</Button>
    </Panel>
    {confirm && <Editor title="Keluar dari StokBulanan?" submit="Keluar" onClose={() => setConfirm(false)} onSave={onLogout} />}
  </>
}

function readRoute() {
  const [path, query] = (location.hash.slice(1) || '/').split('?')
  return { path, query: new URLSearchParams(query) }
}

function findMagicToken() {
  const route = readRoute()
  return route.path === '/masuk' ? route.query.get('token') ?? '' : null
}

function Workspace({ user, logout }) {
  const [route, setRoute] = useState(readRoute)
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState(null)
  const [menu, setMenu] = useState(false)
  const [create, setCreate] = useState(false)
  const mobileMenu = useRef(null)
  const sidebar = useRef(null)
  const resource = useResource('/dashboard', version)
  const app = resource.data
  useEffect(() => {
    const listener = () => {
      setRoute(readRoute())
      setMenu(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 3600)
    return () => clearTimeout(timeout)
  }, [toast])
  useEffect(() => {
    if (!menu) return
    const close = event => {
      if (event.key === 'Escape') {
        setMenu(false)
        mobileMenu.current?.focus()
      }
    }
    const narrow = window.matchMedia('(max-width: 860px)')
    const resetOnDesktop = event => { if (!event.matches) setMenu(false) }
    sidebar.current?.querySelector('nav a[aria-current]')?.focus()
    document.addEventListener('keydown', close)
    narrow.addEventListener('change', resetOnDesktop)
    return () => {
      document.removeEventListener('keydown', close)
      narrow.removeEventListener('change', resetOnDesktop)
    }
  }, [menu])

  async function mutate(path, method, payload, message) {
    try {
      const result = await api(path, method, payload)
      setVersion(previous => previous + 1)
      if (message) setToast({ message })
      return result
    } catch (error) {
      if (error.status === 409) setVersion(previous => previous + 1)
      throw error
    }
  }

  const [section, id, detail] = route.path.split('/').filter(Boolean)
  const activeRoute = section ? `/${section}` : '/'
  const mallMode = section === 'belanja' && Boolean(id) && route.query.get('mode') === 'mal'
  const title = navigation.find(([path]) => path === activeRoute)?.[1] ?? 'StokBulanan'
  const onCreate = () => setCreate(true)
  let screen
  if (app) {
    const props = { app, version, mutate, onCreate }
    if (section === 'produk') screen = id ? <ProductDetail {...props} key={id} id={id} /> : <Products data={app} mutate={mutate} />
    else if (section === 'siklus') screen = id ? <CycleDetail {...props} key={route.path + route.query.toString()} id={id} reviewMode={detail === 'review'}
      focusedProduct={route.query.get('produk')} /> : <Cycles {...props} />
    else if (section === 'rekomendasi') screen = <Recommendations {...props} key={id} cycleId={id} />
    else if (section === 'belanja') screen = <Shopping {...props} key={id} listId={id} mallMode={mallMode} />
    else if (section === 'pengaturan') screen = <SettingsPage settings={app.settings} user={user} mutate={mutate} onLogout={logout} />
    else screen = <Dashboard data={app} onCreate={onCreate} />
  }
  const household = app?.settings.household_name || 'Rumah saya'
  return <div className={mallMode ? 'shell shell-mall' : 'shell'}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Lewati ke konten</a>
    {menu && <button className="nav-backdrop" type="button" aria-label="Tutup menu" onClick={() => { setMenu(false); mobileMenu.current?.focus() }} />}
    <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`} id="navigation" ref={sidebar}>
      <a href="#/" className="brand-link" aria-label="StokBulanan, ringkasan" onClick={() => setMenu(false)}><Brand /></a>
      <nav aria-label="Navigasi utama">
        {navigation.map(([path, label, Icon]) => <a key={path} href={`#${path}`} aria-current={activeRoute === path ? 'page' : undefined} onClick={() => setMenu(false)}>
          <Icon size={19} strokeWidth={1.85} aria-hidden="true" /><span>{label}</span>
        </a>)}
      </nav>
      <a href="#/pengaturan" className="profile" onClick={() => setMenu(false)}>
        <span className="avatar">{household.slice(0, 1).toUpperCase()}</span>
        <span><strong>{household}</strong><small>{user.demo ? 'Demo lokal' : 'Akun pribadi'}</small></span>
      </a>
    </aside>
    <div className="shell-body" inert={menu || undefined}>
      <header className="topbar">
        <a className="topbar-brand" href="#/" aria-label="StokBulanan, ringkasan"><Brand /></a>
        <span className="topbar-location">{title}</span>
        {user.demo && <span className="environment-label"><span /> Demo lokal</span>}
      </header>
      <main className="content" id="main-content" tabIndex="-1">
        {screen ?? (resource.error ? <ErrorBox error={resource.error} /> : <Loading />)}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Navigasi ponsel">
      {mobileTabs.map(([path, label, Icon]) => <a className="mobile-tab" key={path} href={`#${path}`}
        aria-current={activeRoute === path ? 'page' : undefined} onClick={() => setMenu(false)}>
        <span className="mobile-tab-icon"><Icon size={20} aria-hidden="true" /></span><span>{label}</span>
      </a>)}
      <button className="mobile-tab" type="button" ref={mobileMenu} aria-expanded={menu} aria-controls="navigation"
        data-current={!mobileTabs.some(([path]) => path === activeRoute)} onClick={() => setMenu(previous => !previous)}>
        <span className="mobile-tab-icon"><Ellipsis size={21} aria-hidden="true" /></span><span>Lainnya</span>
      </button>
    </nav>
    {create && app && <CycleEditor cycles={app.cycles} settings={app.settings} onClose={() => setCreate(false)}
      onSave={async payload => { const c = await mutate('/cycles', 'POST', payload, 'Siklus dibuat.'); go(`/siklus/${c.id}`) }} />}
    {toast && <div className="toast" role="status"><Check size={18} /> {toast.message}</div>}
  </div>
}

function App() {
  const { data, error } = useResource('/auth/session')
  const [user, setUser] = useState(undefined)
  const [magicToken, setMagicToken] = useState(findMagicToken)
  useEffect(() => {
    const expire = () => setUser(null)
    const readToken = () => setMagicToken(findMagicToken())
    window.addEventListener('stokbulanan:session-expired', expire)
    window.addEventListener('hashchange', readToken)
    return () => {
      window.removeEventListener('stokbulanan:session-expired', expire)
      window.removeEventListener('hashchange', readToken)
    }
  }, [])
  if (error) return <div className="boot"><ErrorBox error={error} /></div>
  if (!data) return <div className="boot"><Loading /></div>
  const active = user === undefined ? data.user : user
  const cancelConfirmation = () => {
    history.replaceState(null, '', '/')
    setMagicToken(null)
  }
  if (magicToken !== null) return <SignIn key="confirm" session={data} magicToken={magicToken} cancelConfirmation={cancelConfirmation}
    onLogin={account => { cancelConfirmation(); setUser(account) }} />
  return active ? <Workspace key={active.id} user={active} logout={async () => {
    await api('/auth/logout', 'POST')
    setUser(null)
    history.replaceState(null, '', '/')
  }} /> : <SignIn session={data} onLogin={setUser} magicToken={null} />
}

createRoot(document.getElementById('root')).render(<App />)
