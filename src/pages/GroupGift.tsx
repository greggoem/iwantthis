import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, groupGiftUrl } from '../lib/supabase'
import { formatDate, formatDateShort } from '../lib/format'
import { euros, names, type GroupGift as GG, type GGMember } from '../lib/groupGifts'
import { Notice, Spinner, CopyField } from '../components/ui'
import { PersonDot } from '../components/ListPills'
import { tint } from '../components/Draws'
import { useConfirm } from '../components/Confirm'
import ActionMenu from '../components/ActionMenu'
import ShareSheet from '../components/ShareSheet'
import { PeoplePicker, EmailsInput, sendGroupInvites } from '../components/GroupGiftForm'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const STATUS: Record<GG['status'], { label: string; cls: string }> = {
  open: { label: 'Cagnotte ouverte', cls: 'gg-st-open' },
  closed: { label: 'Cagnotte fermée', cls: 'gg-st-closed' },
  bought: { label: 'Acheté', cls: 'gg-st-bought' },
  cancelled: { label: 'Annulé', cls: 'gg-st-cancel' },
}

/** Page d'un cadeau commun : progression, ma réponse, et pour les organisateurs le suivi complet */
export default function GroupGift() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const confirm = useConfirm()
  const [g, setG] = useState<GG | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [picking, setPicking] = useState<null | 'invite' | 'org'>(null)
  const [noteEdit, setNoteEdit] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('group_gift', { p_gift: id })
    if (error) { setErr(errMsg(error)); setG(null); return }
    const x = data as GG
    setG(x)
    setAmount(prev => prev || (x.me.amount ? String(x.me.amount) : x.suggested ? String(Math.ceil(x.suggested)) : ''))
  }, [id])
  useEffect(() => { load() }, [load])

  // juste créé : proposer tout de suite le lien à partager
  useEffect(() => {
    if (!g || !sp.get('nouveau')) return
    const m = sp.get('mails')
    if (m) {
      const [sent, total] = m.split('/').map(Number)
      setMsg(sent === total ? `Cadeau commun créé : ${total} invitation${total > 1 ? 's' : ''} envoyée${total > 1 ? 's' : ''} par e-mail.`
        : `Cadeau commun créé. ${sent} e-mail${sent > 1 ? 's' : ''} sur ${total} envoyé${sent > 1 ? 's' : ''} : partagez aussi le lien.`)
    }
    setSharing(true); sp.delete('nouveau'); sp.delete('mails'); setSp(sp, { replace: true })
  }, [g, sp, setSp])

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok?: string) => {
    setErr(''); setMsg(''); setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { setErr(errMsg(error)); return false }
    if (ok) setMsg(ok)
    await load()
    return true
  }

  if (g === undefined) return <Spinner />
  if (g === null) return <div className="narrow stack"><Notice>{err || 'Cadeau commun introuvable.'}</Notice><Link to="/offrir" className="btn">Retour à « À offrir »</Link></div>

  const org = g.is_organizer
  const open = g.status === 'open'
  const pct = Math.min(100, Math.round((g.total / g.price) * 100))
  const yesNames = g.members.filter(m => m.answer === 'yes').map(m => m.me ? 'vous' : m.name)
  // estimation de ma part en « même part pour tous » si je rejoins maintenant
  const fixed = g.split === 'equal' && g.fixed_share ? Number(g.fixed_share) : null
  const equalIfJoin = g.split === 'equal' ? (fixed ?? g.price / Math.max(1, g.yes + (g.me.answer === 'yes' ? 0 : 1))) : null
  const approx = open && g.split === 'equal' && !fixed ? '≈ ' : ''
  const shareUrl = g.share_token ? groupGiftUrl(g.share_token) : ''

  const answer = async (a: 'yes' | 'no') => {
    const n = Number(amount.replace(',', '.'))
    if (a === 'yes' && g.split === 'free' && !(n > 0)) { setErr('Indiquez votre montant.'); return }
    if (await run(() => supabase.rpc('answer_group_gift', { p_gift: g.id, p_answer: a, p_amount: a === 'yes' && g.split === 'free' ? n : null }),
      a === 'yes' ? 'Merci ! Votre participation est enregistrée.' : 'C\'est noté : vous ne participez pas.')) setEditing(false)
  }

  const remind = async () => {
    setErr(''); setMsg(''); setBusy(true)
    const { data, error } = await supabase.rpc('remind_group_gift', { p_gift: g.id })
    setBusy(false)
    if (error) setErr(errMsg(error))
    else setMsg(data ? `${data} personne${data > 1 ? 's' : ''} relancée${data > 1 ? 's' : ''}.` : 'Tout le monde a déjà été relancé aujourd\'hui.')
  }

  const cancel = async () => {
    if (!(await confirm({ title: 'Annuler ce cadeau commun ?', message: 'Les participants seront prévenus' + (g.from_list ? ', et l\'envie redeviendra libre sur la liste.' : '.'), confirmLabel: 'Annuler le cadeau commun', danger: true }))) return
    run(() => supabase.rpc('cancel_group_gift', { p_gift: g.id }), 'Cadeau commun annulé.')
  }
  const reopen = async () => {
    if (!(await confirm({ title: 'Rouvrir la cagnotte ?', message: 'Les parts finales seront recalculées à la prochaine fermeture.', confirmLabel: 'Rouvrir' }))) return
    run(() => supabase.rpc('reopen_group_gift', { p_gift: g.id }), 'Cagnotte rouverte.')
  }
  const bought = () => run(() => supabase.rpc('mark_group_gift_bought', { p_gift: g.id }), 'Bravo ! Les participants sont prévenus que le cadeau est acheté.')
  const removeMember = async (m: GGMember) => {
    if (!(await confirm({ title: `Retirer ${m.name} ?`, message: `${m.name} ne verra plus ce cadeau commun.`, confirmLabel: 'Retirer', danger: true }))) return
    run(() => supabase.rpc('remove_group_gift_member', { p_gift: g.id, p_user: m.id }))
  }

  const myShare = g.me.share
  const mine = g.me.answer

  return (
    <div className="narrow stack gg-page">
      <p style={{ margin: 0 }}><Link to="/offrir" className="small">← À offrir</Link></p>

      <div className="gg-head">
        <div className="gg-head-img">{g.image_url ? <img src={g.image_url} alt="" referrerPolicy="no-referrer" /> : <Icon name="gift" size={40} />}</div>
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <span className={`gg-status ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>
          <h1 className="gg-title">{g.url ? <a href={g.url} target="_blank" rel="noopener noreferrer">{g.title}</a> : g.title}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Cadeau commun pour <strong>{g.recipient_name}</strong> · à offrir le {formatDate(g.give_on)}
            {g.event && <> · <Link to={`/evenements/${g.event.id}`}>{g.event.name}</Link></>}
          </p>
          <p className="muted small" style={{ margin: 0 }}>Organisé par {names(g.members.filter(m => m.organizer).map(m => m.me ? 'vous' : m.name))}</p>
        </div>
      </div>

      {err && <Notice>{err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      {g.status === 'cancelled' && <Notice kind="info">Ce cadeau commun a été annulé par les organisateurs.</Notice>}

      {g.status !== 'cancelled' && (
        <div className="card gg-progress">
          <div className="row between"><strong>{euros(g.total)} {open ? 'promis' : 'réunis'}</strong><span className="muted">sur {euros(g.price)}</span></div>
          <div className="gg-bar"><div style={{ width: `${pct}%` }} className={g.total >= g.price ? 'full' : ''} /></div>
          <div className="row wrap small muted">
            <span className="gg-dots">{g.members.filter(m => m.answer === 'yes').slice(0, 8).map(m => <PersonDot key={m.id} name={m.name} color={tint(m.name)} size={24} />)}</span>
            {g.yes ? `${g.yes} participant${g.yes > 1 ? 's' : ''}` : 'Personne pour l\'instant'}
            {open && g.pending > 0 && ` · ${g.pending} sans réponse`}
            {open && g.respond_by && ` · réponse avant le ${formatDateShort(g.respond_by)}`}
          </div>
          {!open && g.extra_text && <p className="small" style={{ margin: 0 }}><Icon name="plus" size={13} /> {g.surplus === 'voucher' ? 'Bon d\'achat' : 'En plus'} : {g.extra_text}</p>}
        </div>
      )}

      {/* ma réponse */}
      {open && (mine === 'pending' || editing) ? (
        <div className="card stack gg-answer">
          <h2 className="gg-h2">Vous participez ?</h2>
          {g.split === 'equal' ? (
            <div className="gg-share"><span>{fixed ? 'Participation demandée à chacun' : 'Votre part (même part pour tous)'}</span><strong>{approx}{euros(Math.round((equalIfJoin ?? 0) * 100) / 100)}</strong></div>
          ) : (
            <>
              <label>Votre montant
                <span className="gg-euro gg-euro-lg"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /> €</span>
              </label>
              <div className="gg-quick">
                {[...new Set([20, g.suggested ? Math.ceil(g.suggested) : 0, 50].filter(n => n > 0))].sort((a, b) => a - b).map(n => (
                  <button key={n} type="button" className={`gg-chip gg-chip-sm${amount === String(n) ? ' on' : ''}`} onClick={() => setAmount(String(n))}>
                    {euros(n)}{g.suggested && n === Math.ceil(g.suggested) ? ' suggéré' : ''}
                  </button>
                ))}
              </div>
              {g.suggested !== null && <p className="small muted" style={{ margin: 0 }}>Suggestion : il reste {euros(Math.max(0, g.price - g.total))} à trouver entre les {g.pending} personne{g.pending > 1 ? 's' : ''} qui n'ont pas encore répondu.</p>}
            </>
          )}
          {g.split === 'equal' && !fixed && <p className="small muted" style={{ margin: 0 }}>{euros(g.price)} ÷ les participants : la part baisse si d'autres rejoignent. Vous serez prévenu du montant final.</p>}
          {fixed && g.total + fixed > g.price && <p className="small muted" style={{ margin: 0 }}>S'il y a plus que le prix, les organisateurs pourront réduire les parts ou ajouter un petit cadeau.</p>}
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => answer('yes')}>Je participe</button>
          {mine !== 'no' && <button className="btn btn-lg" disabled={busy} onClick={() => answer('no')}>Je ne participe pas</button>}
          {editing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Annuler</button>}
        </div>
      ) : g.status !== 'cancelled' && (
        <div className={`card gg-mine ${mine === 'yes' ? 'yes' : ''}`}>
          {mine === 'yes' ? (
            <div className="row between wrap">
              <span><Icon name="check" size={16} /> Vous participez{myShare !== null ? <> · {open ? 'part ' : 'votre part : '}<strong>{approx}{euros(myShare)}</strong></> : null}
                {!open && g.me.paid && <span className="chip chip-ok" style={{ marginLeft: 8 }}>payé</span>}</span>
              {open && <button className="btn btn-sm" onClick={() => setEditing(true)}>Modifier</button>}
            </div>
          ) : mine === 'no' ? (
            <div className="row between wrap">
              <span className="muted">Vous ne participez pas.</span>
              {open && <button className="btn btn-sm" onClick={() => setEditing(true)}>Finalement, je participe</button>}
            </div>
          ) : <span className="muted">La cagnotte est fermée.</span>}
        </div>
      )}

      {g.note && noteEdit === null && (
        <div className="gg-note"><Icon name="chat" size={16} /><span>{g.note}</span>{org && g.status !== 'cancelled' && <button className="linkbtn small" onClick={() => setNoteEdit(g.note ?? '')}>Modifier</button>}</div>
      )}
      {org && noteEdit !== null && (
        <div className="card stack-sm">
          <label>Mot pour les participants<textarea rows={2} maxLength={500} value={noteEdit} onChange={e => setNoteEdit(e.target.value)} placeholder="Ex. virement sur BE.. ou Payconiq, merci !" /></label>
          <div className="row"><button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { if (await run(() => supabase.rpc('update_group_gift', { p_gift: g.id, p: { note: noteEdit } }))) setNoteEdit(null) }}>Enregistrer</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNoteEdit(null)}>Annuler</button></div>
        </div>
      )}

      {/* organisateurs */}
      {org && g.status !== 'cancelled' && (
        <>
          {open && (
            <div className="gg-actions">
              <button className="btn" onClick={() => setSharing(true)}><Icon name="share" size={16} /> Partager le lien</button>
              <button className="btn" onClick={() => setPicking('invite')}><Icon name="users" size={16} /> Inviter</button>
              {g.pending > 0 && <button className="btn" disabled={busy} onClick={remind}><Icon name="bell" size={16} /> Relancer ({g.pending})</button>}
            </div>
          )}
          <div className="card gg-members">
            <div className="gg-members-head"><span>Réponses</span>{g.status !== 'open' || g.members.some(m => m.answer === 'yes') ? <span>A payé</span> : null}</div>
            {g.members.map(m => (
              <div key={m.id} className="gg-member">
                <PersonDot name={m.name} color={tint(m.name)} size={32} />
                <span className="grow">
                  <strong>{m.me ? 'Vous' : m.name}</strong>{m.organizer && <span className="gg-tag">organise</span>}<br />
                  <span className={`small ${m.answer === 'yes' ? 'gg-yes' : m.answer === 'no' ? 'muted' : 'gg-wait'}`}>
                    {m.answer === 'yes' ? `Participe${m.amount !== null ? ` · ${approx}${euros(m.amount)}` : ''}` : m.answer === 'no' ? 'Ne participe pas' : 'Pas encore répondu'}
                  </span>
                </span>
                {m.answer === 'yes' && (
                  <input type="checkbox" checked={Boolean(m.paid)} aria-label={`${m.me ? 'Vous avez' : `${m.name} a`} payé`} title="A payé"
                    onChange={e => run(() => supabase.rpc('set_group_gift_paid', { p_gift: g.id, p_user: m.id, p_paid: e.target.checked }))} />
                )}
                {m.id !== g.created_by && !m.me && (
                  <ActionMenu label={`Options pour ${m.name}`} actions={[
                    !m.organizer && { icon: 'users', label: 'Nommer co-organisateur', onClick: () => run(() => supabase.rpc('invite_group_gift', { p_gift: g.id, p_users: [m.id], p_organizer: true }), `${m.name} organise avec vous.`) },
                    { icon: 'trash', label: 'Retirer', danger: true, onClick: () => removeMember(m) },
                  ]} />
                )}
              </div>
            ))}
            {(g.invites ?? []).map(i => (
              <div key={i.id} className="gg-member">
                <span className="gg-mail-dot"><Icon name="mail" size={15} /></span>
                <span className="grow" style={{ minWidth: 0 }}><strong className="ell" style={{ display: 'block' }}>{i.email}</strong><span className="small gg-wait">Invité par e-mail · pas encore répondu</span></span>
                {open && <button className="btn btn-sm" disabled={busy} onClick={async () => {
                  setErr(''); setMsg('')
                  const { data } = await supabase.functions.invoke('send-invite-email', { body: { group_invite_id: i.id } })
                  const d = data as { sent?: boolean; error?: string } | null
                  if (d?.sent) setMsg(`E-mail renvoyé à ${i.email}.`); else setErr(d?.error ?? 'E-mail non envoyé : partagez plutôt le lien.')
                }}>Renvoyer</button>}
                <button className="icon-btn danger" aria-label={`Retirer l'invitation de ${i.email}`} title="Retirer" onClick={() => run(() => supabase.rpc('remove_group_gift_invite', { p_invite: i.id }))}><Icon name="x" size={16} /></button>
              </div>
            ))}
            <button className="linkbtn small gg-addorg" onClick={() => setPicking('org')}><Icon name="plus" size={13} /> Ajouter un co-organisateur</button>
          </div>
          {g.note === null && noteEdit === null && <button className="linkbtn small" onClick={() => setNoteEdit('')}><Icon name="chat" size={13} /> Ajouter un mot pour les participants (virement…)</button>}

          {open && <button className="btn btn-primary btn-lg" disabled={busy || g.yes === 0} onClick={() => setClosing(true)}>Fermer la cagnotte</button>}
          {g.status === 'closed' && (
            <>
              <button className="btn btn-primary btn-lg" disabled={busy} onClick={bought}><Icon name="check" size={16} /> Le cadeau est acheté</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={reopen}>Rouvrir la cagnotte</button>
            </>
          )}
          {g.status !== 'bought' && <button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={cancel}>Annuler le cadeau commun</button>}
          <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Seuls les organisateurs voient le détail par personne. Les autres voient le total et qui participe.</p>
        </>
      )}

      {!org && g.status !== 'cancelled' && g.members.length > 0 && (
        <div className="card gg-members">
          <div className="gg-members-head"><span>Qui participe</span></div>
          <p className="small" style={{ margin: 0 }}>{yesNames.length ? names(yesNames) : 'Personne pour l\'instant.'}</p>
        </div>
      )}

      {g.status === 'bought' && <p className="small muted" style={{ textAlign: 'center' }}>{g.recipient_on_site && g.from_list ? `${g.recipient_name} découvrira le lendemain du ${formatDateShort(g.give_on)} qui a offert ce cadeau : ${names(yesNames)}.` : 'Le cadeau rejoindra vos archives après la remise.'}</p>}

      {sharing && shareUrl && (
        <ShareSheet
          title="Partager le cadeau commun"
          intro={`Vos proches ouvrent le lien, se connectent et disent s'ils participent.${g.recipient_on_site ? ` ${g.recipient_name} ne peut pas l'ouvrir : pas de risque de gâcher la surprise.` : ''}`}
          message={`Coucou ! On se cotise pour offrir « ${g.title} » à ${g.recipient_name} le ${formatDateShort(g.give_on)}. Tu participes ? Réponds ici : ${shareUrl}`}
          subject={`Cadeau commun pour ${g.recipient_name}`}
          heading={`Cadeau commun pour ${g.recipient_name}`} sub={g.title} imageUrl={g.image_url}
          fileName="cadeau-commun" onClose={() => setSharing(false)}
        >
          <CopyField value={shareUrl} share={false} />
        </ShareSheet>
      )}
      {picking && <PickPeople g={g} organizer={picking === 'org'} onClose={() => setPicking(null)} onDone={async (n) => { setPicking(null); setMsg(n); await load() }} />}
      {closing && <CloseModal g={g} onClose={() => setClosing(false)} onDone={async () => { setClosing(false); setMsg('Cagnotte fermée : chaque participant a reçu sa part finale.'); await load() }} />}
    </div>
  )
}

