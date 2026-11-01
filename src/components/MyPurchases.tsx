import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { formatDateShort, formatPrice, todayISO } from '../lib/format'
import { IconButton, Notice } from './ui'
import { Thumb } from './GiftTable'
import ItemLink, { ItemAnchor } from './ItemLink'
import { useConfirm } from './Confirm'
import ClaimDateModal from './ClaimDateModal'

interface ClaimRow {
  item_id: string
  reveal_on: string
  event_id: string | null
  items: { id: string; title: string; url: string | null; price: number | null; image_url: string | null; wishlists: { owner_id: string } | null } | null
  events: { name: string } | null
}
interface Purchase {
  id: string; title: string; url: string | null; price: number | null; image: string | null
  owner: string; ownerId: string; revealOn: string; event: string | null; eventId: string | null
}

/** Profil : les cadeaux que j'ai indiqué offrir (à venir), avec possibilité d'annuler en cas de changement d'avis */
export default function MyPurchases() {
  const { session } = useAuth()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Purchase[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Purchase | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    const { data, error } = await supabase.from('item_claims')
      .select('item_id,reveal_on,event_id,items(id,title,url,price,image_url,wishlists(owner_id)),events(name)')
      .eq('claimed_by', session.user.id).order('reveal_on')
    if (error) { setErr(errMsg(error)); setRows([]); return }
    const claims = ((data as unknown as ClaimRow[]) ?? []).filter(c => c.items)
    const ownerIds = [...new Set(claims.map(c => c.items!.wishlists?.owner_id).filter(Boolean) as string[])]
    const names: Record<string, string> = {}
    if (ownerIds.length) {
      const { data: p } = await supabase.from('profiles').select('id,display_name').in('id', ownerIds)
      for (const x of (p as { id: string; display_name: string }[]) ?? []) names[x.id] = x.display_name
    }
    setRows(claims.map(c => ({
      id: c.item_id, title: c.items!.title, url: c.items!.url,
      price: c.items!.price === null ? null : Number(c.items!.price), image: c.items!.image_url,
      owner: names[c.items!.wishlists?.owner_id ?? ''] ?? 'Un proche', ownerId: c.items!.wishlists?.owner_id ?? '',
      revealOn: c.reveal_on, event: c.events?.name ?? null, eventId: c.event_id,
    })))
  }, [session])

  useEffect(() => { load() }, [load])

  const cancel = async (p: Purchase) => {
    if (!(await confirm({ title: 'Annuler cet achat ?', message: `Votre achat de « ${p.title} » pour ${p.owner} sera annulé. Le cadeau redeviendra disponible pour les autres invités.`, confirmLabel: 'Annuler l\'achat', danger: true }))) return
    setErr(''); setMsg(''); setBusy(p.id)
    const { error } = await supabase.from('item_claims').delete().eq('item_id', p.id)
    setBusy(null)
    if (error) setErr(errMsg(error)); else { setMsg(`Achat de « ${p.title} » annulé.`); load() }
  }

  if (rows === null) return null
  const today = todayISO()
  const upcoming = rows.filter(r => r.revealOn >= today)
  const past = rows.filter(r => r.revealOn < today)
  const total = upcoming.reduce((s, r) => s + (r.price ?? 0), 0)

  const Row = ({ p, canCancel }: { p: Purchase; canCancel: boolean }) => (
    <li className="purchase">
      <ItemAnchor url={p.url} className="thumb-link"><Thumb src={p.image} alt={p.title} /></ItemAnchor>
      <div className="purchase-main">
        <ItemAnchor url={p.url} className="title-link"><strong>{p.title}</strong></ItemAnchor>
        <p className="small muted">
          Pour {p.owner} · remise le {formatDateShort(p.revealOn)}{p.event ? ` · ${p.event}` : ''}
        </p>
        <div className="row wrap gap">
          {p.price !== null && <span className="small">{formatPrice(p.price)}</span>}
          <ItemLink url={p.url} />
        </div>
      </div>
      {canCancel && <div className="purchase-actions">
        <IconButton icon="pencil" label="Modifier la date de remise" onClick={() => setEditing(p)} />
        <IconButton icon="trash" label="Annuler mon achat" danger disabled={busy === p.id} onClick={() => cancel(p)} />
      </div>}
    </li>
  )

  return (
    <div className="stack">
      {upcoming.length > 0 && total > 0 && (
        <div className="row"><span className="chip">{upcoming.length} cadeau{upcoming.length > 1 ? 'x' : ''} à offrir · {formatPrice(total)}</span></div>
      )}
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {upcoming.length === 0
        ? <div className="empty"><div className="empty-ico"><Icon name="bag" size={26} /></div><h2>Rien à offrir pour l'instant</h2><p className="muted">Sur la liste d'un proche, cliquez « J'ai acheté » après votre achat : il apparaîtra ici.</p><Link className="btn btn-primary" to="/listes">Voir les listes de mes proches</Link></div>
        : <ul className="purchases card">{upcoming.map(p => <Row key={p.id} p={p} canCancel />)}</ul>}

      {editing && (
        <ClaimDateModal itemId={editing.id} title={editing.title} ownerId={editing.ownerId} ownerName={editing.owner}
          eventId={editing.eventId} revealOn={editing.revealOn} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg(`Date de remise de « ${editing.title} » mise à jour.`); load() }} />
      )}

      {past.length > 0 && (
        <details className="bm">
          <summary>Déjà remis ({past.length})</summary>
          <ul className="purchases">{past.map(p => <Row key={p.id} p={p} canCancel={false} />)}</ul>
        </details>
      )}
    </div>
  )
}
