import { useState, type FormEvent } from 'react'
import { KID_COLORS, KID_COLOR_KEYS } from '../lib/kids'
import { Notice } from './ui'

export interface ChildDraft { name: string; age: string; color: string; inEvents: boolean }

/** Ajouter ou modifier une liste d'enfant (prénom, âge, couleur, partage dans les événements) */
export default function ChildForm({ initial, submitLabel, onSubmit, onCancel, onDelete }: {
  initial: ChildDraft; submitLabel: (name: string) => string
  onSubmit: (d: ChildDraft) => Promise<string | null>; onCancel: () => void; onDelete?: () => void
}) {
  const [d, setD] = useState<ChildDraft>(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const letter = (d.name.trim()[0] ?? '?').toUpperCase()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!d.name.trim()) { setErr('Indiquez le prénom.'); return }
    setBusy(true); setErr('')
    const m = await onSubmit({ ...d, name: d.name.trim(), age: d.age.trim() })
    setBusy(false)
    if (m) setErr(m)
  }
  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted" style={{ margin: 0 }}>Pas besoin d'e-mail : vous gérez sa liste depuis votre compte. Vos proches la voient comme les autres listes.</p>
      <Notice>{err}</Notice>
      <div className="kid-fields">
        <label>Prénom
          <input required maxLength={40} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} autoFocus placeholder="Ex. Léo" />
        </label>
        <label><span>Âge <span className="muted">· facultatif</span></span>
          <input maxLength={20} value={d.age} onChange={e => setD({ ...d, age: e.target.value })} placeholder="Ex. 7" inputMode="text" />
        </label>
      </div>
      <fieldset className="kid-colors">
        <legend>Couleur de sa pastille</legend>
        <div className="row gap wrap">
          {KID_COLOR_KEYS.map(k => (
            <button key={k} type="button" aria-label={KID_COLORS[k].label} aria-pressed={d.color === k}
              className={`kid-color${d.color === k ? ' on' : ''}`} style={{ background: KID_COLORS[k].bg, color: KID_COLORS[k].fg }}
              onClick={() => setD({ ...d, color: k })}>{letter}</button>
          ))}
        </div>
      </fieldset>
      <label className="kid-check">
        <input type="checkbox" checked={d.inEvents} onChange={e => setD({ ...d, inEvents: e.target.checked })} />
        <span><strong>Partager dans mes événements</strong><br /><span className="muted small">Sa liste est visible des invités de vos événements. Réglable aussi événement par événement.</span></span>
      </label>
      <div className="row between wrap gap">
        {onDelete ? <button type="button" className="btn btn-ghost danger" onClick={onDelete}>Supprimer sa liste</button> : <span />}
        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{submitLabel(d.name.trim() || 'l\'enfant')}</button>
        </div>
      </div>
    </form>
  )
}
