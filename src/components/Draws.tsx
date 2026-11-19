import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { formatDateShort } from '../lib/format'
import { Notice } from './ui'
import { PersonDot } from './ListPills'
import { useConfirm } from './Confirm'
import Icon from './Icon'
import Modal from './Modal'
import ActionMenu from './ActionMenu'

/** Participant possible d'un tirage : un invité (compte) ou une liste d'enfant visible dans l'événement */
export interface DrawCandidate { pid: string; kind: 'user' | 'kid'; name: string; color: string | null; owner_id: string; ownerName: string }
interface Participant { pid: string; kind: 'user' | 'kid'; name: string; color: string | null; owner_id: string }
interface Block { giver: string; receiver: string }
interface Mine { giver: string; giver_kind: 'me' | 'kid'; giver_name: string; receiver: string; receiver_name: string | null; receiver_kind: 'user' | 'kid'; receiver_color: string | null; receiver_list: string | null }
interface Draw { id: string; name: string; done_at: string | null; done_count: number | null; participants: Participant[]; blocks: Block[]; mine: Mine[] }

const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`

/** Regroupe les exclusions réciproques : « A ↔ B » */
function groupBlocks(blocks: Block[], name: (pid: string) => string) {
  const seen = new Set<string>()
  const out: { label: string; a: string; b: string; both: boolean }[] = []
  for (const x of blocks) {
    const k = `${x.giver}>${x.receiver}`
    if (seen.has(k)) continue
    seen.add(k)
    const rev = blocks.some(y => y.giver === x.receiver && y.receiver === x.giver)
    if (rev) seen.add(`${x.receiver}>${x.giver}`)
    out.push({ label: rev ? `${name(x.giver)} ↔ ${name(x.receiver)}` : `${name(x.giver)} → ${name(x.receiver)} (à sens unique)`, a: x.giver, b: x.receiver, both: rev })
  }
  return out
}

export default function Draws({ eventId, isOrg, me, candidates, pendingInvites, openNew, onChanged }: {
  eventId: string; isOrg: boolean; me: string; candidates: DrawCandidate[]; pendingInvites: number
  openNew: number                // incrémenté par la page pour ouvrir « Nouveau tirage »
  onChanged?: () => void
}) {
  const confirm = useConfirm()
  const [draws, setDraws] = useState<Draw[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Draw | 'new' | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('event_draws', { p_event: eventId })
    if (error) { setErr(errMsg(error)); setDraws([]); return }
    setDraws((data as Draw[]) ?? [])
  }, [eventId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (openNew > 0 && isOrg) setEditing('new') }, [openNew, isOrg])

  if (!draws) return null
  if (!draws.length && !isOrg) return null

  const kidOf = (pid: string) => candidates.find(c => c.pid === pid)
  const listLink = (m: Mine) => {
    if (!m.receiver_list) return null
    const c = kidOf(m.receiver)
    if (m.receiver_kind === 'kid' && c?.owner_id === me) return `/?liste=${m.receiver_list}`
    return `/listes/${m.receiver_list}`
  }

  const sendMails = async (drawId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('send-draw-email', { body: { draw_id: drawId } })
    const r = data as { sent?: number; total?: number; reason?: string; error?: string } | null
    if (r?.reason === 'not_configured') return 'L\'envoi d\'e-mails n\'est pas encore activé sur le site.'
    if (r?.reason === 'refused') return r.error ?? 'Les e-mails n\'ont pas pu être envoyés.'
    if (error || !r) return 'Les e-mails n\'ont pas pu être envoyés.'
    return r.sent === r.total ? `${plural(r.sent ?? 0, 'e-mail')} d'annonce envoyé${(r.sent ?? 0) > 1 ? 's' : ''}.` : `${r.sent} e-mail(s) envoyé(s) sur ${r.total}.`
  }
  const run = async (d: Draw) => {
    if (d.done_at && !(await confirm({ title: `Refaire « ${d.name} » ?`, message: 'Les résultats actuels de ce tirage seront remplacés et chaque participant sera prévenu.', confirmLabel: 'Refaire le tirage', danger: true }))) return
    setErr(''); setMsg(''); setBusy(d.id)
    const { error } = await supabase.rpc('run_one_draw', { p_draw: d.id })
    if (error) { setBusy(''); setErr(errMsg(error)); return }
    setShown(s => ({ ...s, [d.id]: false }))
    const mails = await sendMails(d.id)
    setBusy('')
    setMsg(`Tirage « ${d.name} » effectué ! Chaque participant a reçu une notification. ${mails}`)
    await load(); onChanged?.()
  }
  const reset = async (d: Draw) => {
    if (!(await confirm({ title: `Annuler « ${d.name} » ?`, message: 'Les résultats de ce tirage seront effacés pour tout le monde.', confirmLabel: 'Annuler le tirage', danger: true }))) return
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('reset_one_draw', { p_draw: d.id })
    if (error) setErr(errMsg(error)); else setMsg('Tirage annulé.')
    await load(); onChanged?.()
  }
  const remove = async (d: Draw) => {
    if (!(await confirm({ title: `Supprimer « ${d.name} » ?`, message: d.done_at ? 'Le tirage et ses résultats seront supprimés pour tout le monde.' : 'Le tirage sera supprimé.', confirmLabel: 'Supprimer', danger: true }))) return
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('delete_draw', { p_draw: d.id })
    if (error) setErr(errMsg(error))
    await load(); onChanged?.()
  }

  const inSome = new Set(draws.flatMap(d => d.participants.map(p => p.pid)))
  const outside = candidates.filter(c => c.kind === 'user' && !inSome.has(c.pid))

  return (
    <>
      <div className="mt row between draws-head" id="tirage">
        <h2 className="row" style={{ margin: 0 }}><Icon name="dice" size={20} /> {draws.length > 1 ? 'Tirages au sort' : 'Tirage au sort'}</h2>
        {isOrg && draws.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={15} /> Ajouter un tirage</button>}
      </div>
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {!draws.length && isOrg && (
        <section className="card stack">
          <p className="muted" style={{ margin: 0 }}>Aucun tirage pour l'instant. Créez-en un, ou plusieurs : par exemple « Les parents » et « Les enfants ».</p>
          <div><button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Créer un tirage</button></div>
        </section>
      )}

      <div className="draws">
        {draws.map(d => {
          const iAmIn = d.participants.some(p => p.pid === me)
          const stale = Boolean(d.done_at) && d.done_count !== d.participants.length
          const open = !!shown[d.id]
          return (
            <section key={d.id} className="card draw-card">
              <div className="draw-top">
                <div className="draw-title">
                  <strong>{d.name}</strong>
                  <span className="small muted">{plural(d.participants.length, 'participant')}{d.done_at ? ` · tiré le ${formatDateShort(d.done_at)}` : ''}</span>
                </div>
                {d.done_at ? <span className="tag tag-ok">Tiré</span> : <span className="tag tag-wait">Pas encore tiré</span>}
                {isOrg && (
                  <ActionMenu label={`Options du tirage ${d.name}`} actions={[
                    { icon: 'pencil', label: 'Modifier (nom, participants, exclusions)', onClick: () => setEditing(d) },
                    !!d.done_at && { icon: 'x', label: 'Annuler le tirage', onClick: () => reset(d) },
                    { icon: 'trash', label: 'Supprimer ce tirage', danger: true, onClick: () => remove(d) },
                  ]} />
                )}
              </div>

              {d.done_at && d.mine.length > 0 && (open ? (
                <div className="draw-results">
                  {d.mine.map(m => {
                    const href = listLink(m)
                    return (
                      <div key={m.giver} className="draw-result">
                        <PersonDot name={m.receiver_name ?? '?'} color={m.receiver_kind === 'kid' ? (m.receiver_color ?? 'corail') : undefined} size={34} />
                        <div className="draw-result-txt">
                          <span className="small muted">{m.giver_kind === 'me' ? 'Vous offrez à' : `${m.giver_name} offre à`}</span>
                          <strong>{m.receiver_name ?? 'une personne qui a quitté l\'événement'}</strong>
                        </div>
                        {href && <Link className="btn btn-sm" to={href}>Voir sa liste</Link>}
                      </div>
                    )
                  })}
                  {d.mine.some(m => m.giver_kind === 'kid') && <p className="small muted" style={{ margin: 0 }}>Vous voyez le résultat de vos enfants parce que ce sont vos listes.</p>}
                  <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(s => ({ ...s, [d.id]: false }))}>Masquer</button></div>
                </div>
              ) : (
                <button type="button" className="btn btn-primary draw-reveal" onClick={() => setShown(s => ({ ...s, [d.id]: true }))}>
                  <Icon name="dice" size={17} /> {d.mine.length > 1 ? 'Découvrir les résultats' : 'Découvrir à qui j\'offre'}
                </button>
              ))}
              {d.done_at && !d.mine.length && iAmIn && <p className="small muted" style={{ margin: 0 }}>Pas encore de résultat pour vous : le tirage a eu lieu avant votre arrivée.</p>}
              {!d.done_at && !isOrg && (iAmIn || d.mine.length > 0) && <p className="small muted" style={{ margin: 0 }}>Le tirage n'a pas encore eu lieu. L'organisateur le lancera.</p>}
              {stale && <Notice kind="info">Les participants ont changé depuis le tirage{isOrg ? ' : pensez à le refaire.' : ' : demandez à l\'organisateur de le refaire.'}</Notice>}

              <div className="draw-people">
                {d.participants.map(p => (
                  <span key={p.pid} className="draw-chip"><PersonDot name={p.name} color={p.kind === 'kid' ? (p.color ?? 'corail') : undefined} size={22} />{p.name}</span>
                ))}
              </div>

              {isOrg && (
                <div className="row wrap gap">
                  <button type="button" className={`btn btn-sm ${d.done_at ? '' : 'btn-primary'}`} disabled={d.participants.length < 2 || busy === d.id} onClick={() => run(d)}>
                    <Icon name="dice" size={15} /> {busy === d.id ? 'Tirage…' : d.done_at ? 'Refaire' : 'Lancer le tirage'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(d)}>Modifier</button>
                  {d.participants.length < 2 && <span className="small muted">Il faut au moins 2 participants.</span>}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {isOrg && draws.length > 0 && (
        <>
          {outside.length > 0 && <p className="small muted">Dans aucun tirage : {outside.map(c => c.name).join(', ')}.</p>}
          {pendingInvites > 0 && <p className="small muted">{plural(pendingInvites, 'personne')} n'{pendingInvites > 1 ? 'ont' : 'a'} pas encore rejoint l'événement : on pourra l{pendingInvites > 1 ? 'es' : 'a'} ajouter au tirage ensuite.</p>}
        </>
      )}

      {editing && (
        <DrawEditor eventId={eventId} draw={editing === 'new' ? null : editing} draws={draws} candidates={candidates} me={me} isFirst={!draws.length}
          onClose={() => setEditing(null)}
          onSaved={async (name, isNew) => { setEditing(null); setErr(''); setMsg(isNew ? `Tirage « ${name} » créé.` : 'Tirage enregistré.'); await load(); onChanged?.() }} />
      )}
    </>
  )
}

function DrawEditor({ eventId, draw, draws, candidates, me, isFirst, onClose, onSaved }: {
  eventId: string; draw: Draw | null; draws: Draw[]; candidates: DrawCandidate[]; me: string; isFirst: boolean
  onClose: () => void; onSaved: (name: string, isNew: boolean) => void
}) {
  const [name, setName] = useState(draw?.name ?? (isFirst ? 'Tirage au sort' : ''))
  const [picked, setPicked] = useState<Set<string>>(() => new Set(draw ? draw.participants.map(p => p.pid) : isFirst ? candidates.filter(c => c.kind === 'user').map(c => c.pid) : []))
  const [blocks, setBlocks] = useState<Block[]>(draw?.blocks ?? [])
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [both, setBoth] = useState(true)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  const label = (c: DrawCandidate) => {
    const others = draws.filter(d => d.id !== draw?.id && d.participants.some(p => p.pid === c.pid)).map(d => `« ${d.name} »`)
    const base = c.kind === 'kid' ? `Liste d'enfant · ${c.owner_id === me ? 'vous' : c.ownerName}` : c.pid === me ? 'Vous' : 'Invité'
    return others.length ? `${base} · aussi dans ${others.join(', ')}` : base
  }
  const nm = (pid: string) => candidates.find(c => c.pid === pid)?.name ?? '—'
  const toggle = (pid: string) => setPicked(s => {
    const n = new Set(s)
    if (n.has(pid)) { n.delete(pid); setBlocks(bl => bl.filter(x => x.giver !== pid && x.receiver !== pid)) } else n.add(pid)
    return n
  })
  const sorted = [...candidates].sort((x, y) => x.name.localeCompare(y.name, 'fr', { sensitivity: 'base' }))
  const inDraw = sorted.filter(c => picked.has(c.pid))
  const allOn = candidates.every(c => picked.has(c.pid))
  const addBlock = () => {
    if (!a || !b || a === b) { setErr('Choisissez deux personnes différentes.'); return }
    setErr('')
    setBlocks(bl => {
      const n = [...bl]
      const add = (g: string, r: string) => { if (!n.some(x => x.giver === g && x.receiver === r)) n.push({ giver: g, receiver: r }) }
      add(a, b); if (both) add(b, a)
      return n
    })
    setA(''); setB('')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setErr('Donnez un nom au tirage.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('save_draw', { p_event: eventId, p_draw: draw?.id ?? null, p_name: name.trim(), p_pids: [...picked] })
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    const id = data as string
    const before = draw?.blocks.filter(x => picked.has(x.giver) && picked.has(x.receiver)) ?? []
    const key = (x: Block) => `${x.giver}>${x.receiver}`
    const now = new Set(blocks.map(key)), was = new Set(before.map(key))
    for (const x of blocks.filter(x => !was.has(key(x)))) {
      const r = await supabase.rpc('set_draw_block', { p_draw: id, p_giver: x.giver, p_receiver: x.receiver, p_on: true, p_both: false })
      if (r.error) { setBusy(false); setErr(errMsg(r.error)); return }
    }
    for (const x of before.filter(x => !now.has(key(x)))) {
      const r = await supabase.rpc('set_draw_block', { p_draw: id, p_giver: x.giver, p_receiver: x.receiver, p_on: false, p_both: false })
      if (r.error) { setBusy(false); setErr(errMsg(r.error)); return }
    }
    setBusy(false)
    onSaved(name.trim(), !draw)
  }

  return (
    <Modal title={draw ? `Modifier « ${draw.name} »` : 'Nouveau tirage'} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <label>Nom du tirage
          <input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Par exemple : Les enfants" autoFocus={!draw} />
        </label>
        <div className="row between">
          <strong>Qui participe ?</strong>
          <span className="row gap small">
            <span className="muted">{plural(picked.size, 'sélectionné')}</span>
            <button type="button" className="linklike" onClick={() => setPicked(allOn ? new Set() : new Set(candidates.map(c => c.pid)))}>{allOn ? 'Tout décocher' : 'Tout cocher'}</button>
          </span>
        </div>
        <div className="draw-pick">
          {sorted.map(c => (
            <label key={c.pid} className="draw-pick-row">
              <input type="checkbox" checked={picked.has(c.pid)} onChange={() => toggle(c.pid)} />
              <PersonDot name={c.name} color={c.kind === 'kid' ? (c.color ?? 'corail') : undefined} size={30} />
              <span className="draw-pick-txt"><strong>{c.name}</strong><span className="small muted">{label(c)}</span></span>
            </label>
          ))}
        </div>
        {draw?.done_at && <p className="small muted" style={{ margin: 0 }}>Ce tirage a déjà eu lieu : après une modification, pensez à le refaire.</p>}

        <details className="draw-excl" open={blocks.length > 0}>
          <summary>Qui ne doit pas s'offrir de cadeau ?{blocks.length > 0 ? ` (${groupBlocks(blocks, nm).length})` : ''}</summary>
          <p className="small muted">Par exemple un couple, un frère et une sœur, ou deux personnes qui se sont tirées l'an dernier.</p>
          {blocks.length > 0 && (
            <ul className="plain">
              {groupBlocks(blocks, nm).map(g => (
                <li key={g.label} className="row between">
                  <span>{g.label}</span>
                  <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setBlocks(bl => bl.filter(x => !((x.giver === g.a && x.receiver === g.b) || (g.both && x.giver === g.b && x.receiver === g.a))))}>Retirer</button>
                </li>
              ))}
            </ul>
          )}
          <div className="row wrap gap">
            <select value={a} onChange={e => setA(e.target.value)} aria-label="Personne A">
              <option value="">Personne A…</option>
              {inDraw.map(c => <option key={c.pid} value={c.pid}>{c.name}</option>)}
            </select>
            <span className="muted">ne doit pas offrir à</span>
            <select value={b} onChange={e => setB(e.target.value)} aria-label="Personne B">
              <option value="">Personne B…</option>
              {inDraw.filter(c => c.pid !== a).map(c => <option key={c.pid} value={c.pid}>{c.name}</option>)}
            </select>
          </div>
          <label className="radio small"><input type="checkbox" checked={both} onChange={e => setBoth(e.target.checked)} /> Dans les deux sens (B non plus à A)</label>
          <div><button type="button" className="btn btn-sm" onClick={addBlock}>Ajouter l'exclusion</button></div>
        </details>

        <Notice>{err}</Notice>
        <div className="row gap modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : draw ? 'Enregistrer' : 'Créer le tirage'}</button>
        </div>
      </form>
    </Modal>
  )
}
