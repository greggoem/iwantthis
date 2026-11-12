import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Icon, { type IconName } from './Icon'

const SETTINGS: { s: string; label: string; icon: IconName }[] = [
  { s: 'apparence', label: 'Apparence', icon: 'sparkles' },
  { s: 'guide', label: 'Comment ça marche', icon: 'gift' },
  { s: 'extension', label: 'Extension', icon: 'external' },
  { s: 'api', label: 'API', icon: 'link' },
]

/** Menu « hamburger » en haut à droite : profil, sections des réglages, déconnexion */
export default function UserMenu() {
  const { session, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [admin, setAdmin] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const loc = useLocation()

  useEffect(() => { supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true)) }, [])
  useEffect(() => { setOpen(false) }, [loc.pathname, loc.search])
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); document.addEventListener('touchstart', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('touchstart', out); document.removeEventListener('keydown', esc) }
  }, [open])

  const name = profile?.display_name ?? ''
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const current = loc.pathname === '/reglages' ? (new URLSearchParams(loc.search).get('s') ?? 'apparence') : null

  return (
    <div className="umenu" ref={box}>
      <button type="button" className={`umenu-btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open}
        aria-label="Menu du compte" title="Menu" onClick={() => setOpen(o => !o)}>
        <span className="avatar" aria-hidden="true">{initial}</span>
        <Icon name={open ? 'x' : 'menu'} size={20} />
      </button>
      {open && (
        <div className="umenu-panel" role="menu">
          <div className="umenu-head">
            <span className="avatar avatar-lg" aria-hidden="true">{initial}</span>
            <div className="umenu-id">
              <strong>{name || 'Mon compte'}</strong>
              <span className="small muted ell">{session?.user.email}</span>
            </div>
          </div>
          <Link role="menuitem" to="/profil" className={loc.pathname === '/profil' ? 'on' : ''}><Icon name="user" size={18} /> Mon profil</Link>
          <div className="umenu-sep" />
          <span className="umenu-title">Réglages</span>
          {SETTINGS.map(x => (
            <Link key={x.s} role="menuitem" to={x.s === 'guide' ? '/aide' : `/reglages?s=${x.s}`} className={(x.s === 'guide' ? loc.pathname === '/aide' : current === x.s) ? 'on' : ''}><Icon name={x.icon} size={18} /> {x.label}</Link>
          ))}
          {admin && <Link role="menuitem" to="/admin" className={loc.pathname === '/admin' ? 'on' : ''}><Icon name="chart" size={18} /> Administration</Link>}
          <div className="umenu-sep" />
          <button type="button" role="menuitem" className="umenu-out" onClick={() => supabase.auth.signOut({ scope: 'local' })}><Icon name="logout" size={18} /> Se déconnecter</button>
        </div>
      )}
    </div>
  )
}