/** Inviter des proches et/ou des adresses e-mail, ou nommer des co-organisateurs */
function PickPeople({ g, organizer, onClose, onDone }: { g: GG; organizer: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [people, setPeople] = useState<{ user_id: string; display_name: string }[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [emails, setEmails] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.rpc('my_people').then(({ data }) => setPeople((data as { user_id: string; display_name: string }[]) ?? [])) }, [])
  const already = new Map(g.members.map(m => [m.id, m]))
  const list = (people ?? []).filter(p => organizer ? !already.get(p.user_id)?.organizer : !already.has(p.user_id))
  const save = async () => {
    setBusy(true); setErr('')
    if (picked.size) {
      const { error } = await supabase.rpc('invite_group_gift', { p_gift: g.id, p_users: [...picked], p_organizer: organizer })
      if (error) { setBusy(false); setErr(errMsg(error)); return }
    }
    const mail = await sendGroupInvites(g.id, emails)
    setBusy(false)
    if (mail.error) { setErr(mail.error); return }
    if (organizer) return onDone('Co-organisateur ajouté.')
    const parts = [picked.size ? `${picked.size} proche${picked.size > 1 ? 's' : ''} invité${picked.size > 1 ? 's' : ''}` : '',
      emails.length ? (mail.sent === mail.total ? `${mail.total} e-mail${mail.total > 1 ? 's' : ''} envoyé${mail.total > 1 ? 's' : ''}` : `${mail.sent} e-mail${mail.sent > 1 ? 's' : ''} sur ${mail.total} envoyé${mail.sent > 1 ? 's' : ''} (partagez aussi le lien)`) : '']
    onDone(parts.filter(Boolean).join(' · ') + '.')
  }
  return (
    <Modal title={organizer ? 'Ajouter un co-organisateur' : 'Inviter'} onClose={onClose}>
      <div className="stack">
        {people === null ? <Spinner /> : list.length === 0
          ? <p className="muted" style={{ margin: 0 }}>{organizer ? 'Tous vos proches organisent déjà, ou vous n\'avez pas encore de proches sur le site.' : 'Tous vos proches sont déjà invités.'}</p>
          : <>{!organizer && <span className="small muted">Vos proches sur le site</span>}
              <PeoplePicker people={list} selected={picked} exclude={[]} autoFocus
                onToggle={id => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n) }} /></>}
        {!organizer && <><span className="small muted">Et / ou par adresse e-mail</span><EmailsInput emails={emails} setEmails={setEmails} /></>}
        {organizer && <p className="small muted" style={{ margin: 0 }}>Un co-organisateur voit le détail des montants, coche qui a payé et peut fermer la cagnotte.</p>}
        {err && <Notice>{err}</Notice>}
        <button className="btn btn-primary" disabled={busy || picked.size + emails.length === 0} onClick={save}>
          {organizer ? 'Nommer co-organisateur' : `Inviter${picked.size + emails.length ? ` (${picked.size + emails.length})` : ''}`}</button>
      </div>
    </Modal>
  )
}

