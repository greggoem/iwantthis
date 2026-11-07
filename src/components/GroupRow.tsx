import { useState, type ReactNode } from 'react'
import type { Item } from '../lib/types'
import { formatPrice } from '../lib/format'
import Icon from './Icon'
import { Thumb, Pic } from './GiftTable'

export interface GroupProps {
  group: Item
  kids: Item[]
  image: string | null
  status?: ReactNode
  actions?: ReactNode
  renderKid: (kid: Item) => ReactNode
  defaultOpen?: boolean
}

const PREVIEW = 8

/** « 3 éléments », ou une invitation à compléter un groupe vide */
const countLabel = (n: number) => n === 0 ? 'Vide · ajoutez des éléments avec +' : `${n} élément${n > 1 ? 's' : ''}`

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
export default function GroupRow({ group, kids, image, status, actions, renderKid, defaultOpen = false }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const shown = all ? kids : kids.slice(0, PREVIEW)
  const toggle = () => setOpen(o => !o)

  return (
    <div className="gtable-group" data-open={open ? 1 : 0}>
      <div className="gtable-row g-head" role="row" onClick={toggle}>
        <div className="thumb-link g-groupthumb">
          <Thumb src={image} alt={group.title} zoom />
          {kids.length > 0 && <span className="count-badge">{kids.length}</span>}
        </div>
        <div className="g-main" role="cell">
          <strong>{group.title}</strong>
          <span className="tag">{group.pick_one ? 'un seul à choisir' : 'plusieurs possibles'}</span>
          <p className="small g-details">{countLabel(kids.length)}{group.details ? ` · ${group.details}` : group.pick_one ? ' · dès que l\'un est acheté, les autres sont inutiles' : ''}</p>
        </div>
        <div className="g-price" role="cell">{kids.length ? priceRange(kids) : ''}</div>
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

/** Groupe en mode galerie : une section pleine largeur, ses éléments en cartes */
export function GroupSection({ group, kids, image, status, actions, renderKid, defaultOpen = false }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const limit = PREVIEW * 2 - 4
  const shown = all ? kids : kids.slice(0, limit)

  // Fermé : le groupe se présente comme une seule carte (pile), un clic l'ouvre
  if (!open) return (
    <article className="gcard gcard-group" onClick={() => setOpen(true)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
      aria-label={`Ouvrir le groupe ${group.title} (${kids.length} élément${kids.length > 1 ? 's' : ''})`}>
      <div className="gcard-img">
        <Pic src={image} alt={group.title} />
        {kids.length > 0 && <span className="count-badge">{kids.length}</span>}
      </div>
      <div className="gcard-body">
        <div className="title-link"><strong>{group.title}</strong></div>
        <p className="small g-details"><span className="tag">{group.pick_one ? 'un seul à choisir' : 'plusieurs possibles'}</span> {group.details ?? ''}</p>
        <div className="gcard-meta">
          <span className="g-price">{kids.length ? priceRange(kids) : ''}</span>
          <span className="small link">{kids.length ? <>Voir {kids.length > 1 ? `les ${kids.length}` : 'l\'élément'} <Icon name="chevron" size={14} /></> : 'Groupe vide'}</span>
        </div>
        <div className="gcard-foot" onClick={e => e.stopPropagation()}>
          <div className="gcard-status">{status}</div>
          <div className="gcard-actions">{actions}</div>
        </div>
      </div>
    </article>
  )

  return (
    <section className="gsection" data-open={open ? 1 : 0}>
      <header className="gsection-head" onClick={() => setOpen(o => !o)}>
        <div className="gsection-title">
          <strong>{group.title}</strong>
          <span className="tag">{group.pick_one ? 'un seul à choisir' : 'plusieurs possibles'}</span>
          <p className="small g-details">{countLabel(kids.length)}{kids.length ? ` · ${priceRange(kids)}` : ''}{group.details ? ` · ${group.details}` : ''}</p>
        </div>
        <div className="gsection-side" onClick={e => e.stopPropagation()}>
          {status}
          <div className="g-actions">
            {actions}
            <button type="button" className="icon-btn g-chev" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? 'Replier le groupe' : 'Déplier le groupe'}>
              <Icon name="chevron" />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <>
          {kids.length === 0 && <p className="small muted g-empty">Ce groupe est vide.</p>}
          <div className="ggrid in-group">{shown.map(renderKid)}</div>
          {!all && kids.length > limit && (
            <button type="button" className="link small g-more" onClick={() => setAll(true)}>Voir les {kids.length - limit} autres éléments</button>
          )}
        </>
      )}
    </section>
  )
}
