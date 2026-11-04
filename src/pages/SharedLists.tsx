import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

interface Row { id: string; owner_id: string; title: string; items: { count: number }[] }
interface Ev { id: string; name: string; event_date: string; event_members: { user_id: string }[] }
type Sort = 'name' | 'event'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function SharedLists() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<Ev[]>([])
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('name')

  useEffect(() => {
    (async () => {
      const [{ data }, ev] = await Promise.all([
        supabase.from('wishlists').select('id,owner_id,title,items(count)').neq('owner_id', session!.user.id),
        supabase.from('events').select('id,name,event_date,event_members(user_id)'),
      ])
      const r = (data as unknown as Row[]) ?? []
      setRows(r)
      setEvents((ev.data as unknown as Ev[]) ?? [])
      if (r.length) {
        const { data: p } = await supabase.from('profiles').select('id,display_name').in('id', r.map(x => x.owner_id))
        setNames(Object.fromEntries((p ?? []).map((x: { id: string; display_name: string }) => [x.id, x.display_name])))
      }
      setLoading(false)
    })()
  }, [session])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const m = paste.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (!m) { setErr('Lien non reconnu. Collez le lien complet reçu de votre proche.'); return }
    nav(`/l/${m[0]}`)
  }
  const close = () => { setOpen(false); setErr(''); setPaste('') }

  // événements de chaque propriétaire de liste (ceux que vous avez en commun), du plus proche au plus lointain
  const today = new Date().toISOString().slice(0, 10)
  const evOf = useMemo(() => {
    const m: Record<string, Ev[]> = {}
    for (const e of events) for (const mem of e.event_members ?? []) (m[mem.user_id] ??= []).push(e)
    for (const k in m) m[k].sort((a, b) => {
      const fa = a.event_date >= today, fb = b.event_date >= today
      if (fa !== fb) return fa ? -1 : 1
      return fa ? a.event_date.localeCompare(b.event_date) : b.event_date.localeCompare(a.event_date)
    })
    return m
  }, [events, today])

  const shown = useMemo(() => {
    const nm = (r: Row) => names[r.owner_id] ?? ''
    const needle = norm(q.trim())
    const list = rows.filter(r => !needle || norm([nm(r), r.title, ...(evOf[r.owner_id] ?? []).map(e => e.name)].join(' ')).includes(needle))
    return list.sort((a, b) => {
      if (sort === 'event') {
        const ea = evOf[a.owner_id]?.[0], eb = evOf[b.owner_id]?.[0]
        if (!ea !== !eb) return ea ? -1 : 1
        if (ea && eb) {
          const c = ea.name.localeCompare(eb.name, 'fr', { sensitivity: 'base' })
          if (c) return c
        }
      }
      return nm(a).localeCompare(nm(b), 'fr', { sensitivity: 'base' })
    })
  }, [rows, names, evOf, q, sort])

  if (loading) return <Spinner />
  return (
    <div className="narrow">
      <div className="page-head">
        <h1>Listes de mes proches</h1>
        <button className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="link" size={16} /> J'ai reçu un lien</button>
      </div>

      {rows.length === 0 ? (
        <p className="muted">Aucune liste pour l'instant. Ouvrez un lien de partage reçu, ou rejoignez un événement : les listes des invités apparaissent ici.</p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: '.9rem' }}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un nom, une liste, un événement…" aria-label="Rechercher" />
            <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Classer par" style={{ width: 'auto' }}>
              <option value="name">Classer par nom</option>
              <option value="event">Classer par événement</option>
            </select>
          </div>
          {shown.length === 0 && <p className="muted">Aucun résultat pour « {q} ».</p>}
          <ul className="items">
            {shown.map(r => {
              const ev = evOf[r.owner_id] ?? []
              return (
                <li key={r.id}>
                  <Link className="card item linkcard" to={`/listes/${r.id}`}>
                    <div className="item-main">
                      <strong>{names[r.owner_id] ?? 'Quelqu\'un'}</strong>
                      <p className="small muted">{r.title} · {r.items[0]?.count ?? 0} cadeau(x)</p>
                      {ev.length > 0 && <p className="small muted">{ev.slice(0, 3).map(e => e.name).join(' · ')}{ev.length > 3 ? ` +${ev.length - 3}` : ''}</p>}
                    </div>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {open && (
        <Modal title="J'ai reçu un lien" onClose={close}>
          <form className="stack" onSubmit={submit}>
            <Notice>{err}</Notice>
            <p className="small muted">Collez le lien de partage d'une liste que l'on vous a envoyé.</p>
            <input value={paste} onChange={e => setPaste(e.target.value)} placeholder="Collez le lien de partage ici" autoFocus />
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={close}>Annuler</button>
              <button className="btn btn-primary">Ouvrir</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
