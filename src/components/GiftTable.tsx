import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Item } from '../lib/types'
import { formatPrice } from '../lib/format'
import { safeUrl } from '../lib/affiliate'
import { SORT_LABEL, type SortKey, type ViewMode, type ViewPrefs } from '../lib/view'
import ItemLink, { ItemAnchor } from './ItemLink'
import Icon from './Icon'

const ZOOM = 280

/** Miniature. Avec `zoom`, une grande image apparaît au survol (souris uniquement) */
export function Thumb({ src, alt, large, zoom }: { src: string | null; alt: string; large?: boolean; zoom?: boolean }) {
  const [broken, setBroken] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => { setBroken(false) }, [src])   // une nouvelle image repart de zéro (l'ancienne avait pu échouer)
  const ok = Boolean(src && safeUrl(src) && !broken)

  const show = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoom || !ok || !window.matchMedia('(hover: hover)').matches) return
    const r = e.currentTarget.getBoundingClientRect()
    let x = r.right + 14
    if (x + ZOOM > window.innerWidth - 8) x = Math.max(8, r.left - ZOOM - 14)
    const y = Math.min(Math.max(8, r.top + r.height / 2 - ZOOM / 2), window.innerHeight - ZOOM - 8)
    setPos({ x, y })
  }

  return (
    <div className={`thumb ${large ? 'thumb-lg' : ''}`} onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {ok
        ? <img src={src!} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <Icon name="gift" size={22} />}
      {pos && createPortal(
        <div className="zoom-pop" style={{ left: pos.x, top: pos.y, width: ZOOM, height: ZOOM }} aria-hidden="true">
          <img src={src!} alt="" referrerPolicy="no-referrer" />
        </div>, document.body)}
    </div>
  )
}

/** Grande image (galerie) */
export function Pic({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])
  const ok = src && safeUrl(src) && !broken
  return (
    <div className="pic">
      {ok
        ? <img src={src!} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <Icon name="gift" size={40} />}
    </div>
  )
}

