import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const THEMES: { key: Theme; name: string; desc: string; colors: string[] }[] = [
  { key: 'fete', name: 'Fête', desc: 'Coloré et joyeux, cartes avec une ombre de couleur.', colors: ['#ff4d8d', '#ffc933', '#2dd4a7', '#38bdf8', '#8b5cf6'] },
  { key: 'doodle', name: 'Doodle', desc: 'Dessiné à la main : trait noir épais, cartes pastel, police manuscrite.', colors: ['#ffe9a8', '#fcd3d3', '#cfe6fa', '#e4d3f2', '#cdeedd'] },
  { key: 'classique', name: 'Classique', desc: 'Sobre et épuré : noir et blanc, touche de corail.', colors: ['#0f0f10', '#f4f4f5', '#ffffff', '#ff5a36'] },
]

/** « Mon profil » : choix de l'apparence du site (mémorisé sur cet appareil) */
export default function ThemePicker() {
  const [t, setT] = useState<Theme>(getTheme())
  const pick = (k: Theme) => { setTheme(k); setT(k) }
  return (
    <section className="card stack mt">
      <h2>Apparence</h2>
      <div className="themepick" role="radiogroup" aria-label="Apparence du site">
        {THEMES.map(x => (
          <button key={x.key} type="button" role="radio" aria-checked={t === x.key} className={`themecard ${t === x.key ? 'on' : ''}`} onClick={() => pick(x.key)}>
            <div className="sw">{x.colors.map(c => <i key={c} style={{ background: c }} />)}</div>
            <strong>{x.name}</strong>
            <span className="small">{x.desc}</span>
          </button>
        ))}
      </div>
      <p className="small muted">Le choix est mémorisé sur cet appareil.</p>
    </section>
  )
}
