import { useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import type { Wishlist } from '../lib/types'
import { Notice } from './ui'
import { PersonDot } from './ListPills'
import Modal from './Modal'
import { useConfirm } from './Confirm'

export interface ManagersInfo {
  owner: { id: string; name: string }
  managers: { id: string; name: string }[]
  invites: { id: string; label: string }[]
  transfer: { id: string; email: string } | null
}
export interface ListOffer { kind: 'manage' | 'give'; id: string; list_id: string; child_name: string; from_name: string | null; wishes: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** « gérée par vous », « gérée par Greg et vous » */
export function managedBy(info: ManagersInfo | null, myId: string | undefined): string {
  if (!info) return 'gérée par vous'
  const others = [info.owner, ...info.managers].filter(p => p.id !== myId).map(p => p.name).filter(Boolean)
  return others.length ? `gérée par ${others.join(', ')} et vous` : 'gérée par vous'
}

async function sendOfferMail(kind: 'manage' | 'give', id: string): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke('send-invite-email', { body: kind === 'manage' ? { list_invite_id: id } : { transfer_id: id } })
    return Boolean((data as { sent?: boolean } | null)?.sent)
  } catch { return false }
}

/* ---------- Partager la gestion (propriétaire) ---------- */
export function ManageListModal({ list, info, onClose, onChanged }: {
  list: Wishlist; info: ManagersInfo; onClose: () => void; onChanged: (msg?: string) => void
}) {
  const confirm = useConfirm()
  const kid = list.child_name ?? ''
  const [people, setPeople] = useState<{ user_id: string; display_name: string }[] | null>(null)
  const [pick, setPick] = useState<string>('')
  const [email, setEmail] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.rpc('my_people').then(({ data }) => setPeople((data as { user_id: string; display_name: string }[]) ?? []))
  }, [])
  const taken = new Set([info.owner.id, ...info.managers.map(m => m.id)])
  const rows = (people ?? []).filter(p => !taken.has(p.user_id))
  const shown = q.trim() ? rows.filter(p => norm(p.display_name).includes(norm(q.trim()))) : rows
  const pickedName = rows.find(p => p.user_id === pick)?.display_name

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const mail = email.trim()
    if (!pick && !mail) { setErr('Choisissez un proche ou indiquez une adresse e-mail.'); return }
    if (!pick && !EMAIL.test(mail)) { setErr('Adresse e-mail invalide.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('invite_list_manager', { p_list: list.id, p_user: pick || null, p_email: pick ? null : mail })
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    const sent = await sendOfferMail('manage', data as string)
    setBusy(false)
    onChanged(`${pickedName ?? mail} est invité·e à gérer la liste de ${kid}${sent ? ' (e-mail envoyé)' : ''}.`)
  }
  const removeManager = async (m: { id: string; name: string }) => {
    if (!(await confirm({ title: `Retirer ${m.name} ?`, message: `${m.name} ne gérera plus la liste de ${kid}.`, confirmLabel: 'Retirer', danger: true }))) return
    const { error } = await supabase.rpc('remove_list_manager', { p_list: list.id, p_user: m.id })
    if (error) setErr(errMsg(error)); else onChanged(`${m.name} ne gère plus la liste de ${kid}.`)
  }
  const cancelInvite = async (i: { id: string; label: string }) => {
    const { error } = await supabase.rpc('cancel_list_manager_invite', { p_invite: i.id })
    if (error) setErr(errMsg(error)); else onChanged('Proposition annulée.')
  }

  return (
    <Modal title={`Partager la gestion de la liste de ${kid}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>L'autre parent pourra ajouter et modifier ses envies, voir ce qui a été acheté pour {kid} et recevoir ses résultats de tirage.</p>
        <Notice>{err}</Notice>
        {(info.managers.length > 0 || info.invites.length > 0) && (
          <div className="contact-list">
            {info.managers.map(m => (
              <div key={m.id} className="contact off">
                <PersonDot name={m.name} size={30} />
                <span className="contact-name">{m.name}</span>
                <span className="small muted">gère la liste</span>
                <button type="button" className="linklike small" onClick={() => removeManager(m)}>Retirer</button>
              </div>
            ))}
            {info.invites.map(i => (
              <div key={i.id} className="contact off">
                <PersonDot name={i.label} size={30} />
                <span className="contact-name">{i.label}</span>
                <span className="small muted">invitation envoyée</span>
                <button type="button" className="linklike small" onClick={() => cancelInvite(i)}>Annuler</button>
              </div>
            ))}
          </div>
        )}
        <strong>Choisir parmi vos proches</strong>
        {people === null ? <p className="small muted" style={{ margin: 0 }}>Chargement…</p> : (
          <>
            {rows.length > 6 && <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un proche" aria-label="Rechercher un proche" />}
            <div className="contact-list" role="radiogroup">
              {shown.map(p => (
                <label key={p.user_id} className="contact">
                  <input type="radio" name="coparent" checked={pick === p.user_id} onChange={() => { setPick(p.user_id); setEmail('') }} />
                  <PersonDot name={p.display_name} size={30} />
                  <span className="contact-name">{p.display_name}</span>
                </label>
              ))}
              {!shown.length && <p className="small muted contact-empty">{rows.length ? 'Personne ne correspond.' : 'Pas encore de proches sur le site : indiquez son adresse e-mail.'}</p>}
            </div>
          </>
        )}
        <label>Ou par e-mail
          <input type="email" maxLength={200} value={email} placeholder="prenom@exemple.be" onChange={e => { setEmail(e.target.value); if (e.target.value) setPick('') }} />
        </label>
        <p className="small muted" style={{ margin: 0 }}><strong>Chacun garde ses événements.</strong> L'autre parent verra la liste de {kid} dans ses propres événements, mais ne verra pas les vôtres, et vous ne verrez pas les siens.</p>
        <div className="row gap modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || (!pick && !email.trim())}>{busy ? 'Invitation…' : pickedName ? `Inviter ${pickedName}` : 'Inviter'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- Donner la liste à l'enfant (propriétaire) ---------- */
export function GiveListModal({ list, info, myId, onClose, onChanged }: {
  list: Wishlist; info: ManagersInfo; myId: string; onClose: () => void; onChanged: (msg?: string) => void
}) {
  const kid = list.child_name ?? ''
  const others = [info.owner, ...info.managers].filter(p => p.id !== myId).map(p => p.name)
  const [email, setEmail] = useState(info.transfer?.email ?? '')
  const [events, setEvents] = useState<{ id: string; name: string; on: boolean }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('event_members').select('event_id, events(id,name,event_date)').eq('user_id', myId)
      const { data: ov } = await supabase.from('event_child_lists').select('event_id,shown').eq('list_id', list.id)
      const shown = new Map(((ov as { event_id: string; shown: boolean }[]) ?? []).map(o => [o.event_id, o.shown]))
      const today = new Date().toISOString().slice(0, 10)
      type Row = { event_id: string; events: { id: string; name: string; event_date: string | null } | null }
      const rows = ((mem as unknown as Row[]) ?? []).map(r => r.events).filter((e): e is NonNullable<Row['events']> => !!e && (!e.event_date || e.event_date >= today))
      setEvents(rows.map(e => ({ id: e.id, name: e.name, on: shown.get(e.id) ?? list.in_events !== false })))
    })()
  }, [list.id, list.in_events, myId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const mail = email.trim()
    if (!EMAIL.test(mail)) { setErr('Indiquez une adresse e-mail valide.'); return }
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('give_list', { p_list: list.id, p_email: mail, p_events: (events ?? []).filter(x => x.on).map(x => x.id) })
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    const sent = await sendOfferMail('give', data as string)
    setBusy(false)
    onChanged(sent ? `Invitation envoyée à ${mail}. La liste de ${kid} sera la sienne dès qu'il l'acceptera.`
      : `Invitation enregistrée. ${kid} la verra en se connectant avec ${mail}.`)
  }
  const cancel = async () => {
    const { error } = await supabase.rpc('cancel_list_transfer', { p_list: list.id })
    if (error) setErr(errMsg(error)); else onChanged('Invitation annulée.')
  }

  return (
    <Modal title={`Donner à ${kid} sa propre liste`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>{kid} est assez grand pour gérer ses envies ? Indiquez son adresse e-mail : il reçoit une invitation et sa liste devient la sienne, avec toutes ses envies.</p>
        <Notice>{err}</Notice>
        {info.transfer && <Notice kind="info">Invitation en attente pour {info.transfer.email}. <button type="button" className="linklike" onClick={cancel}>Annuler l'invitation</button></Notice>}
        <label>Adresse e-mail de {kid}
          <input type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.be" autoFocus />
        </label>
        <div className="small">
          <strong>Ce qui change pour {kid}</strong>
          <ul className="muted" style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>
            <li>Les achats faits pour lui deviennent une surprise : il ne les voit pas avant le jour J.</li>
            <li>{others.length ? `Vous et ${others.join(', ')} ne gérez plus sa liste` : 'Vous ne gérez plus sa liste'} : vous la voyez comme celle d'un proche, et pouvez y acheter des cadeaux.</li>
            <li>Ses tirages au sort passent à son nom.</li>
          </ul>
        </div>
        {events && events.length > 0 && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend><strong>L'ajouter à vos événements</strong></legend>
            <div className="contact-list">
              {events.map(ev => (
                <label key={ev.id} className="contact">
                  <input type="checkbox" checked={ev.on} onChange={() => setEvents(es => es!.map(x => x.id === ev.id ? { ...x, on: !x.on } : x))} />
                  <span className="contact-name">{ev.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="small muted" style={{ margin: 0 }}>S'il a déjà un compte avec cette adresse, ses envies sont ajoutées à sa liste.</p>
        <div className="row gap modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Envoi…' : `Envoyer l'invitation à ${kid}`}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------- Propositions reçues ---------- */
export function OffersCard({ offers, onDone }: { offers: ListOffer[]; onDone: (msg: string, listId?: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  if (!offers.length) return null
  const accept = async (o: ListOffer) => {
    setBusy(o.id); setErr('')
    const { data, error } = o.kind === 'manage'
      ? await supabase.rpc('accept_list_manager_invite', { p_invite: o.id })
      : await supabase.rpc('accept_list_transfer', { p_transfer: o.id })
    setBusy(null)
    if (error) { setErr(errMsg(error)); return }
    onDone(o.kind === 'manage'
      ? `Vous gérez maintenant la liste de ${o.child_name}.`
      : `Bienvenue ! Vos ${o.wishes > 1 ? `${o.wishes} envies sont` : 'envies sont'} dans votre liste, et c'est désormais vous qui la gérez.`,
      o.kind === 'manage' ? (data as string) : undefined)
  }
  const decline = async (o: ListOffer) => {
    setBusy(o.id); setErr('')
    const { error } = await supabase.rpc('decline_list_offer', { p_kind: o.kind, p_id: o.id })
    setBusy(null)
    if (error) setErr(errMsg(error)); else onDone('Proposition refusée.')
  }
  return (
    <div className="stack" style={{ marginBottom: '1rem' }}>
      <Notice>{err}</Notice>
      {offers.map(o => (
        <section key={o.id} className="card offer-card">
          <div className="row gap" style={{ alignItems: 'flex-start' }}>
            <PersonDot name={o.child_name} color="corail" size={40} />
            <div className="stack" style={{ gap: '.3rem', flex: 1 }}>
              {o.kind === 'manage' ? (
                <>
                  <strong>{o.from_name ?? 'Un proche'} vous propose de gérer avec lui la liste de {o.child_name}</strong>
                  <span className="small muted">Vous pourrez ajouter ses envies et voir ce qui a été acheté pour lui. Vos événements restent les vôtres : {o.from_name ?? 'il'} ne les voit pas, et vous ne voyez pas les siens.</span>
                </>
              ) : (
                <>
                  <strong>{o.from_name ?? 'Vos proches'} vous {o.from_name?.includes(' et ') ? 'confient' : 'confie'} votre liste d'envies</strong>
                  <span className="small muted">Vous retrouvez {o.wishes > 1 ? `vos ${o.wishes} envies` : o.wishes === 1 ? 'votre envie' : 'votre liste'}, et c'est désormais vous qui la gérez. Ce que vos proches achètent pour vous reste une surprise.</span>
                </>
              )}
              <div className="row gap wrap" style={{ marginTop: '.3rem' }}>
                <button className="btn btn-primary" disabled={busy === o.id} onClick={() => accept(o)}>{o.kind === 'manage' ? 'Accepter' : 'Récupérer ma liste'}</button>
                <button className="btn btn-ghost" disabled={busy === o.id} onClick={() => decline(o)}>Refuser</button>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
