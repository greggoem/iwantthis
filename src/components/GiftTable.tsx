import { useState, type ReactNode } from 'react'
import type { Item } from '../lib/types'
import { formatPrice } from '../lib/format'
import { safeUrl } from '../lib/affiliate'
import ItemLink from './ItemLink'
import Icon from './Icon'

export function Thumb({ src, alt, large }: { src: string | null; alt: string; large?: boolean }) {
  const [broken, setBroken] = useState(false)
  const ok = src && safeUrl(src) && !broken
  return (
    <div className={`thumb ${large ? 'thumb-lg' : ''}`}>
      {ok
        ? <img src={src!} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <Icon name="gift" size={22} />}
    </div>
  )
}

/** Tableau des cadeaux : image · cadeau · prix · où l'acheter · statut / actions */
export function GiftTable({ children, statusLabel = 'Statut' }: { children: ReactNode; statusLabel?: string }) {
  return (
    <div className="gtable" role="table">
      <div className="gtable-head" role="row">
        <span role="columnheader" />
        <span role="columnheader">Cadeau</span>
        <span role="columnheader">Prix</span>
        <span role="columnheader">Où l'acheter</span>
        <span role="columnheader">{statusLabel}</span>
      </div>
      {children}
    </div>
  )
}

export function GiftRow({ item, status, actions, children, highlight }: {
  item: Item
  status?: ReactNode
  actions?: ReactNode
  children?: ReactNode          // zone dépliée sous la ligne (ex. choix de l'occasion)
  highlight?: boolean
}) {
  return (
    <div className={`gtable-row ${highlight ? 'is-claimed' : ''}`} role="row">
      <Thumb src={item.image_url} alt={item.title} />
      <div className="g-main" role="cell">
        <strong>{item.title}</strong>
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
