import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, APP_NAME } from '../lib/supabase'
import { useAffiliates } from '../lib/affiliate'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'

const NAV: { to: string; label: string; short: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Ma liste', short: 'Ma liste', icon: 'gift', end: true },
  { to: '/listes', label: 'Listes de mes proches', short: 'Proches', icon: 'users' },
  { to: '/evenements', label: 'Événements', short: 'Événements', icon: 'calendar' },
]

export default function Layout() {
  const { profile } = useAuth()
  const programs = useAffiliates()
  const amazon = programs.some(p => /amazon/i.test(p.domain))
  const initial = (profile?.display_name ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <NavLink to="/" className="brand" aria-label={APP_NAME}><Logo name={APP_NAME} /></NavLink>
          <nav className="nav" aria-label="Navigation principale">
            {NAV.map(n => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <div className="who">
            <NavLink to="/profil" className="avatar" title={profile?.display_name ?? 'Mon profil'} aria-label="Mon profil">{initial}</NavLink>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()} aria-label="Déconnexion" title="Déconnexion"><Icon name="logout" /></button>
          </div>
        </div>
      </header>

      <main className="main"><Outlet /></main>

      <footer className="footer">
        Certains liens sont des liens partenaires : le prix ne change pas pour vous, mais ils peuvent rapporter une petite commission au site.
        {amazon && <> En tant que Partenaire Amazon, ce site réalise un bénéfice sur les achats remplissant les conditions requises.</>}
      </footer>

      <nav className="tabbar" aria-label="Navigation mobile">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={22} /><span>{n.short}</span></NavLink>
        ))}
        <NavLink to="/profil"><Icon name="user" size={22} /><span>Profil</span></NavLink>
      </nav>
    </div>
  )
}
