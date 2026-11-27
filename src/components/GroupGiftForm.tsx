import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { fetchPreview } from '../lib/preview'
import { safeUrl } from '../lib/affiliate'
import { todayISO } from '../lib/format'
import { euros, type GGSeed } from '../lib/groupGifts'
import Modal from './Modal'
import Icon from './Icon'
import { Notice } from './ui'
import { PersonDot } from './ListPills'
import { tint } from './Draws'

interface Person { user_id: string; display_name: string }
interface Ev { id: string; name: string; event_date: string }
interface Wish { id: string; title: string; url: string | null; image_url: string | null; price: number | null; is_group: boolean }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const num = (s: string) => Number(s.replace(',', '.').replace(/[^\d.]/g, ''))

/** Les proches, avec recherche */
export function PeoplePicker({ people, selected, onToggle, exclude = [], autoFocus }: {
  people: Person[]; selected: Set<string>; onToggle: (id: string) => void; exclude?: (string | null | undefined)[]; autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const list = people.filter(p => !exclude.includes(p.user_id) && (!q.trim() || norm(p.display_name).includes(norm(q.trim()))))
  return (
    <div className="stack-sm">
      {people.length > 6 && (
        <input type="search" placeholder="Rechercher un proche…" value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus} aria-label="Rechercher un proche" />
      )}
      <div className="gg-chips">
        {list.map(p => {
          const on = selected.has(p.user_id)
          return (
            <button key={p.user_id} type="button" className={`gg-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onToggle(p.user_id)}>
              <PersonDot name={p.display_name} color={tint(p.display_name)} size={26} />{p.display_name}{on && <Icon name="check" size={14} />}
            </button>
          )
        })}
        {list.length === 0 && <span className="small muted">{people.length ? 'Personne ne correspond.' : 'Pas encore de proches sur le site.'}</span>}
      </div>
    </div>
  )
}

/** Adresses e-mail à inviter (pastilles) */
export function EmailsInput({ emails, setEmails }: { emails: string[]; setEmails: (e: string[]) => void }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const add = () => {
    const parts = v.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    const bad = parts.filter(x => !EMAIL.test(x))
    if (bad.length) { setErr(`Adresse invalide : ${bad.join(', ')}`); return }
    setEmails([...new Set([...emails, ...parts])]); setV(''); setErr('')
  }
  return (
    <div className="stack-sm">
      <div className="row">
        <input type="email" inputMode="email" placeholder="prenom@exemple.be" value={v} aria-label="Adresse e-mail à inviter"
          onChange={e => { setV(e.target.value); setErr('') }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} />
        <button type="button" className="btn" onClick={add} disabled={!v.trim()}>Ajouter</button>
      </div>
      {err && <span className="small danger">{err}</span>}
      {emails.length > 0 && (
        <div className="gg-chips">
          {emails.map(e => (
            <span key={e} className="gg-chip on gg-chip-sm"><Icon name="mail" size={13} />{e}
              <button type="button" className="gg-x" aria-label={`Retirer ${e}`} onClick={() => setEmails(emails.filter(x => x !== e))}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Invite des adresses e-mail et leur envoie l'e-mail d'invitation */
export async function sendGroupInvites(giftId: string, emails: string[]): Promise<{ sent: number; total: number; error?: string }> {
  if (!emails.length) return { sent: 0, total: 0 }
  const { data, error } = await supabase.rpc('invite_group_gift_emails', { p_gift: giftId, p_emails: emails })
  if (error) return { sent: 0, total: emails.length, error: errMsg(error) }
  const rows = (data as { id: string; email: string }[]) ?? []
  const res = await Promise.all(rows.map(r => supabase.functions.invoke('send-invite-email', { body: { group_invite_id: r.id } })
    .then(({ data: d }) => Boolean((d as { sent?: boolean } | null)?.sent)).catch(() => false)))
  return { sent: res.filter(Boolean).length, total: emails.length }
}

/**
 * « Nouveau cadeau commun » : pour qui (un proche ou quelqu'un d'autre), le cadeau (sur sa liste ou autre chose),
 * qui met combien (même part — prix divisé ou montant précis — ou chacun ce qu'il veut), pour quand, qui inviter (proches et/ou e-mails).
 */
export default function GroupGiftForm({ seed = {}, onClose }: { seed?: GGSeed; onClose: () => void }) {
  const nav = useNavigate()
  const fromItem = Boolean(seed.itemId)
  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [who, setWho] = useState<'proche' | 'autre' | null>(fromItem ? 'proche' : null)
  const [recipient, setRecipient] = useState<string | null>(seed.recipientId ?? null)
  const [other, setOther] = useState('')
  const [source, setSource] = useState<'list' | 'other'>('list')
  const [wishes, setWishes] = useState<Wish[] | null>(null)
  const [itemId, setItemId] = useState<string | null>(seed.itemId ?? null)
  const [url, setUrl] = useState(seed.url ?? '')
  const [title, setTitle] = useState(seed.title ?? '')
  const [image, setImage] = useState(seed.image ?? '')
  const [photos, setPhotos] = useState<string[]>([])
  const [price, setPrice] = useState(seed.price ? String(seed.price) : '')
  const [split, setSplit] = useState<'equal' | 'free'>('equal')
  const [fixedOn, setFixedOn] = useState(false)
  const [fixed, setFixed] = useState('')
  const [giveOn, setGiveOn] = useState(seed.giveOn ?? '')
  const [respondBy, setRespondBy] = useState('')
  const [eventId, setEventId] = useState(seed.eventId ?? '')
  const [orgs, setOrgs] = useState<Set<string>>(new Set())
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [emails, setEmails] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lastRead = useRef('')

  useEffect(() => {
    supabase.rpc('my_people').then(({ data }) => setPeople((data as Person[]) ?? []))
    supabase.from('events').select('id,name,event_date').gte('event_date', todayISO()).order('event_date')
      .then(({ data }) => setEvents((data as Ev[]) ?? []))
  }, [])

  // la liste du proche choisi (ce que je peux voir), sans ce qui est déjà réservé
  useEffect(() => {
    if (fromItem || who !== 'proche' || !recipient) { setWishes(null); return }
    let alive = true
    setWishes(null)
    ;(async () => {
      const { data: lists } = await supabase.from('wishlists').select('id').eq('owner_id', recipient).is('child_name', null)
      const ids = ((lists as { id: string }[]) ?? []).map(l => l.id)
      if (!ids.length) { if (alive) { setWishes([]); setSource('other') } return }
      const [{ data: its }, { data: cl }] = await Promise.all([
        supabase.from('items').select('id,title,url,image_url,price,is_group').in('list_id', ids).order('created_at', { ascending: false }),
        supabase.from('item_claims').select('item_id'),
      ])
      const taken = new Set(((cl as { item_id: string }[]) ?? []).map(c => c.item_id))
      const free = ((its as Wish[]) ?? []).filter(i => !i.is_group && !taken.has(i.id))
      if (alive) { setWishes(free); setSource(free.length ? 'list' : 'other') }
    })()
    return () => { alive = false }
  }, [who, recipient, fromItem])

  const pickWish = (w: Wish) => {
    if (itemId === w.id) { setItemId(null); return }
    setItemId(w.id); setTitle(w.title); setImage(w.image_url ?? ''); setUrl(w.url ?? ''); setPhotos([])
    if (w.price) setPrice(String(w.price))
  }
  const useOther = () => { setSource('other'); setItemId(null); setTitle(''); setImage(''); setUrl(''); setPrice('') }

  const pickEvent = (id: string) => {
    setEventId(id)
    const e = events.find(x => x.id === id)
    if (e && !giveOn) setGiveOn(e.event_date)
  }

  const readLink = async (raw: string) => {
    const u = safeUrl(raw)
    if (!u || lastRead.current === u.toString()) return
    lastRead.current = u.toString()
    setReading(true)
    const p = await fetchPreview(u.toString())
    setReading(false)
    if (p.title && !title) setTitle(p.title)
    if (p.image) setImage(prev => prev || p.image!)
    if (p.price !== undefined && !price) setPrice(String(p.price))
    if (p.url) setUrl(p.url)
    setPhotos(p.images ?? [])
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n)
  }

  const recipientName = fromItem ? (seed.recipientName ?? '')
    : who === 'proche' ? (people.find(p => p.user_id === recipient)?.display_name ?? '') : who === 'autre' ? other.trim() : ''
  const amount = num(price)
  const fixedAmount = num(fixed)
  const fromList = fromItem || (who === 'proche' && source === 'list')
  const giftReady = fromList ? Boolean(itemId) : Boolean(title.trim())
  const ready = Boolean(recipientName && giftReady && amount > 0 && giveOn && (!(split === 'equal' && fixedOn) || fixedAmount > 0))
  const peopleCount = invited.size + orgs.size + emails.length + 1

  const submit = async () => {
    setErr('')
    if (!recipientName) return setErr('Indiquez pour qui est le cadeau.')
    if (!giftReady) return setErr(fromList ? 'Choisissez une envie de sa liste, ou « Autre chose ».' : 'Indiquez le cadeau.')
    if (!(amount > 0)) return setErr('Indiquez le prix ou l\'objectif à réunir.')
    if (split === 'equal' && fixedOn && !(fixedAmount > 0)) return setErr('Indiquez le montant demandé à chacun.')
    if (!giveOn) return setErr('Indiquez la date de remise.')
    setBusy(true)
    const useItem = fromList ? itemId : null
    const { data, error } = await supabase.rpc('create_group_gift', { p: {
      item_id: useItem, recipient_id: useItem ? null : who === 'proche' ? recipient : null, recipient_name: recipientName,
      title: title.trim(), url: safeUrl(url)?.toString() ?? null, image_url: image || null, price: amount, split,
      fixed_share: split === 'equal' && fixedOn ? fixedAmount : null,
      give_on: giveOn, respond_by: respondBy || null, event_id: eventId || null,
      organizers: [...orgs], invitees: [...invited].filter(id => !orgs.has(id)),
    } })
    if (error) { setBusy(false); return setErr(errMsg(error)) }
    const id = data as string
    const mail = await sendGroupInvites(id, emails)
    setBusy(false)
    onClose()
    const q = new URLSearchParams({ nouveau: '1' })
    if (emails.length) q.set('mails', `${mail.sent}/${mail.total}`)
    nav(`/commun/${id}?${q}`)
  }

  const step = (n: number, label: string) => <h3 className="gg-step"><span className="gg-num">{n}</span>{label}</h3>

  return (
    <Modal title="Nouveau cadeau commun" onClose={onClose}>
      <div className="stack gg-form">
        {/* 1 · pour qui */}
        <section className="stack-sm">
          {step(1, 'Pour qui ?')}
          {fromItem ? (
            <div className="gg-chips"><span className="gg-chip on"><PersonDot name={recipientName || '?'} color={tint(recipientName || '?')} size={26} />{recipientName}</span></div>
          ) : (
            <>
              <div className="gg-modes">
                <button type="button" className={`gg-mode${who === 'proche' ? ' on' : ''}`} aria-pressed={who === 'proche'} onClick={() => setWho('proche')}>
                  <strong><Icon name="users" size={16} /> Un proche</strong><span>Quelqu'un du site : vous pouvez choisir dans sa liste</span>
                </button>
                <button type="button" className={`gg-mode${who === 'autre' ? ' on' : ''}`} aria-pressed={who === 'autre'} onClick={() => { setWho('autre'); setRecipient(null); setSource('other'); setItemId(null) }}>
                  <strong><Icon name="user" size={16} /> Quelqu'un d'autre</strong><span>Une collègue, Mamy… pas besoin d'être sur le site</span>
                </button>
              </div>
              {who === 'proche' && (recipient
                ? <div className="row wrap">
                    <span className="gg-chip on"><PersonDot name={recipientName} color={tint(recipientName)} size={26} />{recipientName}</span>
                    <button type="button" className="linkbtn small" onClick={() => { setRecipient(null); setItemId(null) }}>Changer</button>
                  </div>
                : <PeoplePicker people={people} selected={new Set()} onToggle={id => setRecipient(id)} autoFocus />)}
              {who === 'autre' && <input autoFocus placeholder="Son prénom (ex. Mamy, Sophie…)" value={other} maxLength={80} onChange={e => setOther(e.target.value)} aria-label="Pour qui" />}
              {recipientName && <p className="small muted" style={{ margin: 0 }}>{recipientName} ne verra rien de ce cadeau commun.</p>}
            </>
          )}
        </section>

        {/* 2 · le cadeau */}
        {recipientName && (
          <section className="stack-sm">
            {step(2, 'Le cadeau')}
            {who === 'proche' && !fromItem && (
              wishes === null ? <p className="small muted">Lecture de sa liste…</p> : (
                <div className="gg-modes">
                  <button type="button" className={`gg-mode${source === 'list' ? ' on' : ''}`} disabled={!wishes.length} aria-pressed={source === 'list'} onClick={() => setSource('list')}>
                    <strong><Icon name="list" size={16} /> Dans sa liste</strong>
                    <span>{wishes.length ? `${wishes.length} envie${wishes.length > 1 ? 's' : ''} encore libre${wishes.length > 1 ? 's' : ''}` : 'Sa liste n\'est pas partagée avec vous, ou tout est pris'}</span>
                  </button>
                  <button type="button" className={`gg-mode${source === 'other' ? ' on' : ''}`} aria-pressed={source === 'other'} onClick={useOther}>
                    <strong><Icon name="link" size={16} /> Autre chose</strong><span>Un lien, ou juste une idée</span>
                  </button>
                </div>
              )
            )}

            {!fromItem && who === 'proche' && source === 'list' && wishes && wishes.length > 0 && (
              <div className="gg-wishes">
                {wishes.map(w => (
                  <button key={w.id} type="button" className={`gg-wish${itemId === w.id ? ' on' : ''}`} aria-pressed={itemId === w.id} onClick={() => pickWish(w)}>
                    <span className="gg-wish-img">{w.image_url ? <img src={w.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="gift" size={22} />}</span>
                    <span className="gg-wish-t">{w.title}</span>
                    {w.price !== null && <span className="small muted">{euros(Number(w.price))}</span>}
                    {itemId === w.id && <span className="photo-choice-tick"><Icon name="check" size={13} /></span>}
                  </button>
                ))}
              </div>
            )}

            {(!fromList || itemId) && (
              <>
                {!fromList && (
                  <label><span>Lien du produit <span className="muted">(facultatif)</span></span>
                    <input type="url" inputMode="url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} onBlur={() => readLink(url)}
                      onPaste={e => { const t = e.clipboardData.getData('text'); if (safeUrl(t)) setTimeout(() => readLink(t), 0) }} />
                  </label>
                )}
                {reading && <p className="small muted">Lecture du lien…</p>}
                <div className="gg-gift">
                  <div className="gg-gift-img">{image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <Icon name="gift" size={30} />}</div>
                  <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
                    {!fromList
                      ? <input placeholder="Le cadeau (ex. Week-end spa)" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} aria-label="Le cadeau" />
                      : <strong>{title}</strong>}
                    <label className="gg-price">Prix ou objectif
                      <span className="gg-euro"><input inputMode="decimal" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} /> €</span>
                    </label>
                  </div>
                </div>
                {photos.length > 1 && (
                  <div className="photo-pick-row">
                    {photos.map(u => (
                      <button key={u} type="button" className={`photo-choice${image === u ? ' on' : ''}`} onClick={() => setImage(u)} aria-pressed={image === u}>
                        <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                        {image === u && <span className="photo-choice-tick"><Icon name="check" size={13} /></span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* 3 · qui met combien */}
        <section className="stack-sm">
          {step(3, 'Qui met combien ?')}
          <div className="stack-sm">
            <button type="button" className={`gg-mode${split === 'equal' ? ' on' : ''}`} aria-pressed={split === 'equal'} onClick={() => setSplit('equal')}>
              <strong>Même part pour tous</strong><span>Tout le monde met la même somme</span>
            </button>
            {split === 'equal' && (
              <div className="gg-sub stack-sm">
                <label className="gg-radio"><input type="radio" name="gg-eq" checked={!fixedOn} onChange={() => setFixedOn(false)} />
                  <span>Diviser le prix entre les participants{amount > 0 && peopleCount > 1 && <span className="muted"> (≈ {euros(Math.round(amount / peopleCount * 100) / 100)} chacun à {peopleCount})</span>}</span></label>
                <label className="gg-radio"><input type="radio" name="gg-eq" checked={fixedOn} onChange={() => setFixedOn(true)} />
                  <span>Demander un montant précis à chacun</span></label>
                {fixedOn && (
                  <div className="row wrap">
                    <span className="gg-euro"><input inputMode="decimal" placeholder="20" value={fixed} onChange={e => setFixed(e.target.value)} aria-label="Montant par personne" /> € par personne</span>
                    {fixedAmount > 0 && amount > 0 && <span className="small muted">soit {Math.ceil(amount / fixedAmount)} participant{Math.ceil(amount / fixedAmount) > 1 ? 's' : ''} pour réunir {euros(amount)}</span>}
                  </div>
                )}
              </div>
            )}
            <button type="button" className={`gg-mode${split === 'free' ? ' on' : ''}`} aria-pressed={split === 'free'} onClick={() => setSplit('free')}>
              <strong>Chacun ce qu'il veut</strong><span>Chacun indique son montant</span>
            </button>
          </div>
        </section>

        {/* 4 · pour quand */}
        <section className="stack-sm">
          {step(4, 'Pour quand ?')}
          <div className="gg-two">
            <label>Date de remise<input type="date" min={todayISO()} value={giveOn} onChange={e => setGiveOn(e.target.value)} /></label>
            <label><span>Répondre avant <span className="muted">(facultatif)</span></span><input type="date" min={todayISO()} max={giveOn || undefined} value={respondBy} onChange={e => setRespondBy(e.target.value)} /></label>
          </div>
          {events.length > 0 && (
            <label><span>Relier à un événement <span className="muted">(facultatif)</span></span>
              <select value={eventId} onChange={e => pickEvent(e.target.value)}>
                <option value="">Aucun</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          )}
        </section>

        {/* 5 · inviter */}
        <section className="stack-sm">
          {step(5, 'Qui inviter ?')}
          {people.length > 0 && (
            <>
              <span className="small muted">Vos proches sur le site</span>
              <PeoplePicker people={people} selected={new Set([...invited, ...orgs])} exclude={[recipient, seed.recipientId]}
                onToggle={id => { if (orgs.has(id)) toggle(orgs, setOrgs, id); else toggle(invited, setInvited, id) }} />
            </>
          )}
          <span className="small muted">{people.length ? 'Et / ou par adresse e-mail' : 'Par adresse e-mail'}</span>
          <EmailsInput emails={emails} setEmails={setEmails} />
          {invited.size + orgs.size > 0 && (
            <>
              <span className="small muted">Quelqu'un organise avec vous ? Touchez-le :</span>
              <div className="gg-chips">
                {people.filter(p => invited.has(p.user_id) || orgs.has(p.user_id)).map(p => (
                  <button key={p.user_id} type="button" className={`gg-chip gg-chip-sm${orgs.has(p.user_id) ? ' on' : ''}`} aria-pressed={orgs.has(p.user_id)}
                    onClick={() => { toggle(orgs, setOrgs, p.user_id); const n = new Set(invited); n.add(p.user_id); setInvited(n) }}>
                    {orgs.has(p.user_id) && <Icon name="check" size={13} />}{p.display_name}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="small muted" style={{ margin: 0 }}>Vous aurez aussi un lien à partager (WhatsApp…).</p>
        </section>

        {err && <Notice>{err}</Notice>}
        <button className="btn btn-primary btn-lg" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Création…' : 'Créer le cadeau commun'}
        </button>
      </div>
    </Modal>
  )
}
