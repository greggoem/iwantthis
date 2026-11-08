import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

interface Hit { label: string; sub: string; value: string }

/** Champ « lieu » avec suggestions (restaurants, salles, adresses…) via Photon / OpenStreetMap, sans clé. */
export default function PlaceInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typed.current) return
    const q = value.trim()
    if (q.length < 3) { setHits([]); return }
    const ctl = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        // résultats favorisés autour de Bruxelles, en français
        const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=fr&limit=6&lat=50.85&lon=4.35`, { signal: ctl.signal })
        const j = await r.json() as { features: { properties: Record<string, string> }[] }
        const seen = new Set<string>()
        const list = j.features.map(({ properties: p }) => {
          const street = [p.street, p.housenumber].filter(Boolean).join(' ')
          const city = [p.postcode, p.city || p.locality || p.district].filter(Boolean).join(' ')
          const place = p.name && p.name !== p.street ? p.name : ''
          const addr = [street, city].filter(Boolean).join(', ')
          const label = place || addr || p.name || ''
          const sub = place ? addr || p.country || '' : [p.state, p.country].filter(Boolean).join(', ')
          return { label, sub, value: [place, addr].filter(Boolean).join(', ') || label }
        }).filter(h => h.label && !seen.has(h.value) && seen.add(h.value))
        setHits(list); setActive(-1); setOpen(true)
      } catch { /* hors ligne ou interrompu */ }
    }, 350)
    return () => { window.clearTimeout(t); ctl.abort() }
  }, [value])

  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [])

  const pick = (h: Hit) => { typed.current = false; onChange(h.value); setOpen(false); setHits([]) }

  return (
    <div className="place-input" ref={box}>
      <input value={value} maxLength={200} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-autocomplete="list"
        onChange={e => { typed.current = true; onChange(e.target.value) }}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={e => {
          if (!open || !hits.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(hits[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {open && hits.length > 0 && (
        <ul className="place-list" role="listbox">
          {hits.map((h, i) => (
            <li key={h.value} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={e => { e.preventDefault(); pick(h) }} onMouseEnter={() => setActive(i)}>
              <Icon name="pin" size={16} />
              <span><strong>{h.label}</strong>{h.sub && <span className="small muted">{h.sub}</span>}</span>
            </li>
          ))}
          <li className="place-credit" aria-hidden="true">Suggestions © OpenStreetMap</li>
        </ul>
      )}
    </div>
  )
}