/* ---------- Barre « affichage » : liste / galerie + tri ---------- */
export function ViewBar({ prefs, onChange, left }: { prefs: ViewPrefs; onChange: (p: Partial<ViewPrefs>) => void; left?: ReactNode }) {
  return (
    <div className={`viewbar is-${prefs.view}`}>
      <div className="viewbar-left">{left}</div>
      <div className="viewbar-right">
        <label className="sortsel">
          <span className="sr-only">Trier par</span>
          <select value={prefs.key ?? ''} onChange={e => onChange({ key: (e.target.value || null) as SortKey | null, dir: 'asc' })} aria-label="Trier par">
            <option value="">Ordre d'ajout</option>
            {(Object.keys(SORT_LABEL) as SortKey[]).map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          {prefs.key && (
            <button type="button" className="icon-btn" title={prefs.dir === 'asc' ? 'Croissant' : 'Décroissant'}
              aria-label={prefs.dir === 'asc' ? 'Tri croissant : inverser' : 'Tri décroissant : inverser'}
              onClick={() => onChange({ dir: prefs.dir === 'asc' ? 'desc' : 'asc' })}>
              <span className={`sortarrow ${prefs.dir}`}><Icon name="chevron" size={16} /></span>
            </button>
          )}
        </label>
        <div className="seg-view" role="group" aria-label="Mode d'affichage">
          <button type="button" className={prefs.view === 'list' ? 'on' : ''} aria-pressed={prefs.view === 'list'} title="Liste" onClick={() => onChange({ view: 'list' })}><Icon name="list" size={17} /></button>
          <button type="button" className={prefs.view === 'gallery' ? 'on' : ''} aria-pressed={prefs.view === 'gallery'} title="Galerie" onClick={() => onChange({ view: 'gallery' })}><Icon name="grid" size={17} /></button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Conteneurs ---------- */
function Head({ k, label, prefs, onSort }: { k: SortKey; label: string; prefs: ViewPrefs; onSort: (k: SortKey) => void }) {
  const on = prefs.key === k
  return (
    <span role="columnheader" aria-sort={on ? (prefs.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`sorthead ${on ? 'on' : ''}`} onClick={() => onSort(k)} title={`Trier par ${label.toLowerCase()}`}>
        {label}
        <span className={`sortarrow ${on ? prefs.dir : 'none'}`}><Icon name="chevron" size={13} /></span>
      </button>
    </span>
  )
}

/** Tableau des cadeaux : image · cadeau · prix · où l'acheter · statut / actions (colonnes triables) */
export function GiftTable({ children, statusLabel = 'Statut', prefs, onSort }: {
  children: ReactNode; statusLabel?: string; prefs: ViewPrefs; onSort: (k: SortKey) => void
}) {
  return (
    <div className="gtable" role="table">
      <div className="gtable-head" role="row">
        <span role="columnheader" />
        <Head k="title" label="Cadeau" prefs={prefs} onSort={onSort} />
        <Head k="price" label="Prix" prefs={prefs} onSort={onSort} />
        <Head k="store" label="Où l'acheter" prefs={prefs} onSort={onSort} />
        <Head k="status" label={statusLabel} prefs={prefs} onSort={onSort} />
      </div>
      {children}
    </div>
  )
}

/** Liste ou galerie selon le mode choisi */
export function GiftCollection({ view, prefs, onSort, statusLabel, children }: {
  view: ViewMode; prefs: ViewPrefs; onSort: (k: SortKey) => void; statusLabel?: string; children: ReactNode
}) {
  return view === 'gallery'
    ? <div className="ggrid">{children}</div>
    : <GiftTable statusLabel={statusLabel} prefs={prefs} onSort={onSort}>{children}</GiftTable>
}

/* ---------- Une envie : ligne ou carte ---------- */
export interface GiftProps {
  item: Item
  kid?: boolean                 // élément à l'intérieur d'un groupe
  dim?: boolean                 // grisé (ex. « plus nécessaire »)
  status?: ReactNode
  actions?: ReactNode
  children?: ReactNode          // zone dépliée (ex. choix de l'occasion)
  highlight?: boolean
}

export function GiftRow({ item, status, actions, children, highlight, kid, dim }: GiftProps) {
  return (
    <div className={`gtable-row ${highlight ? 'is-claimed' : ''} ${kid ? 'kid' : ''} ${dim ? 'dim' : ''}`} role="row">
      <ItemAnchor url={item.url} className="thumb-link"><Thumb src={item.image_url} alt={item.title} zoom /></ItemAnchor>
      <div className="g-main" role="cell">
        <ItemAnchor url={item.url} className="title-link"><strong>{item.title}</strong></ItemAnchor>
        {item.details && <p className="small g-details">{item.details}</p>}
      </div>
      <div className={`g-price ${item.price === null ? 'is-none' : ''}`} role="cell">{item.price !== null ? formatPrice(item.price) : <span className="muted">—</span>}</div>
      <div className={`g-link ${item.url ? '' : 'is-none'}`} role="cell">{item.url ? <ItemLink url={item.url} /> : <span className="muted small">—</span>}</div>
      <div className="g-status" role="cell">
        {status}
        {actions && <div className="g-actions">{actions}</div>}
      </div>
      {children && <div className="g-extra">{children}</div>}
    </div>
  )
}

export function GiftCard({ item, status, actions, children, highlight, dim }: GiftProps) {
  return (
    <article className={`gcard ${highlight ? 'is-claimed' : ''} ${dim ? 'dim' : ''}`}>
      <ItemAnchor url={item.url} className="gcard-img"><Pic src={item.image_url} alt={item.title} /></ItemAnchor>
      <div className="gcard-body">
        <ItemAnchor url={item.url} className="title-link"><strong>{item.title}</strong></ItemAnchor>
        {item.details && <p className="small g-details">{item.details}</p>}
        <div className="gcard-meta">
          {item.price !== null && <span className="g-price">{formatPrice(item.price)}</span>}
          {item.url && <ItemLink url={item.url} />}
        </div>
        <div className="gcard-foot">
          <div className="gcard-status">{status}</div>
          <div className="gcard-actions">{actions}</div>
        </div>
        {children}
      </div>
    </article>
  )
}