/** Fermer la cagnotte : parts finales et, s'il y a plus que le prix, que faire du reste */
function CloseModal({ g, onClose, onDone }: { g: GG; onClose: () => void; onDone: () => void }) {
  const surplus = Math.round((g.total - g.price) * 100) / 100
  const over = (g.split === 'free' || Boolean(g.fixed_share)) && surplus > 0
  const short = g.total < g.price ? Math.round((g.price - g.total) * 100) / 100 : 0
  const [choice, setChoice] = useState<'reduce' | 'extra' | 'voucher'>('reduce')
  const [extraItem, setExtraItem] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const yes = g.members.filter(m => m.answer === 'yes')
  const ratio = over ? g.price / g.total : 1
  const preview = yes.map(m => ({ m, v: g.split === 'equal' && !g.fixed_share ? g.price / yes.length : (m.amount ?? 0) * (over && choice === 'reduce' ? ratio : 1) }))

  const go = async () => {
    setErr('')
    if (over && choice !== 'reduce' && !extraItem && !text.trim()) { setErr('Décrivez ce que vous ajoutez.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('close_group_gift', { p_gift: g.id, p_surplus: over ? choice : null, p_extra_text: text.trim() || null, p_extra_item: over && choice === 'extra' ? extraItem : null })
    setBusy(false)
    if (error) setErr(errMsg(error)); else onDone()
  }

  return (
    <Modal title="Fermer la cagnotte" onClose={onClose}>
      <div className="stack">
        {over ? (
          <div className="gg-banner ok"><strong>Objectif dépassé : {euros(g.total)} pour {euros(g.price)}</strong><span>Il reste {euros(surplus)}. Que voulez-vous en faire ?</span></div>
        ) : short > 0 ? (
          <div className="gg-banner warn"><strong>Il manque {euros(short)}</strong><span>Vous pouvez fermer quand même et compléter entre organisateurs, inviter d'autres personnes, ou attendre encore des réponses.</span></div>
        ) : (
          <div className="gg-banner ok"><strong>{euros(g.price)} réunis</strong><span>{yes.length} participant{yes.length > 1 ? 's' : ''}.</span></div>
        )}

        {over && (
          <div className="stack-sm">
            <button type="button" className={`gg-option${choice === 'reduce' ? ' on' : ''}`} onClick={() => setChoice('reduce')}>
              <span className="row between"><strong>Réduire les parts</strong><span className="gg-tag">conseillé</span></span>
              <span>Chacun paie moins, à proportion de ce qu'il avait promis.</span>
            </button>
            <button type="button" className={`gg-option${choice === 'extra' ? ' on' : ''}`} onClick={() => setChoice('extra')}>
              <strong>Ajouter un petit cadeau</strong>
              <span>Une autre idée qui tient dans les {euros(surplus)}.</span>
            </button>
            {choice === 'extra' && (
              <div className="stack-sm gg-sub">
                {g.extras.length > 0 && (
                  <div className="gg-extras">
                    {g.extras.map(x => (
                      <button key={x.id} type="button" className={`gg-extra${extraItem === x.id ? ' on' : ''}`} onClick={() => { setExtraItem(extraItem === x.id ? null : x.id); setText('') }}>
                        <span className="gg-extra-img">{x.image_url ? <img src={x.image_url} alt="" referrerPolicy="no-referrer" /> : <Icon name="gift" size={20} />}</span>
                        <span className="small"><strong>{x.title}</strong><br />{euros(x.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input placeholder={g.extras.length ? 'Ou une autre idée…' : 'Ex. une boîte de chocolats'} value={text} maxLength={200} onChange={e => { setText(e.target.value); setExtraItem(null) }} />
              </div>
            )}
            <button type="button" className={`gg-option${choice === 'voucher' ? ' on' : ''}`} onClick={() => setChoice('voucher')}>
              <strong>Un bon d'achat ou une enveloppe</strong>
              <span>{g.recipient_name} le découvrira avec le cadeau.</span>
            </button>
            {choice === 'voucher' && <input className="gg-sub" placeholder={`Ex. bon de ${euros(surplus)} chez …`} value={text} maxLength={200} onChange={e => setText(e.target.value)} />}
          </div>
        )}

        <div className="gg-finals">
          <span className="small muted">Parts finales</span>
          {preview.map(({ m, v }) => <div key={m.id} className="row between small"><span>{m.me ? 'Vous' : m.name}</span><strong>{euros(Math.round(v * 100) / 100)}</strong></div>)}
        </div>
        {err && <Notice>{err}</Notice>}
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={go}>Fermer et prévenir les participants</button>
        <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Chacun reçoit sa part finale. Ensuite : « Le cadeau est acheté ».</p>
      </div>
    </Modal>
  )
}
