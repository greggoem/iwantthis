import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { formatDateShort, todayISO } from '../lib/format'
import Modal from './Modal'
import { Notice, Spinner } from './ui'

interface Ev { id: string; name: string; event_date: string }

/** Modifier l'occasion / la date de remise d'un cadeau que j'ai indiqué offrir (et, s'il est acheté, le prix payé) */
export default function ClaimDateModal({ itemId, title, ownerId, ownerName, eventId, revealOn, discreet: initialDiscreet = false, price, onClose, onSaved }: {
  itemId: string; title: string; ownerId: string; ownerName: string
  eventId: string | null; revealOn: string; discreet?: boolean
  price?: { paid: number | null; list: number | null }   // présent si le cadeau est acheté : prix payé modifiable
  onClose: () => void; onSaved: () => void
}) {
  const start = price ? price.paid ?? price.list : null
  const [amount, setAmount] = useState(start === null ? '' : String(start).replace('.', ','))
  const { session } = useAuth()
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [choice, setChoice] = useState<string>('custom')
  const [date, setDate] = useState(revealOn)
  const discreet = initialDiscreet   // option « discret » en pause : on conserve la valeur existante
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('id,name,event_date,event_members(user_id)')
      const me = session!.user.id
      const common = ((data as unknown as (Ev & { event_members: { user_id: string }[] })[]) ?? [])
        .filter(e => e.event_members.some(m => m.user_id === ownerId) && e.event_members.some(m => m.user_id === me))
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
      setEvents(common)
      setChoice(eventId && common.some(e => e.id === eventId) ? eventId : 'custom')
    })()
  }, [ownerId, eventId, session])

  const reveal = choice === 'custom' ? date : events?.find(e => e.id === choice)?.event_date

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    const n = amount.trim() ? Number(amount.replace(',', '.')) : null
    if (n !== null && !(Number.isFinite(n) && n >= 0 && n < 1000000)) { setErr('Indiquez un prix valide, par exemple 24,90.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('update_claim', {
      p_item: itemId, p_event: choice === 'custom' ? null : choice, p_reveal: choice === 'custom' ? date : null, p_discreet: discreet,
    })
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    // prix payé : changé → enregistré ; vidé → on revient au prix de l'envie
    const next = n ?? price?.list ?? null
    if (price && next !== null && next !== start) {
      const { error: pe } = await supabase.rpc('set_claim_bought', { p_item: itemId, p_bought: true, p_price: Math.round(next * 100) / 100 })
      if (pe) { setBusy(false); setErr(errMsg(pe)); return }
    }
    setBusy(false)
    onSaved()
  }

  return (
    <Modal title={price ? 'Modifier ce cadeau' : 'Modifier la date de remise'} onClose={onClose}>
      {events === null ? <Spinner /> : (
        <form className="stack" onSubmit={submit}>
          <Notice>{err}</Notice>
          <p className="muted">« {title} » pour {ownerName}.</p>
          {price && (
            <label>Prix payé{price.list === null ? ' (facultatif)' : ''}
              <span className="price-in"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={price.list === null ? 'Ex. 24,90' : String(price.list).replace('.', ',')} aria-label="Prix payé en euros" /> €</span>
              <span className="small muted">Sert à calculer votre budget.</span>
            </label>
          )}
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
          {choice === 'custom' && <input type="date" required value={date} min={todayISO() < revealOn ? todayISO() : undefined} onChange={e => setDate(e.target.value)} />}
          <p className="small muted">{ownerName} ne verra l'achat qu'à partir du lendemain du {reveal ? formatDateShort(reveal) : '…'}.</p>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" disabled={busy || (choice === 'custom' && !date)}>Enregistrer</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
