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

/**
 * « Nouveau cadeau commun » : pour qui, le cadeau, qui met combien, pour quand, qui organise et qui inviter.
 * Lancé depuis « À offrir » (cadeau libre) ou depuis une envie d'une liste (seed.itemId : la personne et le cadeau sont connus).
 */
export default function GroupGiftForm({ seed = {}, onClose }: { seed?: GGSeed; onClose: () => void }) {
  const nav = useNavigate()
  const fromItem = Boolean(seed.itemId)
  const [people, setPeople] = useState<Person[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [recipient, setRecipient] = useState<string | null>(seed.recipientId ?? null)   // proche du site
  const [other, setOther] = useState(seed.recipientName && !seed.recipientId ? seed.recipientName : '')
  const [otherOpen, setOtherOpen] = useState(Boolean(seed.recipientName && !seed.recipientId))
  const [url, setUrl] = useState(seed.url ?? '')
  const [title, setTitle] = useState(seed.title ?? '')
  const [image, setImage] = useState(seed.image ?? '')
  const [photos, setPhotos] = useState<string[]>([])
  const [price, setPrice] = useState(seed.price ? String(seed.price) : '')
  const [split, setSplit] = useState<'equal' | 'free'>('equal')
  const [giveOn, setGiveOn] = useState(seed.giveOn ?? '')
  const [respondBy, setRespondBy] = useState('')
  const [eventId, setEventId] = useState(seed.eventId ?? '')
  const [orgs, setOrgs] = useState<Set<string>>(new Set())
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lastRead = useRef('')

  useEffect(() => {
    supabase.rpc('my_people').then(({ data }) => setPeople((data as Person[]) ?? []))
    supabase.from('events').select('id,name,event_date').gte('event_date', todayISO()).order('event_date')
      .then(({ data }) => setEvents((data as Ev[]) ?? []))
  }, [])

  // relié à un événement : sa date de remise par défaut
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

  const recipientName = fromItem ? (seed.recipientName ?? '') : recipient ? (people.find(p => p.user_id === recipient)?.display_name ?? '') : other.trim()
  const invitable = people.filter(p => p.user_id !== recipient && p.user_id !== seed.recipientId)
  const amount = Number(price.replace(',', '.'))
  const ready = recipientName && title.trim() && amount > 0 && giveOn

  const submit = async () => {
    setErr('')
    if (!recipientName) return setErr('Indiquez pour qui est le cadeau.')
    if (!title.trim()) return setErr('Indiquez le cadeau.')
    if (!(amount > 0)) return setErr('Indiquez le prix ou l\'objectif à réunir.')
    if (!giveOn) return setErr('Indiquez la date de remise.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group_gift', { p: {
      item_id: seed.itemId ?? null, recipient_id: fromItem ? null : recipient, recipient_name: recipientName,
      title: title.trim(), url: safeUrl(url)?.toString() ?? null, image_url: image || null, price: amount, split,
      give_on: giveOn, respond_by: respondBy || null, event_id: eventId || null,
      organizers: [...orgs], invitees: [...invited].filter(id => !orgs.has(id)),
    } })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    onClose()
    nav(`/commun/${data}?nouveau=1`)
  }

  const Step = ({ n, children }: { n: number; children: string }) => (
    <h3 className="gg-step"><span className="gg-num">{n}</span>{children}</h3>
  )

  return (
    <Modal title="Nouveau cadeau commun" onClose={onClose}>
      <div className="stack gg-form">
        <section className="stack-sm">
          <Step n={1}>Pour qui ?</Step>
          {fromItem ? (
            <div className="gg-chips"><span className="gg-chip on"><PersonDot name={recipientName || '?'} color={tint(recipientName || '?')} size={26} />{recipientName}</span></div>
          ) : (
            <>
              <div className="gg-chips">
                {people.map(p => (
                  <button key={p.user_id} type="button" className={`gg-chip${recipient === p.user_id ? ' on' : ''}`} aria-pressed={recipient === p.user_id}
                    onClick={() => { setRecipient(recipient === p.user_id ? null : p.user_id); setOtherOpen(false) }}>
                    <PersonDot name={p.display_name} color={tint(p.display_name)} size={26} />{p.display_name}
                  </button>
                ))}
                <button type="button" className={`gg-chip gg-chip-add${otherOpen ? ' on' : ''}`} onClick={() => { setOtherOpen(true); setRecipient(null) }}>
                  <Icon name="plus" size={15} />Quelqu'un d'autre
                </button>
              </div>
              {otherOpen && <input autoFocus placeholder="Son prénom (ex. Mamy, Sophie…)" value={other} maxLength={80} onChange={e => setOther(e.target.value)} />}
              {otherOpen && other.trim() && <p className="small muted">{other.trim()} n'est pas sur le site : rien à lui cacher.</p>}
              {recipient && <p className="small muted">{recipientName} ne verra rien de ce cadeau commun.</p>}
            </>
          )}
        </section>

        <section className="stack-sm">
          <Step n={2}>Le cadeau</Step>
          {!fromItem && (
            <label><span>Lien du produit <span className="muted">(facultatif)</span></span>
              <input type="url" inputMode="url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} onBlur={() => readLink(url)}
                onPaste={e => { const t = e.clipboardData.getData('text'); if (safeUrl(t)) setTimeout(() => readLink(t), 0) }} />
            </label>
          )}
          {reading && <p className="small muted">Lecture du lien…</p>}
          <div className="gg-gift">
            <div className="gg-gift-img">{image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <Icon name="gift" size={30} />}</div>
            <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
              <input placeholder="Le cadeau (ex. Week-end spa)" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} aria-label="Le cadeau" />
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
        </section>

        <section className="stack-sm">
          <Step n={3}>Qui met combien ?</Step>
          <div className="gg-modes">
            <button type="button" className={`gg-mode${split === 'equal' ? ' on' : ''}`} aria-pressed={split === 'equal'} onClick={() => setSplit('equal')}>
              <strong>Même part pour tous</strong>
              <span>{amount > 0 ? `${euros(amount)} divisés entre les participants` : 'Le prix est divisé entre les participants'}</span>
            </button>
            <button type="button" className={`gg-mode${split === 'free' ? ' on' : ''}`} aria-pressed={split === 'free'} onClick={() => setSplit('free')}>
              <strong>Chacun ce qu'il veut</strong>
              <span>Chacun indique son montant</span>
            </button>
          </div>
        </section>

        <section className="stack-sm">
          <Step n={4}>Pour quand ?</Step>
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

        {invitable.length > 0 && (
          <section className="stack-sm">
            <Step n={5}>Qui inviter ?</Step>
            <p className="small muted" style={{ margin: 0 }}>Touchez vos proches pour les inviter. Vous aurez aussi un lien à partager pour les autres.</p>
            <div className="gg-chips">
              {invitable.map(p => {
                const on = invited.has(p.user_id) || orgs.has(p.user_id)
                return (
                  <button key={p.user_id} type="button" className={`gg-chip${on ? ' on' : ''}`} aria-pressed={on}
                    onClick={() => { if (orgs.has(p.user_id)) toggle(orgs, setOrgs, p.user_id); else toggle(invited, setInvited, p.user_id) }}>
                    <PersonDot name={p.display_name} color={tint(p.display_name)} size={26} />{p.display_name}{orgs.has(p.user_id) && <span className="gg-tag">co-organise</span>}
                  </button>
                )
              })}
            </div>
            {[...invited].length > 0 && (
              <>
                <p className="small muted" style={{ margin: 0 }}>Quelqu'un organise avec vous ? Touchez-le ici :</p>
                <div className="gg-chips">
                  {invitable.filter(p => invited.has(p.user_id) || orgs.has(p.user_id)).map(p => (
                    <button key={p.user_id} type="button" className={`gg-chip gg-chip-sm${orgs.has(p.user_id) ? ' on' : ''}`} aria-pressed={orgs.has(p.user_id)}
                      onClick={() => { toggle(orgs, setOrgs, p.user_id); const n = new Set(invited); n.add(p.user_id); setInvited(n) }}>
                      {orgs.has(p.user_id) && <Icon name="check" size={13} />}{p.display_name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {err && <Notice>{err}</Notice>}
        <button className="btn btn-primary btn-lg" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Création…' : 'Créer le cadeau commun'}
        </button>
      </div>
    </Modal>
  )
}
