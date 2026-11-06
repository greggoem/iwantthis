import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const THEMES: { key: Theme; name: string; desc: string; colors: string[] }[] = [
  { key: 'classique', name: 'Classique', desc: 'Sobre et épuré : noir et blanc, touche de corail.', colors: ['#0f0f10', '#f4f4f5', '#ffffff', '#ff5a36'] },
  { key: 'menthe', name: 'Menthe', desc: 'Frais et contrasté : barre vert profond, fond menthe, étiquettes colorées.', colors: ['#0f4d36', '#bfe6d1', '#eef9f3', '#fef3c7', '#15803d'] },
  { key: 'nuit', name: 'Nuit', desc: 'Sombre et reposant pour les yeux, touches corail.', colors: ['#121216', '#1c1c22', '#ff7a59', '#f2f2f5', '#4ade80'] },
  { key: 'fete', name: 'Fête', desc: 'Coloré et joyeux, cartes avec une ombre de couleur.', colors: ['#ff4d8d', '#ffc933', '#2dd4a7', '#38bdf8', '#8b5cf6'] },
  { key: 'doodle', name: 'Doodle', desc: 'Dessiné à la main : trait noir épais, cartes pastel, police manuscrite.', colors: ['#ffe9a8', '#fcd3d3', '#cfe6fa', '#e4d3f2', '#cdeedd'] },
]

/** « Mon profil » : choix de l'apparence du site (mémorisé sur cet appareil) */
export default function ThemePicker({ compact = false, bare = false }: { compact?: boolean; bare?: boolean }) {
  const [t, setT] = useState<Theme>(getTheme())
  const { session } = useAuth()
  const pick = (k: Theme) => {
    setTheme(k); setT(k)
    if (session) supabase.auth.updateUser({ data: { theme: k } }).catch(() => {})   // enregistré dans le compte
  }
  const Wrap = compact ? 'div' : 'section'
  return (
    <Wrap className={compact ? 'stack' : 'card stack mt'}>
      {bare ? null : compact ? <strong>Choisissez votre apparence</strong> : <h2>Apparence</h2>}
      <div className="themepick" role="radiogroup" aria-label="Apparence du site">
        {THEMES.map(x => (
          <button key={x.key} type="button" role="radio" aria-checked={t === x.key} className={`themecard ${t === x.key ? 'on' : ''}`} onClick={() => pick(x.key)}>
            <div className="sw">{x.colors.map(c => <i key={c} style={{ background: c }} />)}</div>
            <strong>{x.name}</strong>
            <span className="small">{x.desc}</span>
          </button>
        ))}
      </div>
      {!bare && <p className="small muted">{compact ? 'Vous pourrez la changer à tout moment dans Réglages.' : 'Le choix est enregistré dans votre compte.'}</p>}
    </Wrap>
  )
}
