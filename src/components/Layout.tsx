import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, APP_NAME } from '../lib/supabase'
import { useAffiliates } from '../lib/affiliate'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'

const NAV: { to: string; label: string; short: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Ma liste', short: 'Ma liste', icon: 'gift', end: true },
  { to: '/listes', label: 'Listes de mes proches', short: 'Proches', icon: 'users' },
  { to: '/offrir', label: 'À offrir', short: 'À offrir', icon: 'bag' },
  { to: '/evenements', label: 'Événements', short: 'Événements', icon: 'calendar' },
]

export default function Layout() {
  const { profile } = useAuth()
  const programs = useAffiliates()
  const loc = useLocation()
  const [pending, setPending] = useState(0)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    supabase.rpc('my_pending_invites').then(({ data }) => setPending(Array.isArray(data) ? data.length : 0))
  }, [loc.pathname])
  // notifications non lues : au changement de page, au retour sur l'onglet et chaque minute
  useEffect(() => {
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).then(({ count }) => setUnread(count ?? 0))
    load()
    const t = window.setInterval(load, 60000)
    window.addEventListener('focus', load)
    window.addEventListener('iwt-notifications', load)
    return () => { window.clearInterval(t); window.removeEventListener('focus', load); window.removeEventListener('iwt-notifications', load) }
  }, [loc.pathname])
  const amazon = programs.some(p => /amazon/i.test(p.domain))
  const initial = (profile?.display_name ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <NavLink to="/" className="brand" aria-label={APP_NAME}><Logo name={APP_NAME} /></NavLink>
          <nav className="nav" aria-label="Navigation principale">
            {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}{n.to === '/evenements' && pending > 0 && <span className="dot" title="Invitation en attente" />}</NavLink>)}
          </nav>
          <div className="who">
            <NavLink to="/notifications" className="icon-btn bell" aria-label={unread > 0 ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications'} title="Notifications"><Icon name="bell" />{unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}</NavLink>
            <NavLink to="/reglages" className="icon-btn" aria-label="Réglages" title="Réglages"><Icon name="settings" /></NavLink>
            <NavLink to="/profil" className="avatar" title={profile?.display_name ?? 'Mon profil'} aria-label="Mon profil">{initial}</NavLink>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Déconnexion" title="Déconnexion"><Icon name="logout" /></button>
          </div>
        </div>
      </header>

      <main className="main"><Outlet /></main>

      <footer className="footer">
        Certains liens sont des liens partenaires : le prix ne change pas pour vous, mais ils peuvent rapporter une petite commission au site.
        {amazon && <> En tant que Partenaire Amazon, ce site réalise un bénéfice sur les achats remplissant les conditions requises.</>}
        {' '}<a href="/privacy.html">Confidentialité</a>
      </footer>

      <nav className="tabbar" aria-label="Navigation mobile">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}><span className="tab-ico"><Icon name={n.icon} size={22} />{n.to === '/evenements' && pending > 0 && <span className="dot" />}</span><span>{n.short}</span></NavLink>
        ))}
        <NavLink to="/profil"><Icon name="user" size={22} /><span>Profil</span></NavLink>
      </nav>
    </div>
  )
}
