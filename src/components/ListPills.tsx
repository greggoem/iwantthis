import type { Wishlist } from '../lib/types'
import { KID_COLORS } from '../lib/kids'
import Icon from './Icon'

/** Pastille ronde avec l'initiale : noire pour le compte, en couleur pour un enfant */
export function PersonDot({ name, color, size = 32 }: { name: string; color?: string | null; size?: number }) {
  const c = color ? KID_COLORS[color] ?? KID_COLORS.corail : null
  return (
    <span className="pdot" aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: c ? c.bg : undefined, color: c ? c.fg : undefined }}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/** Choix de la liste : Moi · Léo · Emma (· + Enfant) */
export default function ListPills({ lists, current, myName, onPick, onAddKid, label = 'Choisir la liste' }: {
  lists: Wishlist[]; current: string; myName: string; onPick: (id: string) => void; onAddKid?: () => void; label?: string
}) {
  return (
    <div className="lpills" role="radiogroup" aria-label={label}>
      {lists.map(l => {
        const on = l.id === current
        const name = l.child_name || 'Moi'
        return (
          <button key={l.id} type="button" role="radio" aria-checked={on} className={`lpill${on ? ' on' : ''}`} onClick={() => onPick(l.id)}>
            <PersonDot name={l.child_name || myName || 'Moi'} color={l.child_name ? l.child_color ?? 'corail' : null} />
            <span>{name}</span>
          </button>
        )
      })}
      {onAddKid && (
        <button type="button" className="lpill lpill-add" onClick={onAddKid}><Icon name="plus" size={16} /> Enfant</button>
      )}
    </div>
  )
}
