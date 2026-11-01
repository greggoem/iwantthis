import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { formatDate, todayISO } from '../lib/format'
import type { EventRow } from '../lib/types'
import { Notice, Spinner } from '../components/ui'
import Icon from '../components/Icon'

type Row = EventRow & { event_members: { count: number }[] }
interface Pending { invite_id: string; event_id: string; event_name: string; event_date: string; organizer: string; invited_name: string }

export default function Events() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<Pending[]>([])

  const loadPending = () => supabase.rpc('my_pending_invites').then(({ data }) => setPending((data as Pending[]) ?? []))
  useEffect(() => { loadPending() }, [])
  const accept = async (p: Pending) => {
    setErr('')
    const { data, error } = await supabase.rpc('accept_invite', { p_invite: p.invite_id })
    if (error) setErr(errMsg(error)); else nav(`/evenements/${data as string}`)
  }
  const decline = async (p: Pending) => {
    setErr('')
    const { error } = await supabase.rpc('decline_invite', { p_invite: p.invite_id })
    if (error) setErr(errMsg(error)); else loadPending()
  }

  useEffect(() => {
    supabase.from('events').select('*,event_members(count)').order('event_date').then(({ data }) => {
      setRows((data as unknown as Row[]) ?? []); setLoading(false)
    })
  }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    const { data, error } = await supabase.from('events')
      .insert({ name: name.trim(), event_date: date, created_by: session!.user.id }).select('id').single()
    if (error) setErr(errMsg(error)); else nav(`/evenements/${(data as { id: string }).id}`)
  }

  if (loading) return <Spinner />
  const today = todayISO()
  const upcoming = rows.filter(r => r.event_date >= today)
  const past = rows.filter(r => r.event_date < today).reverse()

  const Card = ({ r }: { r: Row }) => (
    <li>
      <Link className="card item linkcard" to={`/evenements/${r.id}`}>
        <div className="evthumb">{r.image_url ? <img src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="gift" size={20} />}</div>
        <div className="item-main">
          <strong>{r.name}</strong>
          <p className="small muted">{formatDate(r.event_date)} · {r.event_members[0]?.count ?? 0} invité(s)
            {r.created_by === session!.user.id && ' · vous organisez'}
            {r.draw_done_at && ' · tirage fait'}</p>
        </div>
        <span aria-hidden>→</span>
      </Link>
    </li>
  )

  return (
    <div className="narrow">
      <h1>Événements</h1>
      <p className="muted">Noël, anniversaire, pendaison de crémaillère… Invitez des proches : ils voient les listes des uns des autres, et vous pouvez organiser un tirage au sort.</p>

      <Notice>{err}</Notice>
      {pending.length > 0 && (
        <section className="stack mt">
          <h2>Invitations ({pending.length})</h2>
          {pending.map(p => (
            <div key={p.invite_id} className="card item invite-card">
              <div className="item-main">
                <strong>{p.event_name}</strong>
                <p className="small muted">{formatDate(p.event_date)} · invité(e) par {p.organizer}</p>
              </div>
              <div className="item-actions">
                <button className="btn btn-primary btn-sm" onClick={() => accept(p)}><Icon name="check" size={15} /> Rejoindre</button>
                <button className="btn btn-ghost btn-sm" onClick={() => decline(p)}>Refuser</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {rows.length === 0 && <p className="muted">Aucun événement pour l'instant.</p>}
      {upcoming.length > 0 && <><h2 className="mt">À venir</h2><ul className="items">{upcoming.map(r => <Card key={r.id} r={r} />)}</ul></>}
      {past.length > 0 && <><h2 className="mt">Passés</h2><ul className="items">{past.map(r => <Card key={r.id} r={r} />)}</ul></>}

      <form className="card stack mt" onSubmit={create}>
        <h2>Créer un événement</h2>
        <Notice>{err}</Notice>
        <label>Nom
          <input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Noël en famille 2026" />
        </label>
        <label>Date de remise des cadeaux
          <input required type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary">Créer l'événement</button>
      </form>
    </div>
  )
}
