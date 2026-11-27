import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDateShort, todayISO } from '../lib/format'
import { euros, names, type GGCard } from '../lib/groupGifts'
import GroupGiftForm from './GroupGiftForm'
import Icon from './Icon'

const BADGE: Record<string, { label: string; cls: string }> = {
  answer: { label: 'À répondre', cls: 'gg-st-wait' },
  open: { label: 'En cours', cls: 'gg-st-open' },
  closed: { label: 'À acheter', cls: 'gg-st-closed' },
  bought: { label: 'Acheté', cls: 'gg-st-bought' },
}

/** « À offrir » : mes cadeaux communs (en cours, à répondre, achetés) et ceux déjà offerts */
export default function GroupGifts() {
  const [rows, setRows] = useState<GGCard[] | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => { supabase.rpc('my_group_gifts').then(({ data }) => setRows((data as GGCard[]) ?? [])) }, [])

  const today = todayISO()
  const current = (rows ?? []).filter(r => !(r.status === 'bought' && r.give_on < today))
  const past = (rows ?? []).filter(r => r.status === 'bought' && r.give_on < today && r.answer === 'yes').reverse()

  return (
    <section className="stack gg-section">
      <div className="row between wrap">
        <h2 className="gg-h2" style={{ margin: 0 }}>Cadeaux communs</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouveau cadeau commun</button>
      </div>
      {rows !== null && current.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>Plusieurs à offrir un même cadeau ? Lancez un cadeau commun : chacun dit s'il participe et combien, vous suivez qui a payé.</p>
      )}
      {current.map(r => {
        const b = r.status === 'open' && r.answer === 'pending' ? BADGE.answer : BADGE[r.status]
        const pct = Math.min(100, Math.round((Number(r.total) / Number(r.price)) * 100))
        return (
          <Link key={r.id} to={`/commun/${r.id}`} className="card gg-card">
            <span className="gg-card-img">{r.image_url ? <img src={r.image_url} alt="" referrerPolicy="no-referrer" /> : <Icon name="gift" size={24} />}</span>
            <span className="gg-card-main">
              <span className="row between" style={{ alignItems: 'flex-start' }}>
                <strong className="gg-card-title">{r.title}</strong>
                <span className={`gg-status ${b.cls}`}>{b.label}</span>
              </span>
              <span className="small muted">Pour {r.recipient_name} · {formatDateShort(r.give_on)} · {r.is_organizer ? 'vous organisez' : `par ${names(r.organizers)}`}</span>
              {r.status === 'open' && <span className="gg-bar gg-bar-sm"><span style={{ width: `${pct}%` }} /></span>}
              <span className="row between small">
                <span className="muted">{euros(Number(r.total))} / {euros(Number(r.price))} · {r.yes} participant{r.yes > 1 ? 's' : ''}</span>
                {r.answer === 'yes' && r.share !== null && <strong>Votre part {r.status === 'open' ? '≈ ' : ''}{euros(Number(r.share))}</strong>}
              </span>
            </span>
          </Link>
        )
      })}
      {past.length > 0 && (
        <details className="gg-past">
          <summary className="small muted">Cadeaux communs offerts ({past.length})</summary>
          <ul className="stack-sm">
            {past.map(r => (
              <li key={r.id} className="small"><Link to={`/commun/${r.id}`}>{r.title}</Link> pour {r.recipient_name} · {formatDateShort(r.give_on)}{r.with.length ? ` · offert avec ${names(r.with)}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {creating && <GroupGiftForm onClose={() => setCreating(false)} />}
    </section>
  )
}
