import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, eventInviteUrl, APP_NAME } from '../lib/supabase'
import { formatDate, formatDateShort } from '../lib/format'
import type { EventRow, MemberRow } from '../lib/types'
import { CopyField, IconButton, Notice, Spinner, copyText } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import ShareSheet from '../components/ShareSheet'
import { eventMessage, occasionEmoji } from '../lib/shareCard'
import { removeEventImage, setEventImage } from '../lib/eventImage'

interface Excl { giver_id: string; receiver_id: string }
interface Invite { id: string; name: string; email: string }

export default function EventDetail() {
  const { id } = useParams()
  const { session } = useAuth()
  const me = session!.user.id
  const nav = useNavigate()
  const confirm = useConfirm()

  const [ev, setEv] = useState<EventRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [lists, setLists] = useState<Record<string, string>>({})
  const [excl, setExcl] = useState<Excl[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [editInv, setEditInv] = useState<Invite | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [eiName, setEiName] = useState('')
  const [eiEmail, setEiEmail] = useState('')
  const [eiErr, setEiErr] = useState('')
  const [invName, setInvName] = useState('')
  const [invEmail, setInvEmail] = useState('')
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
    const [w, x, a, inv] = await Promise.all([
      supabase.from('wishlists').select('id,owner_id').in('owner_id', mem.map(k => k.user_id)),
      supabase.from('draw_exclusions').select('giver_id,receiver_id').eq('event_id', id!),
      supabase.from('draw_assignments').select('receiver_id').eq('event_id', id!).maybeSingle(),
      supabase.from('event_invites').select('id,name,email').eq('event_id', id!).order('created_at'),   // visible de l'organisateur seulement
    ])
    setInvites((inv.data as Invite[]) ?? [])
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
    if (!(await confirm({ title: 'Supprimer l\'événement ?', message: 'Il sera supprimé pour tous les invités, avec le tirage au sort et les achats liés à cette date. Cette action est définitive.', confirmLabel: 'Supprimer', danger: true }))) return
    const { error } = await supabase.from('events').delete().eq('id', id!)
    if (error) setErr(errMsg(error)); else nav('/evenements', { replace: true })
  }
  const leave = async () => {
    if (!(await confirm({ title: 'Quitter l\'événement ?', message: 'Vous ne verrez plus les listes des autres invités, et ils ne verront plus la vôtre via cet événement.', confirmLabel: 'Quitter', danger: true }))) return
    const { error } = await supabase.from('event_members').delete().eq('event_id', id!).eq('user_id', me)
    if (error) setErr(errMsg(error)); else nav('/evenements', { replace: true })
  }
  const addInvite = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setMsg('')
    const { data, error } = await supabase.rpc('add_event_invite', { p_event: id, p_name: invName, p_email: invEmail })
    if (error) { setErr(errMsg(error)); return }
    const first = invName.trim()
    const mailed = await sendInviteEmail(invEmail)
    const lead = data === 'invited_notified'
      ? `${first} a déjà un compte : elle vient d'être notifiée dans le site et devra accepter pour rejoindre l'événement.`
      : `${first} n'a pas encore de compte : invitation créée, en attente de son accord.`
    setMsg(`${lead} ${mailed}`)
    setInvName(''); setInvEmail('')
    await load()
  }
  const openEditInvite = (i: Invite) => { setEditInv(i); setEiName(i.name); setEiEmail(i.email); setEiErr('') }
  const saveInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!editInv) return
    setEiErr('')
    const { error } = await supabase.rpc('update_event_invite', { p_invite: editInv.id, p_name: eiName, p_email: eiEmail })
    if (error) { setEiErr(errMsg(error)); return }
    setEditInv(null); setErr(''); setMsg(`Invitation de ${eiName.trim()} mise à jour. Si l'adresse a changé, renvoyez-lui l'invitation avec le bouton « E-mail ».`)
    await load()
  }
  /** Demande au serveur d'envoyer l'e-mail d'invitation ; renvoie une phrase pour l'utilisateur */
  const sendInviteEmail = async (email: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('send-invite-email', { body: { event_id: id, email } })
    const r = data as { sent?: boolean; reason?: string; error?: string } | null
    if (r?.sent) return 'Un e-mail d\'invitation vient d\'être envoyé.'
    if (r?.reason === 'not_configured') return 'L\'envoi d\'e-mails n\'est pas encore activé sur le site : utilisez le bouton « E-mail » ci-dessous.'
    if (r?.reason === 'refused' && r.error) return r.error
    if (error || r?.reason) return 'L\'e-mail n\'a pas pu être envoyé : utilisez le bouton « E-mail » ci-dessous.'
    return ''
  }
  const resendEmail = async (i: Invite) => { setErr(''); setMsg(await sendInviteEmail(i.email) || 'Demande envoyée.') }
  const removeInvite = async (i: Invite) => {
    if (!(await confirm({ title: 'Retirer cette invitation ?', message: `${i.name} (${i.email}) ne sera plus invité(e) à cet événement.`, confirmLabel: 'Retirer', danger: true }))) return
    await run(() => supabase.from('event_invites').delete().eq('id', i.id))
  }
  const inviteText = (i: Invite) =>
    `Bonjour ${i.name} 👋\n\n${occasionEmoji(ev!.name)} Je t'invite à « ${ev!.name} » le ${formatDate(ev!.event_date)} sur ${APP_NAME} : chacun y met ses envies de cadeaux, on voit les listes des uns et des autres et on évite les doublons 😉\n\n👉 Rejoins l'événement ici : ${eventInviteUrl(ev!.invite_code)}\n(Connecte-toi ou crée ton compte avec cette adresse e-mail : ${i.email})\n\nÀ bientôt !`
  const onPickImage = async (file: File | undefined) => {
    if (!file || !ev) return
    setErr(''); setMsg(''); setImgBusy(true)
    const m = await setEventImage(ev.id, file, ev.image_url)
    setImgBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    if (m) setErr(m); else setMsg('Image enregistrée.')
    await load()
  }
  const dropImage = async () => {
    if (!ev || !(await confirm({ title: 'Retirer l\'image ?', message: 'L\'événement n\'aura plus d\'image.', confirmLabel: 'Retirer', danger: true }))) return
    setErr(''); setImgBusy(true)
    const m = await removeEventImage(ev.id, ev.image_url)
    setImgBusy(false)
    if (m) setErr(m)
    await load()
  }
  const mailtoFor = (i: Invite) => `mailto:${encodeURIComponent(i.email)}?subject=${encodeURIComponent(`Invitation : ${ev!.name}`)}&body=${encodeURIComponent(inviteText(i))}`
  const copyInvite = async (i: Invite) => { if (await copyText(inviteText(i))) { setErr(''); setMsg(`Message pour ${i.name} copié.`) } }
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
  const removeMember = async (m: MemberRow) => {
    const name = m.profiles?.display_name ?? 'cette personne'
    if (!(await confirm({ title: `Retirer ${name} ?`, message: `${name} ne fera plus partie de l'événement.`, confirmLabel: 'Retirer', danger: true }))) return
    await run(() => supabase.from('event_members').delete().eq('event_id', id!).eq('user_id', m.user_id))
  }
  const doDraw = async () => {
    if (ev?.draw_done_at && !(await confirm({ title: 'Refaire le tirage ?', message: 'Un tirage existe déjà. Le refaire remplacera tous les résultats actuels.', confirmLabel: 'Refaire le tirage', danger: true }))) return
    setShowTarget(false)
    await run(() => supabase.rpc('run_draw', { p_event: id }), 'Tirage effectué ! Chacun peut maintenant découvrir son résultat.')
  }
  const resetDraw = async () => {
    if (!(await confirm({ title: 'Annuler le tirage ?', message: 'Les résultats seront effacés pour tout le monde.', confirmLabel: 'Annuler le tirage', danger: true }))) return
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
      {(ev.image_url || isOrg) && !editing && (
        <div className={`event-cover ${ev.image_url ? '' : 'is-empty'}`}>
          {ev.image_url
            ? <img src={ev.image_url} alt="" referrerPolicy="no-referrer" />
            : <button type="button" className="cover-add" disabled={imgBusy} onClick={() => fileRef.current?.click()}><Icon name="image" size={22} /> {imgBusy ? 'Envoi…' : 'Ajouter une image à l\'événement'}</button>}
          {isOrg && ev.image_url && (
            <div className="cover-actions">
              <button type="button" className="btn btn-sm" disabled={imgBusy} onClick={() => fileRef.current?.click()}>{imgBusy ? 'Envoi…' : 'Changer'}</button>
              <button type="button" className="btn btn-sm" disabled={imgBusy} onClick={dropImage}>Retirer</button>
            </div>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden onChange={e => onPickImage(e.target.files?.[0])} />
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
        <div className="row between wrap gap">
          <h2>Inviter des proches</h2>
          <button className="btn btn-sm" onClick={() => setShareOpen(true)}><Icon name="share" size={15} /> Partager</button>
        </div>
        <p className="small muted">Ils ouvrent ce lien, se connectent, et rejoignent l'événement. Les listes de tous les invités deviennent alors visibles entre eux.</p>
        <CopyField value={eventInviteUrl(ev.invite_code)} />
        {isOrg && (
          <>
            <hr />
            <h3>Ajouter quelqu'un par son nom et son e-mail</h3>
            <p className="small muted">La personne reçoit un e-mail (et une notification si elle a déjà un compte) et choisit de rejoindre l'événement ou de refuser : rien n'est visible avant son accord.</p>
            <form className="invite-form" onSubmit={addInvite}>
              <input required maxLength={80} value={invName} onChange={e => setInvName(e.target.value)} placeholder="Nom (ex. Marie)" aria-label="Nom" />
              <input required type="email" maxLength={200} value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" />
              <button className="btn btn-primary">Ajouter</button>
            </form>
          </>
        )}
      </section>

      {isOrg && invites.length > 0 && (
        <>
          <h2 className="mt">En attente ({invites.length})</h2>
          <ul className="items">
            {invites.map(i => (
              <li key={i.id} className="card item">
                <div className="item-main">
                  <strong>{i.name}</strong><span className="tag">en attente</span>
                  <p className="small muted">{i.email}</p>
                </div>
                <div className="item-actions">
                  <button className="btn btn-sm" onClick={() => resendEmail(i)} title="Envoyer l'e-mail d'invitation depuis le site"><Icon name="mail" size={15} /> Envoyer</button>
                  <a className="btn btn-ghost btn-sm" href={mailtoFor(i)} title="Ouvrir votre messagerie avec le message prêt">E-mail</a>
                  <IconButton icon="copy" label="Copier le message d'invitation" onClick={() => copyInvite(i)} />
                  <IconButton icon="pencil" label="Modifier le nom ou l'e-mail" onClick={() => openEditInvite(i)} />
                  <IconButton icon="trash" label="Retirer l'invitation" danger onClick={() => removeInvite(i)} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {shareOpen && (
        <ShareSheet
          title="Partager l'événement"
          intro="Envoyez l'invitation avec un message sympa et l'image de l'événement."
          message={eventMessage(ev.name, formatDate(ev.event_date), eventInviteUrl(ev.invite_code), APP_NAME)}
          subject={`Invitation : ${ev.name}`}
          heading={ev.name} sub={formatDate(ev.event_date)} imageUrl={ev.image_url}
          fileName={`invitation-${ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'evenement'}`}
          onClose={() => setShareOpen(false)}
        />
      )}
      {editInv && (
        <Modal title="Modifier l'invitation" onClose={() => setEditInv(null)}>
          <form className="stack" onSubmit={saveInvite}>
            <Notice>{eiErr}</Notice>
            <label>Nom
              <input required maxLength={80} value={eiName} autoFocus onChange={e => setEiName(e.target.value)} />
            </label>
            <label>E-mail
              <input required type="email" maxLength={200} value={eiEmail} onChange={e => setEiEmail(e.target.value)} />
            </label>
            <p className="small muted">La personne verra l'événement en attente dès qu'elle se connecte avec cette adresse.</p>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setEditInv(null)}>Annuler</button>
              <button className="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        </Modal>
      )}

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
                <button className="btn btn-ghost btn-sm danger" onClick={() => removeMember(m)}>Retirer</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt row"><Icon name="dice" size={20} /> Tirage au sort</h2>
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
            {invites.length > 0 && <Notice kind="info">{invites.length} personne{invites.length > 1 ? 's' : ''} invitée{invites.length > 1 ? 's' : ''} n'ont pas encore rejoint l'événement : elles ne seront pas incluses dans le tirage.</Notice>}
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
