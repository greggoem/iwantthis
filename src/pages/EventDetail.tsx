import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { PersonDot } from '../components/ListPills'
import { kidShownIn, managedTag, KID_COLOR_KEYS } from '../lib/kids'
import { supabase, errMsg, eventInviteUrl, APP_NAME } from '../lib/supabase'
import { formatDate } from '../lib/format'
import type { EventRow, MemberRow } from '../lib/types'
import { CopyField, IconButton, Notice, Spinner, copyText } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import Icon from '../components/Icon'
import PlaceInput from '../components/PlaceInput'
import ActionMenu from '../components/ActionMenu'
import Modal from '../components/Modal'
import ShareSheet from '../components/ShareSheet'
import { eventMessage, occasionEmoji } from '../lib/shareCard'
import { removeEventImage, setEventImage } from '../lib/eventImage'
import CropCapture, { canCaptureScreen, grabScreen } from '../components/ScreenCapture'
import Draws, { type DrawCandidate } from '../components/Draws'
import ContactPicker from '../components/ContactPicker'
import ChildForm, { type ChildDraft } from '../components/ChildForm'

interface Invite { id: string; name: string; email: string }

const imageFrom = (dt: DataTransfer | null): File | undefined =>
  Array.from(dt?.files ?? []).find(f => f.type.startsWith('image/')) ?? Array.from(dt?.items ?? []).find(i => i.type.startsWith('image/'))?.getAsFile() ?? undefined

const envies = (n: number) => n === 0 ? 'aucune envie' : `${n} envie${n > 1 ? 's' : ''}`
interface KidRow { id: string; owner_id: string; child_name: string; child_age: string | null; child_color: string | null; in_events: boolean; managed_kind: string | null; count: number; managers: string[] }
interface Override { event_id: string; list_id: string; shown: boolean }

