import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, APP_NAME } from '../lib/supabase'
import { useAffiliates } from '../lib/affiliate'

export default function Layout() {
  const { profile } = useAuth()
  const programs = useAffiliates()
  const amazon = programs.some(p => /amazon/i.test(p.domain))
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <NavLink to="/" className="brand">🎁 {APP_NAME}</NavLink>
          <nav className="nav">
            <NavLink to="/" end>Ma liste</NavLink>
            <NavLink to="/listes">Listes de mes proches</NavLink>
            <NavLink to="/evenements">Événements</NavLink>
          </nav>
          <div className="who">
            <NavLink to="/profil" className="small">{profile?.display_name ?? '…'}</NavLink>
            <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
          </div>
        </div>
      </header>
      <main className="main"><Outlet /></main>
      <footer className="footer">
        Certains liens de cette liste sont des liens partenaires (parrainage) : le prix ne change pas pour vous,
        mais ils peuvent rapporter une petite commission au site.
        {amazon && <> En tant que Partenaire Amazon, ce site réalise un bénéfice sur les achats remplissant les conditions requises.</>}
      </footer>
    </div>
  )
}
