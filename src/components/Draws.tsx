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

/** Couleur pastel stable par prénom : chaque personne a la sienne, d'un tirage à l'autre */
const TINTS = ['bleu', 'vert', 'jaune', 'violet', 'corail']
export function tint(name: string): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

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
  const [showPeople, setShowPeople] = useState<Record<string, boolean>>({})

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
          const people = [...d.participants].sort((x, y) => x.name.localeCompare(y.name, 'fr', { sensitivity: 'base' }))
          const peopleOpen = !!showPeople[d.id]
          return (
            <section key={d.id} className={`card draw-card${d.done_at ? ' is-done' : ''}`}>
              <div className="draw-top">
                <div className="draw-title">
                  <strong>{d.name}</strong>
                  <span className={`draw-status ${d.done_at ? 'ok' : 'wait'}`}>
                    {d.done_at ? <><Icon name="check" size={13} /> Tiré le {formatDateShort(d.done_at)}</> : 'Pas encore tiré'}
                  </span>
                </div>
                {isOrg && (
                  <ActionMenu label={`Options du tirage ${d.name}`} actions={[
                    { icon: 'pencil', label: 'Modifier les participants', onClick: () => setEditing(d) },
                    !!d.done_at && { icon: 'dice', label: 'Refaire le tirage', onClick: () => run(d) },
                    !!d.done_at && { icon: 'x', label: 'Annuler le tirage', onClick: () => reset(d) },
                    { icon: 'trash', label: 'Supprimer ce tirage', danger: true, onClick: () => remove(d) },
                  ]} />
                )}
              </div>

              {/* résultat : la grande carte cadeau */}
              {d.done_at && d.mine.length > 0 && (open ? (
                <div className="draw-results">
                  {d.mine.map(m => {
                    const href = listLink(m)
                    return (
                      <div key={m.giver} className="draw-gift">
                        <span className="draw-gift-who">{m.giver_kind === 'me' ? 'Vous offrez à' : `${m.giver_name} offre à`}</span>
                        <PersonDot name={m.receiver_name ?? '?'} color={m.receiver_kind === 'kid' ? (m.receiver_color ?? 'corail') : tint(m.receiver_name ?? '?')} size={64} />
                        <strong className="draw-gift-name">{m.receiver_name ?? 'une personne qui a quitté l\'événement'}</strong>
                        {href && <Link className="btn btn-primary" to={href}><Icon name="gift" size={16} /> Voir sa liste</Link>}
                      </div>
                    )
                  })}
                  {d.mine.some(m => m.giver_kind === 'kid') && <p className="small muted center" style={{ margin: 0 }}>Vous voyez aussi le résultat de vos enfants.</p>}
                  <button type="button" className="linklike small draw-hide" onClick={() => setShown(s => ({ ...s, [d.id]: false }))}>Cacher le résultat</button>
                </div>
              ) : (
                <button type="button" className="draw-mystery" onClick={() => setShown(s => ({ ...s, [d.id]: true }))}>
                  <span className="draw-mystery-box" aria-hidden>🎁</span>
                  <strong>{d.mine.length > 1 ? 'Découvrir les résultats' : 'Découvrir à qui j\'offre'}</strong>
                  <span className="small">Touchez pour ouvrir</span>
                </button>
              ))}
              {d.done_at && !d.mine.length && iAmIn && <p className="small muted" style={{ margin: 0 }}>Pas encore de résultat pour vous : le tirage a eu lieu avant votre arrivée.</p>}
              {!d.done_at && !isOrg && (iAmIn || d.mine.length > 0) && (
                <div className="draw-waiting"><span aria-hidden>⏳</span><span>Le tirage n'a pas encore eu lieu.<br /><span className="small muted">L'organisateur le lancera bientôt.</span></span></div>
              )}
              {stale && <Notice kind="info">Les participants ont changé depuis le tirage{isOrg ? ' : pensez à le refaire.' : ' : demandez à l\'organisateur de le refaire.'}</Notice>}

              {/* participants : pastilles empilées, la liste complète au toucher */}
              <button type="button" className="draw-stack" onClick={() => setShowPeople(s => ({ ...s, [d.id]: !peopleOpen }))} aria-expanded={peopleOpen}>
                <span className="draw-avatars">
                  {people.slice(0, 7).map(p => <PersonDot key={p.pid} name={p.name} color={p.kind === 'kid' ? (p.color ?? 'corail') : tint(p.name)} size={34} />)}
                  {people.length > 7 && <span className="pdot draw-more">+{people.length - 7}</span>}
                </span>
                <span className="draw-stack-txt">{plural(people.length, 'participant')}<span className={`draw-chev${peopleOpen ? ' up' : ''}`}><Icon name="chevron" size={15} /></span></span>
              </button>
              {peopleOpen && (
                <div className="draw-people">
                  {people.map(p => (
                    <span key={p.pid} className="draw-person"><PersonDot name={p.name} color={p.kind === 'kid' ? (p.color ?? 'corail') : tint(p.name)} size={40} /><span>{p.name}</span></span>
                  ))}
                </div>
              )}

              {isOrg && !d.done_at && (
                <button type="button" className="btn btn-primary draw-launch" disabled={d.participants.length < 2 || busy === d.id} onClick={() => run(d)}>
                  <Icon name="dice" size={18} /> {busy === d.id ? 'Tirage en cours…' : 'Lancer le tirage'}
                </button>
              )}
              {isOrg && (
                <div className="draw-org">
                  <button type="button" className="btn btn-sm" onClick={() => setEditing(d)}><Icon name="users" size={15} /> Modifier</button>
                  {d.done_at && <button type="button" className="btn btn-sm btn-ghost" disabled={busy === d.id} onClick={() => run(d)}><Icon name="dice" size={15} /> {busy === d.id ? 'Tirage…' : 'Refaire'}</button>}
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
  const [first, setFirst] = useState<string | null>(null)   // 1re personne choisie pour une exclusion
  const [pairing, setPairing] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  const cand = (pid: string) => candidates.find(c => c.pid === pid)
  const nm = (pid: string) => cand(pid)?.name ?? '—'
  const dot = (pid: string, size: number) => {
    const c = cand(pid)
    return <PersonDot name={c?.name ?? '?'} color={c?.kind === 'kid' ? (c.color ?? 'corail') : tint(c?.name ?? '?')} size={size} />
  }
  const otherDraws = (pid: string) => draws.filter(d => d.id !== draw?.id && d.participants.some(p => p.pid === pid)).map(d => d.name)
  const toggle = (pid: string) => setPicked(s => {
    const n = new Set(s)
    if (n.has(pid)) { n.delete(pid); setBlocks(bl => bl.filter(x => x.giver !== pid && x.receiver !== pid)) } else n.add(pid)
    return n
  })
  const sorted = [...candidates].sort((x, y) => x.name.localeCompare(y.name, 'fr', { sensitivity: 'base' }))
  const inDraw = sorted.filter(c => picked.has(c.pid))
  const allOn = candidates.every(c => picked.has(c.pid))
  const pairs = groupBlocks(blocks, nm)

  // exclusion : on touche une personne, puis une autre → elles ne se tirent pas (dans les deux sens)
  const tapPair = (pid: string) => {
    if (!first) { setFirst(pid); return }
    if (first === pid) { setFirst(null); return }
    setBlocks(bl => {
      const n = [...bl]
      const add = (g: string, r: string) => { if (!n.some(x => x.giver === g && x.receiver === r)) n.push({ giver: g, receiver: r }) }
      add(first, pid); add(pid, first)
      return n
    })
    setFirst(null); setPairing(false)
  }
  const removePair = (g: { a: string; b: string; both: boolean }) =>
    setBlocks(bl => bl.filter(x => !((x.giver === g.a && x.receiver === g.b) || (g.both && x.giver === g.b && x.receiver === g.a))))
  // ⇄ → → : la 2e personne peut quand même offrir à la 1re
  const toggleWay = (g: { a: string; b: string; both: boolean }) =>
    setBlocks(bl => g.both ? bl.filter(x => !(x.giver === g.b && x.receiver === g.a)) : [...bl, { giver: g.b, receiver: g.a }])

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
    <Modal title={draw ? 'Modifier le tirage' : 'Nouveau tirage'} onClose={onClose} wide>
      <form className="stack draw-editor" onSubmit={save}>
        <input className="draw-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Nom du tirage, par exemple : Les enfants" aria-label="Nom du tirage" autoFocus={!draw} />

        <div className="draw-step">
          <div className="draw-step-head">
            <span className="draw-step-n">1</span>
            <strong>Qui participe ?</strong>
            <span className="draw-count">{picked.size}<span className="muted"> / {candidates.length}</span></span>
            <button type="button" className="linklike small" onClick={() => setPicked(allOn ? new Set() : new Set(candidates.map(c => c.pid)))}>{allOn ? 'Aucun' : 'Tous'}</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Touchez une personne pour l'ajouter ou la retirer.</p>
          <div className="draw-grid">
            {sorted.map(c => {
              const on = picked.has(c.pid)
              const also = otherDraws(c.pid)
              return (
                <button key={c.pid} type="button" className={`draw-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(c.pid)}
                  title={also.length ? `Aussi dans : ${also.join(', ')}` : undefined}>
                  <span className="draw-tile-dot">{dot(c.pid, 52)}{on && <span className="draw-tick"><Icon name="check" size={13} /></span>}</span>
                  <span className="draw-tile-name">{c.pid === me ? 'Vous' : c.name}</span>
                  {c.kind === 'kid' && <span className="draw-tile-tag">sans compte</span>}
                  {also.length > 0 && <span className="draw-tile-tag">aussi « {also[0]} »</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="draw-step">
          <div className="draw-step-head">
            <span className="draw-step-n">2</span>
            <strong>Qui ne doit pas tomber sur qui ?</strong>
            <span className="small muted">facultatif</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Un couple, un frère et une sœur, ceux qui se sont tirés l'an dernier…</p>
          {pairs.length > 0 && (
            <div className="draw-pairs">
              {pairs.map(g => (
                <div key={g.label} className="draw-pair">
                  {dot(g.a, 36)}<span className="draw-pair-name">{g.a === me ? 'Vous' : nm(g.a)}</span>
                  <button type="button" className="draw-way" onClick={() => toggleWay(g)} title={g.both ? 'Ni l\'un ni l\'autre (toucher pour un seul sens)' : `Seulement ${nm(g.a)} → ${nm(g.b)} (toucher pour les deux sens)`}>
                    {g.both ? '⇄' : '→'}
                  </button>
                  {dot(g.b, 36)}<span className="draw-pair-name">{g.b === me ? 'Vous' : nm(g.b)}</span>
                  <button type="button" className="draw-pair-x" onClick={() => removePair(g)} aria-label={`Retirer ${g.label}`}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
          )}
          {pairing ? (
            <div className="draw-pairing">
              <p className="small" style={{ margin: 0 }}>{first ? (first === me ? <>Sur qui <strong>vous</strong> ne devez pas tomber ?</> : <>Avec qui <strong>{nm(first)}</strong> ne doit-il pas tomber ?</>) : 'Touchez la première personne'}</p>
              <div className="draw-grid small-grid">
                {inDraw.map(c => (
                  <button key={c.pid} type="button" className={`draw-tile${first === c.pid ? ' on' : ''}`} onClick={() => tapPair(c.pid)}>
                    <span className="draw-tile-dot">{dot(c.pid, 40)}</span>
                    <span className="draw-tile-name">{c.pid === me ? 'Vous' : c.name}</span>
                  </button>
                ))}
              </div>
              <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPairing(false); setFirst(null) }}>Fermer</button></div>
            </div>
          ) : (
            <div><button type="button" className="btn btn-sm" disabled={inDraw.length < 2} onClick={() => setPairing(true)}><Icon name="plus" size={15} /> Ajouter une exception</button></div>
          )}
        </div>

        {draw?.done_at && <Notice kind="info">Ce tirage a déjà eu lieu : après une modification, pensez à le refaire.</Notice>}
        <Notice>{err}</Notice>
        <div className="row gap modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || picked.size < 2}>{busy ? 'Enregistrement…' : draw ? 'Enregistrer' : `Créer le tirage (${picked.size})`}</button>
        </div>
      </form>
    </Modal>
  )
}
