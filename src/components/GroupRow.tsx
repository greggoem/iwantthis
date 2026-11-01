import { useState, type ReactNode } from 'react'
import type { Item } from '../lib/types'
import { formatPrice } from '../lib/format'
import Icon from './Icon'
import { Thumb } from './GiftTable'

const PREVIEW = 8

/** Fourchette de prix des éléments : « 99 € à 149 € » */
export function priceRange(kids: Item[]): string {
  const p = kids.map(k => k.price).filter((x): x is number => x !== null)
  if (!p.length) return '—'
  const lo = Math.min(...p), hi = Math.max(...p)
  const short = (n: number) => formatPrice(n).replace(/[,.]00(?=\s|\u00a0|$)/, '')
  return lo === hi ? formatPrice(lo) : `${short(lo)} à ${short(hi)}`
}

/**
 * Ligne de groupe dépliable : une seule ligne dans la liste, les éléments (un par objet) à l'intérieur.
 * `renderKid` dessine chaque élément ; `status` et `actions` concernent le groupe lui-même.
 */
export default function GroupRow({ group, kids, image, status, actions, renderKid, defaultOpen = false }: {
  group: Item
  kids: Item[]
  image: string | null
  status?: ReactNode
  actions?: ReactNode
  renderKid: (kid: Item) => ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const shown = all ? kids : kids.slice(0, PREVIEW)
  const toggle = () => setOpen(o => !o)

  return (
    <div className="gtable-group" data-open={open ? 1 : 0}>
      <div className="gtable-row g-head" role="row" onClick={toggle}>
        <div className="thumb-link g-groupthumb">
          <Thumb src={image} alt={group.title} />
          <span className="count-badge">{kids.length}</span>
        </div>
        <div className="g-main" role="cell">
          <strong>{group.title}</strong>
          <span className="tag">{group.pick_one ? 'un seul à choisir' : 'plusieurs possibles'}</span>
          <p className="small g-details">{kids.length} élément{kids.length > 1 ? 's' : ''}{group.details ? ` · ${group.details}` : group.pick_one ? ' · dès que l\'un est acheté, les autres sont inutiles' : ''}</p>
        </div>
        <div className="g-price" role="cell">{priceRange(kids)}</div>
        <div className="g-link is-none" role="cell" />
        <div className="g-status" role="cell">
          {status}
          <div className="g-actions" onClick={e => e.stopPropagation()}>
            {actions}
            <button type="button" className="icon-btn g-chev" onClick={toggle} aria-expanded={open} aria-label={open ? 'Replier le groupe' : 'Déplier le groupe'}>
              <Icon name="chevron" />
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="g-kids">
          {kids.length === 0 && <p className="small muted g-empty">Ce groupe est vide.</p>}
          {shown.map(renderKid)}
          {!all && kids.length > PREVIEW && (
            <button type="button" className="link small g-more" onClick={() => setAll(true)}>Voir les {kids.length - PREVIEW} autres éléments</button>
          )}
        </div>
      )}
    </div>
  )
}
