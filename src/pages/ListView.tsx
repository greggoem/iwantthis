import { useCallback, useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { formatDateShort, formatPrice, todayISO } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { Notice, Spinner } from '../components/ui'
import ItemLink from '../components/ItemLink'

interface CommonEvent { id: string; name: string; event_date: string }

export default function ListView() {
  const { id } = useParams()
  const { session } = useAuth()
  const me = session!.user.id
  const [list, setList] = useState<Wishlist | null>(null)
  const [owner, setOwner] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [events, setEvents] = useState<CommonEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [choice, setChoice] = useState('custom')
  const [customDate, setCustomDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: l } = await supabase.from('wishlists').select('*').eq('id', id!).maybeSingle()
    if (!l) { setList(null); setLoading(false); return }
    const wl = l as Wishlist
    setList(wl)
    const [p, it, cl, ev] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', wl.owner_id).maybeSingle(),
      supabase.from('items').select('*').eq('list_id', wl.id).order('created_at'),
      supabase.from('item_claims').select('*'),
      supabase.from('events').select('id,name,event_date,event_members(user_id)'),
    ])
    setOwner((p.data as { display_name: string } | null)?.display_name ?? 'Cette personne')
    setItems((it.data as Item[]) ?? [])
    const ids = new Set(((it.data as Item[]) ?? []).map(i => i.id))
    setClaims(Object.fromEntries(((cl.data as Claim[]) ?? []).filter(c => ids.has(c.item_id)).map(c => [c.item_id, c])))
    const common = ((ev.data as unknown as (CommonEvent & { event_members: { user_id: string }[] })[]) ?? [])
      .filter(e => e.event_members.some(m => m.user_id === wl.owner_id))
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
    setEvents(common)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const startClaim = (itemId: string) => {
    setClaimingId(itemId)
    const upcoming = events.find(e => e.event_date >= todayISO())
    setChoice(upcoming ? upcoming.id : events[0]?.id ?? 'custom')
    setCustomDate(todayISO())
  }

  const confirmClaim = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('claim_item', {
      p_item: claimingId,
      p_event: choice === 'custom' ? null : choice,
      p_reveal: choice === 'custom' ? customDate : null,
    })
    setBusy(false)
    if (error) setErr(errMsg(error)); else setClaimingId(null)
    load()
  }

  const unclaim = async (itemId: string) => {
    const { error } = await supabase.from('item_claims').delete().eq('item_id', itemId)
    if (error) setErr(errMsg(error)); else load()
  }

  if (loading) return <Spinner />
  if (!list) return <Notice>Liste introuvable, ou vous n'y avez pas accès. Demandez le lien de partage à la personne.</Notice>
  if (list.owner_id === me) return <Navigate to="/" replace />

  const revealDate = choice === 'custom' ? customDate : events.find(e => e.id === choice)?.event_date

  return (
    <div className="narrow">
      <h1>{list.title}</h1>
      <p className="muted">Liste de <strong>{owner}</strong>. {owner} ne voit pas ce que vous marquez comme acheté, avant la date de remise.</p>
      <Notice>{err}</Notice>
      {items.length === 0 && <p className="muted">Cette liste est encore vide.</p>}

      <ul className="items">
        {items.map(it => {
          const c = claims[it.id]
          const mine = c?.claimed_by === me
          return (
            <li key={it.id}>
              <div className={`card item ${c ? 'claimed' : ''}`}>
                <div className="item-main">
                  <strong>{it.title}</strong>
                  {it.details && <p className="small">{it.details}</p>}
                  <div className="row wrap gap">
                    {it.price !== null && <span className="small muted">{formatPrice(it.price)}</span>}
                    <ItemLink url={it.url} />
                  </div>

                  {c && (
                    <p className="badge badge-ok">
                      ✓ Déjà acheté par {mine ? 'vous' : c.claimed_by_name} · remise le {formatDateShort(c.reveal_on)}
                    </p>
                  )}

                  {claimingId === it.id && (
                    <div className="claimbox stack">
                      <strong className="small">Pour quelle occasion ?</strong>
                      {events.map(e => (
                        <label key={e.id} className="radio">
                          <input type="radio" name="occ" checked={choice === e.id} onChange={() => setChoice(e.id)} />
                          {e.name} <span className="muted">· {formatDateShort(e.event_date)}</span>
                        </label>
                      ))}
                      <label className="radio">
                        <input type="radio" name="occ" checked={choice === 'custom'} onChange={() => setChoice('custom')} />
                        Autre date de remise
                      </label>
                      {choice === 'custom' && (
                        <input type="date" value={customDate} min={todayISO()} onChange={e => setCustomDate(e.target.value)} />
                      )}
                      <p className="small muted">
                        {owner} ne verra l'achat qu'à partir du {revealDate ? formatDateShort(revealDate) : '…'}. Les autres invités le voient tout de suite.
                      </p>
                      <div className="row">
                        <button className="btn btn-primary btn-sm" disabled={busy || (choice === 'custom' && !customDate)} onClick={confirmClaim}>Confirmer</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setClaimingId(null)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  {!c && claimingId !== it.id && (
                    <button className="btn btn-sm" onClick={() => startClaim(it.id)}>J'ai acheté ce cadeau</button>
                  )}
                  {mine && <button className="btn btn-ghost btn-sm" onClick={() => unclaim(it.id)}>Annuler mon achat</button>}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
