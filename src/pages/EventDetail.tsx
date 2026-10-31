import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, eventInviteUrl } from '../lib/supabase'
import { formatDate, formatDateShort } from '../lib/format'
import type { EventRow, MemberRow } from '../lib/types'
import { CopyField, Notice, Spinner } from '../components/ui'

interface Excl { giver_id: string; receiver_id: string }

export default function EventDetail() {
  const { id } = useParams()
  const { session } = useAuth()
  const me = session!.user.id
  const nav = useNavigate()

  const [ev, setEv] = useState<EventRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [lists, setLists] = useState<Record<string, string>>({})
  const [excl, setExcl] = useState<Excl[]>([])
  const [myTarget, setMyTarget] = useState<string | null>(null)
  const [showTarget, setShowTarget] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [eName, setEName] = useState('')
  const [eDate, setEDate] = useState('')
  const [exGiver, setExGiver] = useState('')
  const [exReceiver, setExReceiver] = useState('')
  const [exBoth, setExBoth] = useState(true)

  const load = useCallback(async () => {
    const { data: e } = await supabase.from('events').select('*').eq('id', id!).maybeSingle()
    if (!e) { setEv(null); setLoading(false); return }
    setEv(e as EventRow)
    const { data: m } = await supabase.from('event_members').select('event_id,user_id,in_draw,profiles(display_name)').eq('event_id', id!)
    const mem = ((m as unknown as MemberRow[]) ?? []).sort((a, b) => (a.profiles?.display_name ?? '').localeCompare(b.profiles?.display_name ?? ''))
    setMembers(mem)
    const [w, x, a] = await Promise.all([
      supabase.from('wishlists').select('id,owner_id').in('owner_id', mem.map(k => k.user_id)),
      supabase.from('draw_exclusions').select('giver_id,receiver_id').eq('event_id', id!),
      supabase.from('draw_assignments').select('receiver_id').eq('event_id', id!).maybeSingle(),
    ])
    setLists(Object.fromEntries(((w.data as { id: string; owner_id: string }[]) ?? []).map(l => [l.owner_id, l.id])))
    setExcl((x.data as Excl[]) ?? [])
    setMyTarget((a.data as { receiver_id: string } | null)?.receiver_id ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const name = (uid: string) => members.find(m => m.user_id === uid)?.profiles?.display_name ?? '—'
  const isOrg = ev?.created_by === me
  const inDraw = members.filter(m => m.in_draw)
  const meInDraw = members.find(m => m.user_id === me)?.in_draw ?? false

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok = '') => {
    setErr(''); setMsg('')
    const { error } = await fn()
    if (error) setErr(errMsg(error)); else if (ok) setMsg(ok)
    await load()
  }

  const saveEvent = async (e: FormEvent) => {
    e.preventDefault()
    await run(() => supabase.from('events').update({ name: eName.trim(), event_date: eDate }).eq('id', id!), 'Événement mis à jour.')
    setEditing(false)
  }
  const deleteEvent = async () => {
    if (!confirm('Supprimer cet événement pour tout le monde ?')) return
    const { error } = await supabase.from('events').delete().eq('id', id!)
    if (error) setErr(errMsg(error)); else nav('/evenements', { replace: true })
  }
  const leave = async () => {
    if (!confirm('Quitter cet événement ?')) return
    const { error } = await supabase.from('event_members').delete().eq('event_id', id!).eq('user_id', me)
    if (error) setErr(errMsg(error)); else nav('/evenements', { replace: true })
  }
  const addExcl = async () => {
    if (!exGiver || !exReceiver || exGiver === exReceiver) { setErr('Choisissez deux personnes différentes.'); return }
    const rows = [{ event_id: id!, giver_id: exGiver, receiver_id: exReceiver }]
    if (exBoth) rows.push({ event_id: id!, giver_id: exReceiver, receiver_id: exGiver })
    await run(() => supabase.from('draw_exclusions').upsert(rows, { onConflict: 'event_id,giver_id,receiver_id', ignoreDuplicates: true }))
    setExGiver(''); setExReceiver('')
  }
  const delExcl = async (pairs: Excl[]) => {
    for (const p of pairs) {
      const { error } = await supabase.from('draw_exclusions').delete().eq('event_id', id!).eq('giver_id', p.giver_id).eq('receiver_id', p.receiver_id)
      if (error) { setErr(errMsg(error)); break }
    }
    load()
  }
  const doDraw = async () => {
    if (ev?.draw_done_at && !confirm('Un tirage existe déjà. Le refaire remplacera tous les résultats actuels. Continuer ?')) return
    setShowTarget(false)
    await run(() => supabase.rpc('run_draw', { p_event: id }), 'Tirage effectué ! Chacun peut maintenant découvrir son résultat.')
  }
  const resetDraw = async () => {
    if (!confirm('Annuler le tirage ? Les résultats seront effacés.')) return
    setShowTarget(false)
    await run(() => supabase.rpc('reset_draw', { p_event: id }), 'Tirage annulé.')
  }

  if (loading) return <Spinner />
  if (!ev) return <Notice>Événement introuvable ou accès refusé.</Notice>

  // regroupe les exclusions réciproques : « A ↔ B »
  const shown = new Set<string>()
  const exclGroups: { label: string; pairs: Excl[] }[] = []
  for (const x of excl) {
    const k = `${x.giver_id}>${x.receiver_id}`
    if (shown.has(k)) continue
    const rev = excl.find(y => y.giver_id === x.receiver_id && y.receiver_id === x.giver_id)
    shown.add(k)
    if (rev) {
      shown.add(`${rev.giver_id}>${rev.receiver_id}`)
      exclGroups.push({ label: `${name(x.giver_id)} ↔ ${name(x.receiver_id)}`, pairs: [x, rev] })
    } else {
      exclGroups.push({ label: `${name(x.giver_id)} → ${name(x.receiver_id)} (à sens unique)`, pairs: [x] })
    }
  }

  const stale = Boolean(ev.draw_done_at) && ev.draw_count !== inDraw.length

  return (
    <div className="narrow">
      <p><Link to="/evenements" className="small">← Tous les événements</Link></p>
      {editing ? (
        <form className="card stack" onSubmit={saveEvent}>
          <label>Nom<input required value={eName} maxLength={120} onChange={e => setEName(e.target.value)} /></label>
          <label>Date de remise<input required type="date" value={eDate} onChange={e => setEDate(e.target.value)} /></label>
          <div className="row">
            <button className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <>
          <h1>{ev.name}</h1>
          <p className="muted">{formatDate(ev.event_date)}</p>
          {isOrg && <button className="btn btn-ghost btn-sm" onClick={() => { setEName(ev.name); setEDate(ev.event_date); setEditing(true) }}>Modifier le nom / la date</button>}
        </>
      )}
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      <section className="card stack mt">
        <h2>Inviter des proches</h2>
        <p className="small muted">Ils ouvrent ce lien, se connectent, et rejoignent l'événement. Les listes de tous les invités deviennent alors visibles entre eux.</p>
        <CopyField value={eventInviteUrl(ev.invite_code)} />
      </section>

      <h2 className="mt">Invités ({members.length})</h2>
      <ul className="items">
        {members.map(m => (
          <li key={m.user_id} className="card item">
            <div className="item-main">
              <strong>{m.profiles?.display_name ?? '—'}</strong>
              {m.user_id === ev.created_by && <span className="tag">organisateur</span>}
              {m.user_id === me && <span className="tag">vous</span>}
              {isOrg && (
                <label className="radio small">
                  <input type="checkbox" checked={m.in_draw}
                    onChange={e => run(() => supabase.from('event_members').update({ in_draw: e.target.checked }).eq('event_id', id!).eq('user_id', m.user_id))} />
                  participe au tirage
                </label>
              )}
            </div>
            <div className="item-actions">
              {m.user_id === me
                ? <Link className="btn btn-sm" to="/">Ma liste</Link>
                : lists[m.user_id] ? <Link className="btn btn-sm" to={`/listes/${lists[m.user_id]}`}>Voir sa liste</Link>
                : <span className="small muted">pas encore de liste</span>}
              {isOrg && m.user_id !== me && (
                <button className="btn btn-ghost btn-sm danger" onClick={() => confirm(`Retirer ${m.profiles?.display_name} ?`) && run(() => supabase.from('event_members').delete().eq('event_id', id!).eq('user_id', m.user_id))}>Retirer</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt">🎲 Tirage au sort</h2>
      <section className="card stack">
        {ev.draw_done_at ? (
          <>
            <p className="small muted">Tirage effectué le {formatDateShort(ev.draw_done_at)}.</p>
            {stale && <Notice kind="info">Les invités ont changé depuis le tirage{isOrg ? ' : pensez à le refaire.' : ' : demandez à l\'organisateur de le refaire.'}</Notice>}
            {myTarget ? (
              showTarget ? (
                <div className="reveal">
                  <p className="small muted">Vous offrez un cadeau à…</p>
                  <p className="big">{name(myTarget)}</p>
                  {lists[myTarget] && <Link className="btn btn-primary" to={`/listes/${lists[myTarget]}`}>Voir sa liste de souhaits</Link>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowTarget(false)}>Masquer</button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => setShowTarget(true)}>Découvrir à qui j'offre un cadeau</button>
              )
            ) : meInDraw ? (
              <p className="muted">Vous n'avez pas encore de résultat : le tirage a eu lieu avant votre arrivée.</p>
            ) : (
              <p className="muted">Vous ne participez pas à ce tirage.</p>
            )}
          </>
        ) : (
          <p className="muted">Le tirage n'a pas encore eu lieu.{isOrg ? '' : ' L\'organisateur le lancera.'}</p>
        )}

        {isOrg && (
          <>
            <hr />
            <h3>Qui ne doit pas s'offrir de cadeau ?</h3>
            <p className="small muted">Par exemple un couple, ou deux personnes qui se sont déjà tirées l'an dernier. Vous ne verrez pas le résultat du tirage des autres : seulement le vôtre.</p>
            {exclGroups.length > 0 && (
              <ul className="plain">
                {exclGroups.map(g => (
                  <li key={g.label} className="row between">
                    <span>{g.label}</span>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => delExcl(g.pairs)}>Retirer</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="row wrap gap">
              <select value={exGiver} onChange={e => setExGiver(e.target.value)}>
                <option value="">Personne A…</option>
                {inDraw.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
              </select>
              <span className="muted">ne doit pas offrir à</span>
              <select value={exReceiver} onChange={e => setExReceiver(e.target.value)}>
                <option value="">Personne B…</option>
                {inDraw.filter(m => m.user_id !== exGiver).map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
              </select>
            </div>
            <label className="radio small"><input type="checkbox" checked={exBoth} onChange={e => setExBoth(e.target.checked)} /> Dans les deux sens (B non plus à A)</label>
            <div><button className="btn btn-sm" onClick={addExcl}>Ajouter l'exclusion</button></div>
            <hr />
            <div className="row wrap gap">
              <button className="btn btn-primary" disabled={inDraw.length < 2} onClick={doDraw}>
                {ev.draw_done_at ? 'Refaire le tirage' : `Lancer le tirage (${inDraw.length} participants)`}
              </button>
              {ev.draw_done_at && <button className="btn btn-ghost" onClick={resetDraw}>Annuler le tirage</button>}
            </div>
            {inDraw.length < 2 && <p className="small muted">Il faut au moins 2 participants.</p>}
          </>
        )}
      </section>

      <div className="row gap mt">
        {!isOrg && <button className="btn btn-ghost danger" onClick={leave}>Quitter l'événement</button>}
        {isOrg && <button className="btn btn-ghost danger" onClick={deleteEvent}>Supprimer l'événement</button>}
      </div>
    </div>
  )
}