export default function EventDetail() {
  const { id } = useParams()
  const { session } = useAuth()
  const me = session!.user.id
  const nav = useNavigate()
  const confirm = useConfirm()

  const [ev, setEv] = useState<EventRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [lists, setLists] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [kidLists, setKidLists] = useState<KidRow[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [editInv, setEditInv] = useState<Invite | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [imgMenu, setImgMenu] = useState(false)
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null)
  const [eiName, setEiName] = useState('')
  const [eiEmail, setEiEmail] = useState('')
  const [eiErr, setEiErr] = useState('')
  const [invName, setInvName] = useState('')
  const [invEmail, setInvEmail] = useState('')
  const [addManaged, setAddManaged] = useState(false)
  const [newDraw, setNewDraw] = useState(0)
  const [hasDraws, setHasDraws] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [eName, setEName] = useState('')
  const [eDate, setEDate] = useState('')
  const [eTime, setETime] = useState('')
  const [ePlace, setEPlace] = useState('')

  const load = useCallback(async () => {
    const { data: e } = await supabase.from('events').select('*').eq('id', id!).maybeSingle()
    if (!e) { setEv(null); setLoading(false); return }
    setEv(e as EventRow)
    const { data: m } = await supabase.from('event_members').select('event_id,user_id,in_draw,profiles(display_name)').eq('event_id', id!)
    const mem = ((m as unknown as MemberRow[]) ?? []).sort((a, b) => (a.profiles?.display_name ?? '').localeCompare(b.profiles?.display_name ?? ''))
    setMembers(mem)
    const [w, dr, inv, ov, kl] = await Promise.all([
      supabase.from('wishlists').select('id,owner_id,child_name,child_age,child_color,in_events,managed_kind,items(count)').eq('items.is_group', false).in('owner_id', mem.map(k => k.user_id)).is('child_name', null),
      supabase.rpc('event_draws', { p_event: id! }),
      supabase.from('event_invites').select('id,name,email').eq('event_id', id!).order('created_at'),   // visible de l'organisateur seulement
      supabase.from('event_child_lists').select('event_id,list_id,shown').eq('event_id', id!),
      supabase.rpc('event_child_lists_info', { p_event: id! }),   // listes gérées, y compris à deux parents
    ])
    setOverrides((ov.data as Override[]) ?? [])
    setInvites((inv.data as Invite[]) ?? [])
    type WRow = { id: string; owner_id: string; child_name: string | null; child_age: string | null; child_color: string | null; in_events: boolean; managed_kind: string | null; items?: { count: number }[] }
    const all = (w.data as WRow[]) ?? []
    const wl = all.filter(l => !l.child_name)
    setLists(Object.fromEntries(wl.map(l => [l.owner_id, l.id])))
    setCounts(Object.fromEntries(wl.map(l => [l.owner_id, l.items?.[0]?.count ?? 0])))
    setKidLists(((kl.data as (Omit<KidRow, 'count'> & { count: number | string })[]) ?? []).map(l => ({ ...l, managers: l.managers ?? [l.owner_id], count: Number(l.count) || 0 })))
    setHasDraws(((dr.data as unknown[]) ?? []).length > 0)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const name = (uid: string) => members.find(m => m.user_id === uid)?.profiles?.display_name ?? '—'
  const whoManages = (k: KidRow) => {
    const ids = k.managers.length ? k.managers : [k.owner_id]
    const names = ids.filter(u => u !== me && members.some(m => m.user_id === u)).map(name)
    if (ids.includes(me)) names.push('vous')
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0] ?? name(k.owner_id)
  }
  const openEdit = () => { if (!ev) return; setEName(ev.name); setEDate(ev.event_date); setETime(ev.event_time?.slice(0, 5) ?? ''); setEPlace(ev.location ?? ''); setEditing(true) }
  const drawOn = hasDraws
  const goDraws = () => document.getElementById('tirage')?.scrollIntoView({ behavior: 'smooth' })
  const addDraw = () => { setHasDraws(true); setNewDraw(n => n + 1); setTimeout(goDraws, 100) }
  const whenTxt = ev ? formatDate(ev.event_date) + (ev.event_time ? ` à ${ev.event_time.slice(0, 5).replace(':', 'h')}` : '') : ''
  const isOrg = ev?.created_by === me
  const myKids = kidLists.filter(k => k.owner_id === me)
  const shownKids = kidLists.filter(k => kidShownIn(k, id!, overrides))
  // invités et enfants dans une même liste, par ordre alphabétique
  const guests: { key: string; m?: MemberRow; kid?: KidRow }[] = [
    ...members.map(m => ({ key: m.profiles?.display_name ?? '', m })),
    ...shownKids.map(k => ({ key: k.child_name, kid: k })),
  ].sort((a, b) => a.key.localeCompare(b.key, 'fr', { sensitivity: 'base' }))
  const setKidShown = async (k: KidRow, shown: boolean) => {
    setErr('')
    setOverrides(o => [...o.filter(x => x.list_id !== k.id), { event_id: id!, list_id: k.id, shown }])
    const { error } = await supabase.rpc('set_event_list_shown', { p_event: id!, p_list: k.id, p_shown: shown })
    if (error) { setErr(errMsg(error)); load() }
  }
  const removeKid = async (k: KidRow) => {
    const mine = k.owner_id === me
    if (!(await confirm({ title: `Retirer ${k.child_name} de l'événement ?`, message: mine ? 'Sa liste ne sera plus visible des invités de cet événement. Vous pourrez la remettre plus tard.' : `Sa liste ne sera plus visible dans cet événement. ${name(k.owner_id)} pourra la remettre.`, confirmLabel: 'Retirer' }))) return
    setMsg('')
    await setKidShown(k, false)
    setMsg(`${k.child_name} a été retiré·e de l'événement.`)
  }
  // capture d'écran : Ctrl+V / Cmd+V n'importe où sur la page de l'événement (organisateur)
  useEffect(() => {
    if (!isOrg || editing) return
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFrom(e.clipboardData)
      if (f) { e.preventDefault(); onPickImage(f) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })
  const drawCandidates: DrawCandidate[] = [
    ...members.map(m => ({ pid: m.user_id, kind: 'user' as const, name: m.profiles?.display_name ?? '—', color: null, owner_id: m.user_id, ownerName: m.profiles?.display_name ?? '' })),
    ...shownKids.map(k => ({ pid: k.id, kind: 'kid' as const, name: k.child_name, color: k.child_color, owner_id: k.owner_id, ownerName: name(k.owner_id) })),
  ]

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok = '') => {
    setErr(''); setMsg('')
    const { error } = await fn()
    if (error) setErr(errMsg(error)); else if (ok) setMsg(ok)
    await load()
  }

  const saveEvent = async (e: FormEvent) => {
    e.preventDefault()
    const changed = !!ev && (ev.event_date !== eDate || (ev.event_time?.slice(0, 5) ?? '') !== eTime || (ev.location ?? '') !== ePlace.trim())
    const others = members.filter(m => m.user_id !== me).length
    await run(() => supabase.from('events').update({ name: eName.trim(), event_date: eDate, event_time: eTime || null, location: ePlace.trim() || null }).eq('id', id!), 'Événement mis à jour.')
    setEditing(false)
    if (changed && others > 0) {
      // notification déjà créée par la base ; ici l'e-mail à chaque invité
      const { data } = await supabase.functions.invoke('send-event-update', { body: { event_id: id } })
      const r = data as { sent?: number; reason?: string } | null
      setMsg(r?.sent ? `Événement mis à jour. Les ${others > 1 ? `${others} invités ont` : 'invité a'} reçu une notification et un e-mail.` : `Événement mis à jour. Les invités ont reçu une notification.`)
    }
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
  // proche sans compte (ou enfant) : sa liste est créée et affichée dans cet événement
  const createManaged = async (c: ChildDraft): Promise<string | null> => {
    const { data, error } = await supabase.rpc('create_child_list', { p_name: c.name, p_age: c.age || null, p_color: c.color, p_in_events: c.inEvents, p_kind: c.kind })
    if (error) return errMsg(error)
    const nl = (Array.isArray(data) ? data[0] : data) as { id: string }
    if (!c.inEvents) await supabase.from('event_child_lists').upsert({ event_id: id!, list_id: nl.id, shown: true })
    setAddManaged(false); setInviteOpen(false)
    setErr(''); setMsg(`${c.name} fait partie de l'événement. Ajoutez ses envies depuis « Ma liste ».`)
    await load()
    return null
  }
  const nextColor = () => KID_COLOR_KEYS.find(k => !kidLists.some(l => l.owner_id === me && l.child_color === k)) ?? 'corail'
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
    `Bonjour ${i.name} 👋\n\n${occasionEmoji(ev!.name)} Je t'invite à « ${ev!.name} » le ${formatDate(ev!.event_date)}${ev!.event_time ? ` à ${ev!.event_time.slice(0, 5).replace(':', 'h')}` : ''}${ev!.location ? ` (${ev!.location})` : ''} sur ${APP_NAME} : chacun y met ses envies de cadeaux, on voit les listes des uns et des autres et on évite les doublons 😉\n\n👉 Rejoins l'événement ici : ${eventInviteUrl(ev!.invite_code)}\n(Connecte-toi ou crée ton compte avec cette adresse e-mail : ${i.email})\n\nÀ bientôt !`
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
  const removeMember = async (m: MemberRow) => {
    const name = m.profiles?.display_name ?? 'cette personne'
    if (!(await confirm({ title: `Retirer ${name} ?`, message: `${name} ne fera plus partie de l'événement.`, confirmLabel: 'Retirer', danger: true }))) return
    await run(() => supabase.from('event_members').delete().eq('event_id', id!).eq('user_id', m.user_id))
  }
  if (loading) return <Spinner />
  if (!ev) return <Notice>Événement introuvable ou accès refusé.</Notice>

  return (
    <div className="narrow">
      <p><Link to="/evenements" className="small">← Tous les événements</Link></p>
      {(ev.image_url || isOrg) && !editing && (
        <div className={`event-cover ${ev.image_url ? '' : 'is-empty'}`}
          onDragOver={isOrg ? e => e.preventDefault() : undefined}
          onDrop={isOrg ? e => { const f = imageFrom(e.dataTransfer); if (f) { e.preventDefault(); onPickImage(f) } } : undefined}>
          {ev.image_url
            ? <img src={ev.image_url} alt="" referrerPolicy="no-referrer" />
            : <div className="cover-empty"><Icon name="image" size={22} /><span>Aucune image<span className="cover-hint-desk"> · glissez-en une ici ou collez-la (Ctrl+V)</span><span className="cover-hint-touch"> · touchez « Ajouter une image »</span></span></div>}
          {isOrg && (
            <div className={`cover-actions ${ev.image_url ? '' : 'in-flow'}`}>
              <div className="imgmenu-wrap">
                <button type="button" className="btn btn-sm" disabled={imgBusy} aria-haspopup="menu" aria-expanded={imgMenu} onClick={() => setImgMenu(m => !m)}>
                  <Icon name="image" size={15} /> {imgBusy ? 'Envoi…' : ev.image_url ? 'Modifier' : 'Ajouter une image'} <Icon name="chevron" size={14} />
                </button>
                {imgMenu && (
                  <>
                    <div className="imgmenu-back" onClick={() => setImgMenu(false)} />
                    <div className="imgmenu menu-right" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setImgMenu(false); fileRef.current?.click() }}>Choisir une photo ou un fichier</button>
                      {canCaptureScreen() && <button type="button" role="menuitem" onClick={async () => { setImgMenu(false); const c = await grabScreen(); if (c) setShot(c) }}>Capturer l'écran</button>}
                      {ev.image_url && <button type="button" role="menuitem" className="danger" onClick={() => { setImgMenu(false); dropImage() }}>Retirer l'image</button>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {shot && <CropCapture source={shot} onCancel={() => setShot(null)} onDone={f => { setShot(null); onPickImage(f) }} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden onChange={e => onPickImage(e.target.files?.[0])} />
      {editing ? (
        <form className="card stack" onSubmit={saveEvent}>
          <label>Nom<input required value={eName} maxLength={120} onChange={e => setEName(e.target.value)} /></label>
          <div className="row gap wrap">
            <label style={{ flex: '1 1 160px' }}><span>Date de remise</span><input required type="date" value={eDate} onChange={e => setEDate(e.target.value)} /></label>
            <label style={{ flex: '1 1 120px' }}><span>Heure <span className="muted small">(facultatif)</span></span><input type="time" value={eTime} onChange={e => setETime(e.target.value)} /></label>
          </div>
          <label><span>Lieu <span className="muted small">(facultatif)</span></span><PlaceInput value={ePlace} onChange={setEPlace} placeholder="Restaurant, salle, adresse… (ex. La Branche d'Olivier)" /></label>
          <div className="row">
            <button className="btn btn-primary">Enregistrer</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <>
          <div className="evd-head">
            <div className="ev-id">
              <h1>{ev.name}</h1>
              <p className="ev-line"><Icon name="calendar" size={17} /><span>{whenTxt.charAt(0).toUpperCase() + whenTxt.slice(1)}</span></p>
              {ev.location && (
                <p className="ev-line"><Icon name="pin" size={17} /><span>{ev.location} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`} target="_blank" rel="noopener noreferrer">Itinéraire</a></span></p>
              )}
              {isOrg && !ev.location && !ev.event_time && (
                <button type="button" className="linklike small" onClick={openEdit}>+ Ajouter une heure ou un lieu</button>
              )}
            </div>
            <div className="ev-btns">
              <button className="btn btn-primary" onClick={() => { setErr(''); setMsg(''); setInviteOpen(true) }}><Icon name="users" size={16} /> Inviter</button>
              <ActionMenu label="Options de l'événement" actions={[
                isOrg && { icon: 'pencil', label: 'Modifier nom, date, lieu', onClick: openEdit },
                isOrg && { icon: 'image', label: ev.image_url ? "Changer l'image" : 'Ajouter une image', onClick: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); setImgMenu(true) } },
                isOrg && { icon: 'dice', label: drawOn ? 'Ajouter un tirage au sort' : 'Créer un tirage au sort', onClick: addDraw },
                drawOn && { icon: 'dice', label: 'Voir les tirages au sort', onClick: goDraws },
                { icon: 'coins', label: 'Comptes partagés · bientôt', disabled: true, onClick: () => {} },
                { icon: 'camera', label: 'Photos partagées · bientôt', disabled: true, onClick: () => {} },
                { icon: 'chat', label: 'Discussion · bientôt', disabled: true, onClick: () => {} },
                isOrg ? { icon: 'trash', label: "Supprimer l'événement", danger: true, onClick: deleteEvent }
                      : { icon: 'logout', label: "Quitter l'événement", danger: true, onClick: leave },
              ]} />
            </div>
          </div>
        </>
      )}
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {drawOn && <Draws eventId={id!} isOrg={isOrg} me={me!} candidates={drawCandidates} pendingInvites={invites.length} openNew={newDraw} onChanged={load} />}

      {invites.length > 0 && (
        <>
          <h2 className="mt">{isOrg ? 'En attente' : 'Vos invitations en attente'} ({invites.length})</h2>
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

      {inviteOpen && (
        <Modal title="Inviter des proches" onClose={() => setInviteOpen(false)} wide>
          <div className="stack">
            <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>
            <ContactPicker eventId={id!} managed={myKids.filter(k => !kidShownIn(k, id!, overrides)).map(k => ({ id: k.id, name: k.child_name, color: k.child_color }))}
              onAddManaged={(ids) => Promise.all(ids.map(lid => supabase.rpc('set_event_list_shown', { p_event: id!, p_list: lid, p_shown: true }))).then(() => load())}
              onNewManaged={() => { setInviteOpen(false); setAddManaged(true) }}
              onInvited={(invited, added, mailed) => {
                const parts: string[] = []
                if (invited.length) parts.push(`${invited.join(', ')} ${invited.length > 1 ? 'ont' : 'a'} reçu l'invitation (notification${mailed ? ' et e-mail' : ''}) et ${invited.length > 1 ? 'choisiront' : 'choisira'} de rejoindre l'événement.`)
                if (added.length) parts.push(`${added.join(', ')} ${added.length > 1 ? 'font' : 'fait'} maintenant partie de l'événement.`)
                setErr(''); setMsg(parts.join(' ')); load()
              }} />
            <hr />
            <h3 style={{ margin: 0 }}>Par un lien</h3>
            <p className="small muted" style={{ margin: 0 }}>Ils ouvrent ce lien, se connectent, puis choisissent de rejoindre l'événement. Les listes de tous les invités deviennent alors visibles entre eux.</p>
            <CopyField value={eventInviteUrl(ev.invite_code)} share={() => { setInviteOpen(false); setShareOpen(true) }} />
            <hr />
            <h3 style={{ margin: 0 }}>Par son nom et son e-mail</h3>
            <p className="small muted">La personne reçoit un e-mail (et une notification si elle a déjà un compte) et choisit de rejoindre l'événement ou de refuser : rien n'est visible avant son accord.</p>
            <form className="invite-form" onSubmit={addInvite}>
              <input required maxLength={80} value={invName} onChange={e => setInvName(e.target.value)} placeholder="Nom (ex. Marie)" aria-label="Nom" />
              <input required type="email" maxLength={200} value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" />
              <button className="btn btn-primary">Ajouter</button>
            </form>
          </div>
        </Modal>
      )}
      {addManaged && (
        <Modal title="Ajouter un proche sans compte" onClose={() => setAddManaged(false)}>
          <ChildForm initial={{ name: '', age: '', color: nextColor(), inEvents: true, kind: 'proche' }}
            submitLabel={n => `Ajouter ${n} à l'événement`} onCancel={() => setAddManaged(false)} onSubmit={createManaged} />
        </Modal>
      )}
      {shareOpen && (
        <ShareSheet
          title="Partager l'événement"
          intro="Envoyez l'invitation avec un message sympa et l'image de l'événement."
          message={eventMessage(ev.name, whenTxt, eventInviteUrl(ev.invite_code), APP_NAME, ev.location)}
          subject={`Invitation : ${ev.name}`}
          heading={ev.name} sub={whenTxt} kicker="Invitation" imageUrl={ev.image_url}
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

      {myKids.length > 0 && (
        <section className="card stack mt my-lists">
          <h2 style={{ margin: 0 }}>Mes listes dans cet événement</h2>
          <p className="small muted" style={{ margin: 0 }}>Les invités voient les listes cochées.</p>
          <label className="radio"><input type="checkbox" checked disabled /> <PersonDot name={name(me)} size={28} /> <span><strong>Ma liste</strong> <span className="small muted">· toujours partagée</span></span></label>
          {myKids.map(k => (
            <label key={k.id} className="radio">
              <input type="checkbox" checked={kidShownIn(k, id!, overrides)} onChange={e => setKidShown(k, e.target.checked)} />
              <PersonDot name={k.child_name} color={k.child_color ?? 'corail'} size={28} />
              <span><strong>{k.child_name}</strong> <span className="small muted">· {envies(k.count)}</span></span>
            </label>
          ))}
        </section>
      )}

      <h2 className="mt">Invités ({members.length + shownKids.length})</h2>
      <ul className="items">
        {guests.map(g => g.kid ? (
          <li key={g.kid.id} className="card item">
            <div className="item-main">
              <strong>{g.kid.child_name}</strong>
              <span className="tag">{managedTag(g.kid.managed_kind, whoManages(g.kid))}</span>
              <span className="small muted wish-count">{envies(g.kid.count)}</span>
            </div>
            <div className="item-actions">
              <Link className="btn btn-sm" to={g.kid.owner_id === me ? `/?liste=${g.kid.id}` : `/listes/${g.kid.id}`}>{g.kid.owner_id === me ? 'Sa liste' : 'Voir sa liste'}</Link>
              {(g.kid.owner_id === me || isOrg) && <IconButton icon="x" label={`Retirer ${g.kid.child_name} de l'événement`} onClick={() => removeKid(g.kid!)} />}
            </div>
          </li>
        ) : (m => (
          <li key={m.user_id} className="card item">
            <div className="item-main">
              <strong>{m.profiles?.display_name ?? '—'}</strong>
              {m.user_id === ev.created_by && <span className="tag">organisateur</span>}
              {m.user_id === me && <span className="tag">vous</span>}
              {lists[m.user_id] && <span className="small muted wish-count">{envies(counts[m.user_id] ?? 0)}</span>}
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
        ))(g.m!))}
      </ul>


    </div>
  )
}
