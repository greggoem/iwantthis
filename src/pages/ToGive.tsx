import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { formatDateShort, todayISO } from '../lib/format'
import { euros, type GGCard } from '../lib/groupGifts'
import { IconButton, Notice, Spinner } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { PersonDot } from '../components/ListPills'
import { Thumb } from '../components/GiftTable'
import { ItemAnchor } from '../components/ItemLink'
import Icon from '../components/Icon'
import ClaimDateModal from '../components/ClaimDateModal'
import PriceModal from '../components/PriceModal'
import GroupGiftForm from '../components/GroupGiftForm'

type Stage = 'choose' | 'buy' | 'bought'
type View = 'stage' | 'person'

interface ClaimRow {
  item_id: string; reveal_on: string; event_id: string | null; discreet: boolean; bought: boolean; paid_price: number | null
  items: { id: string; title: string; url: string | null; price: number | null; image_url: string | null; list_id: string
    wishlists: { owner_id: string; child_name: string | null; child_color: string | null } | null } | null
  events: { name: string } | null
}
interface DrawTarget {
  event_id: string; event_name: string; event_date: string; draw_name: string; giver_kid: string | null
  receiver_name: string; receiver_kind: 'user' | 'kid'; receiver_color: string | null; receiver_list: string | null; chosen: boolean
}

/** Une ligne de « À offrir » : une envie prise, un cadeau commun ou une personne tirée au sort */
interface Entry {
  key: string; kind: 'claim' | 'group' | 'draw'; stage: Stage
  who: string; whoKey: string; whoColor: string | null; whoKid: boolean; list: string | null
  date: string; eventId: string | null; eventName: string | null
  title: string; url: string | null; image: string | null
  price: number | null        // envie : son prix ; cadeau commun : ma part
  paid: number | null         // envie : prix payé indiqué
  claim?: ClaimRow & { ownerId: string }
  gg?: GGCard
  draw?: DrawTarget
}

const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'choose', label: 'À choisir', hint: 'Personnes tirées au sort sans cadeau, cadeaux communs qui attendent votre réponse' },
  { key: 'buy', label: 'À acheter', hint: 'Réservé pour vous, pas encore acheté' },
  { key: 'bought', label: 'Acheté', hint: 'Prêt à offrir' },
]
const VIEW_KEY = 'iwt-togive-view'

export default function ToGive() {
  const { session } = useAuth()
  const me = session!.user.id
  const confirm = useConfirm()
  const [claims, setClaims] = useState<(ClaimRow & { ownerId: string; ownerName: string })[] | null>(null)
  const [ggs, setGgs] = useState<GGCard[]>([])
  const [draws, setDraws] = useState<DrawTarget[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [pricing, setPricing] = useState<Entry | null>(null)
  const [creating, setCreating] = useState(false)
  const [ev, setEv] = useState<string>('all')   // filtre : 'all' | id d'événement | 'none'
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === 'person' ? 'person' : 'stage' } catch { return 'stage' } })
  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* navigation privée */ } }

  const load = useCallback(async () => {
    const [c, g, d] = await Promise.all([
      supabase.from('item_claims')
        .select('item_id,reveal_on,event_id,discreet,bought,paid_price,items(id,title,url,price,image_url,list_id,wishlists(owner_id,child_name,child_color)),events(name)')
        .eq('claimed_by', me).is('group_gift_id', null).order('reveal_on'),
      supabase.rpc('my_group_gifts'),
      supabase.rpc('my_draw_targets'),
    ])
    if (c.error) setErr(errMsg(c.error))
    const rows = ((c.data as unknown as ClaimRow[]) ?? []).filter(x => x.items)
    const ownerIds = [...new Set(rows.map(x => x.items!.wishlists?.owner_id).filter(Boolean) as string[])]
    const names: Record<string, string> = {}
    if (ownerIds.length) {
      const { data: p } = await supabase.from('profiles').select('id,display_name').in('id', ownerIds)
      for (const x of (p as { id: string; display_name: string }[]) ?? []) names[x.id] = x.display_name
    }
    setClaims(rows.map(x => ({ ...x, ownerId: x.items!.wishlists?.owner_id ?? '', ownerName: x.items!.wishlists?.child_name || names[x.items!.wishlists?.owner_id ?? ''] || 'Un proche' })))
    setGgs((g.data as GGCard[]) ?? [])
    setDraws((d.data as DrawTarget[]) ?? [])
  }, [me])
  useEffect(() => { load() }, [load])

  const today = todayISO()
  const { current, past } = useMemo(() => {
    const all: Entry[] = []
    const old: Entry[] = []
    for (const c of claims ?? []) {
      const it = c.items!
      const e: Entry = {
        key: `c${c.item_id}`, kind: 'claim', stage: c.bought === false ? 'buy' : 'bought',
        who: c.ownerName, whoKey: it.list_id, whoColor: it.wishlists?.child_name ? it.wishlists.child_color ?? 'corail' : null, whoKid: Boolean(it.wishlists?.child_name), list: it.list_id,
        date: c.reveal_on, eventId: c.event_id, eventName: c.events?.name ?? null,
        title: it.title, url: it.url, image: it.image_url, price: it.price === null ? null : Number(it.price), paid: c.paid_price === null ? null : Number(c.paid_price), claim: c,
      }
      ;(c.reveal_on < today ? old : all).push(e)
    }
    for (const g of ggs) {
      if (g.answer === 'no') continue
      const stage: Stage = g.status === 'open' && g.answer === 'pending' ? 'choose' : g.status === 'bought' ? 'bought' : 'buy'
      const e: Entry = {
        key: `g${g.id}`, kind: 'group', stage,
        who: g.recipient_name, whoKey: g.recipient_list ?? `n:${g.recipient_name.toLowerCase()}`, whoColor: null, whoKid: false, list: g.recipient_list,
        date: g.give_on, eventId: g.event_id ?? null, eventName: g.event_name ?? null,
        title: g.title, url: g.url, image: g.image_url, price: g.answer === 'yes' && g.share !== null ? Number(g.share) : null, paid: null, gg: g,
      }
      ;(g.status === 'bought' && g.give_on < today ? (g.answer === 'yes' ? old : null) : all)?.push(e)
    }
    for (const d of draws) {
      if (d.chosen) continue
      all.push({
        key: `d${d.event_id}${d.receiver_list ?? d.receiver_name}${d.giver_kid ?? ''}`, kind: 'draw', stage: 'choose',
        who: d.receiver_name, whoKey: d.receiver_list ?? `n:${d.receiver_name.toLowerCase()}`, whoColor: d.receiver_kind === 'kid' ? d.receiver_color ?? 'corail' : null, whoKid: d.receiver_kind === 'kid', list: d.receiver_list,
        date: d.event_date, eventId: d.event_id, eventName: d.event_name,
        title: `Tiré au sort${d.giver_kid ? ` par ${d.giver_kid}` : ''}`, url: null, image: null, price: null, paid: null, draw: d,
      })
    }
    all.sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who))
    old.sort((a, b) => b.date.localeCompare(a.date))
    return { current: all, past: old }
  }, [claims, ggs, draws, today])

  // événements présents, pour le filtre
  const events = useMemo(() => {
    const m = new Map<string, { id: string; name: string; date: string }>()
    for (const e of current) if (e.eventId && e.eventName && !m.has(e.eventId)) m.set(e.eventId, { id: e.eventId, name: e.eventName, date: e.date })
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [current])
  const hasNone = current.some(e => !e.eventId)
  const evOk = ev === 'all' || (ev === 'none' ? hasNone : events.some(e => e.id === ev))
  const shown = current.filter(e => !evOk || ev === 'all' || (ev === 'none' ? !e.eventId : e.eventId === ev))

  // budget : dépensé (acheté) et prévu (à acheter) ; les envies sans prix ne comptent pas
  const amount = (e: Entry) => (e.kind === 'claim' ? e.paid ?? e.price : e.kind === 'group' ? e.price : null)
  const spent = shown.filter(e => e.stage === 'bought').reduce((s, e) => s + (amount(e) ?? 0), 0)
  const planned = shown.filter(e => e.stage === 'buy').reduce((s, e) => s + (amount(e) ?? 0), 0)
  const noPrice = shown.filter(e => e.kind === 'claim' && amount(e) === null).length
  const count = (s: Stage) => shown.filter(e => e.stage === s).length

  const setBought = async (e: Entry, bought: boolean, price: number | null = null) => {
    setErr(''); setMsg(''); setBusy(e.key); setPricing(null)
    const { error } = await supabase.rpc('set_claim_bought', { p_item: e.claim!.item_id, p_bought: bought, p_price: price })
    setBusy(null)
    if (error) setErr(errMsg(error)); else { setMsg(bought ? `« ${e.title} » est acheté.` : `« ${e.title} » est de nouveau à acheter.`); load() }
  }
  const markBought = (e: Entry) => (e.price === null && e.paid === null ? setPricing(e) : setBought(e, true))
  const ggBought = async (e: Entry) => {
    if (!(await confirm({ title: 'Cadeau commun acheté ?', message: `Les participants à « ${e.title} » seront prévenus que le cadeau est acheté.`, confirmLabel: 'C\'est acheté' }))) return
    setErr(''); setMsg(''); setBusy(e.key)
    const { error } = await supabase.rpc('mark_group_gift_bought', { p_gift: e.gg!.id })
    setBusy(null)
    if (error) setErr(errMsg(error)); else { setMsg(`« ${e.title} » est acheté.`); load() }
  }
  const cancel = async (e: Entry) => {
    if (!(await confirm({ title: 'Annuler ce cadeau ?', message: `« ${e.title} » pour ${e.who} redeviendra disponible pour les autres.`, confirmLabel: 'Annuler le cadeau', danger: true }))) return
    setErr(''); setMsg(''); setBusy(e.key)
    const { error } = await supabase.from('item_claims').delete().eq('item_id', e.claim!.item_id)
    setBusy(null)
    if (error) setErr(errMsg(error)); else { setMsg(`« ${e.title} » annulé.`); load() }
  }

  if (claims === null) return <div className="narrow"><h1>Mes cadeaux à offrir</h1><Spinner /></div>

  const status = (e: Entry): ReactNode => {
    if (e.kind === 'draw') return <span className="chip chip-todo">À choisir</span>
    if (e.kind === 'group') {
      const g = e.gg!
      if (e.stage === 'choose') return <span className="chip chip-todo">À répondre</span>
      if (g.status === 'open') return <span className="chip">Cagnotte en cours</span>
      if (g.status === 'closed') return <span className="chip chip-todo">À acheter</span>
      return <span className="chip chip-ok"><Icon name="check" size={13} /><span className="ell">Acheté</span></span>
    }
    return e.stage === 'buy' ? <span className="chip chip-todo">À acheter</span> : <span className="chip chip-ok"><Icon name="check" size={13} /><span className="ell">Acheté</span></span>
  }

  const actions = (e: Entry, live: boolean): ReactNode => {
    if (!live) return e.kind === 'group' ? <Link className="btn btn-sm btn-ghost" to={`/commun/${e.gg!.id}`}>Voir</Link> : null
    if (e.kind === 'draw') return e.list ? <Link className="btn btn-sm btn-primary" to={`/listes/${e.list}`}>Choisir dans sa liste</Link> : <span className="small muted">Pas encore de liste</span>
    if (e.kind === 'group') {
      const g = e.gg!
      return <>
        {e.stage === 'choose' && <Link className="btn btn-sm btn-primary" to={`/commun/${g.id}`}>Répondre</Link>}
        {g.status === 'closed' && g.is_organizer && <button className="btn btn-sm btn-primary" disabled={busy === e.key} onClick={() => ggBought(e)}>C'est acheté</button>}
        {e.stage !== 'choose' && <Link className="btn btn-sm btn-ghost" to={`/commun/${g.id}`}>Suivi</Link>}
      </>
    }
    return <>
      {e.stage === 'buy' && <button className="btn btn-sm btn-primary" disabled={busy === e.key} onClick={() => markBought(e)}>C'est acheté</button>}
      {e.stage === 'bought' && <IconButton icon="refresh" label="Remettre à acheter" disabled={busy === e.key} onClick={() => setBought(e, false)} />}
      <IconButton icon="pencil" label={e.stage === 'bought' ? 'Modifier le prix ou la date' : 'Modifier la date de remise'} onClick={() => setEditing(e)} />
      <IconButton icon="trash" label="Annuler ce cadeau" danger disabled={busy === e.key} onClick={() => cancel(e)} />
    </>
  }

  const Row = ({ e, withWho = true, live = true }: { e: Entry; withWho?: boolean; live?: boolean }) => {
    const a = amount(e)
    const sub = [
      withWho && e.kind !== 'draw' ? `Pour ${e.who}` : null,
      e.kind === 'draw' ? `${e.draw!.draw_name} · ${e.eventName}` : null,
      `${e.kind === 'draw' ? 'le' : 'remise le'} ${formatDateShort(e.date)}`,
      e.kind !== 'draw' && e.eventName ? e.eventName : null,
    ].filter(Boolean).join(' · ')
    return (
      <li className={`purchase tg-row tg-${e.stage}`}>
        {e.kind === 'draw'
          ? <span className="thumb tg-draw" aria-hidden="true"><Icon name="dice" size={22} /></span>
          : <ItemAnchor url={e.url} className="thumb-link"><Thumb src={e.image} alt={e.title} /></ItemAnchor>}
        <div className="purchase-main">
          <div className="row wrap gap" style={{ alignItems: 'center' }}>
            {e.kind === 'draw' ? <strong>{withWho ? e.who : e.title}</strong> : <ItemAnchor url={e.url} className="title-link"><strong>{e.title}</strong></ItemAnchor>}
            {status(e)}
            {e.kind === 'group' && <span className="chip"><Icon name="users" size={12} /><span className="ell">Commun</span></span>}
          </div>
          <p className="small muted">{e.kind === 'draw' && withWho ? `${e.title} · ` : ''}{sub}</p>
          <div className="row wrap gap small">
            {a !== null && <span>{e.kind === 'group' ? `Votre part ${e.gg!.status === 'open' ? '≈ ' : ''}` : ''}{euros(a)}{e.kind === 'claim' && e.price === null ? ' (payé)' : ''}</span>}
            {e.kind === 'claim' && a === null && <span className="muted">Sans prix</span>}
          </div>
        </div>
        <div className="purchase-actions tg-actions">{actions(e, live)}</div>
      </li>
    )
  }

  const empty = current.length === 0
  return (
    <div className="narrow stack">
      <div className="row between wrap" style={{ alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Mes cadeaux à offrir</h1>
        <button className="btn btn-sm" onClick={() => setCreating(true)}><Icon name="users" size={15} /> Nouveau cadeau commun</button>
      </div>
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {empty ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="bag" size={26} /></div>
          <h2>Rien à offrir pour l'instant</h2>
          <p className="muted">Sur la liste d'un proche, cliquez « Je l'offre » : le cadeau apparaît ici, à acheter ou déjà acheté. Les personnes tirées au sort pour vous et vos cadeaux communs s'y retrouvent aussi.</p>
          <Link className="btn btn-primary" to="/listes">Voir les listes de mes proches</Link>
        </div>
      ) : <>
        <div className="tg-counts" role="list">
          {STAGES.map(s => (
            <div key={s.key} role="listitem" className={`tg-count tg-${s.key}`} title={s.hint}>
              <strong>{count(s.key)}</strong><span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="card tg-budget">
          <div><span className="small muted">Déjà dépensé</span><strong>{euros(spent) || '0 €'}</strong></div>
          <div><span className="small muted">Encore prévu</span><strong>{euros(planned) || '0 €'}</strong></div>
          <div><span className="small muted">Total</span><strong>{euros(spent + planned) || '0 €'}</strong></div>
          {noPrice > 0 && <p className="small muted tg-noprice">{noPrice} envie{noPrice > 1 ? 's' : ''} sans prix {noPrice > 1 ? 'ne sont' : 'n\'est'} pas comptée{noPrice > 1 ? 's' : ''}. Indiquez le prix payé en la marquant achetée.</p>}
        </div>

        <div className="row between wrap gap" style={{ alignItems: 'center' }}>
          {(events.length > 0) ? (
            <div className="tg-filter" role="group" aria-label="Événement">
              <button type="button" className={`chip-btn ${ev === 'all' || !evOk ? 'on' : ''}`} aria-pressed={ev === 'all' || !evOk} onClick={() => setEv('all')}>Tous</button>
              {events.map(e => <button key={e.id} type="button" className={`chip-btn ${ev === e.id ? 'on' : ''}`} aria-pressed={ev === e.id} onClick={() => setEv(e.id)}>{e.name}</button>)}
              {hasNone && <button type="button" className={`chip-btn ${ev === 'none' ? 'on' : ''}`} aria-pressed={ev === 'none'} onClick={() => setEv('none')}>Sans événement</button>}
            </div>
          ) : <span />}
          <div className="seg-unit" role="group" aria-label="Affichage">
            <button type="button" className={view === 'stage' ? 'on' : ''} aria-pressed={view === 'stage'} onClick={() => pickView('stage')}>Par étape</button>
            <button type="button" className={view === 'person' ? 'on' : ''} aria-pressed={view === 'person'} onClick={() => pickView('person')}>Par personne</button>
          </div>
        </div>

        {view === 'stage'
          ? STAGES.map(s => {
            const list = shown.filter(e => e.stage === s.key)
            if (!list.length) return null
            return (
              <section key={s.key} className="stack-sm">
                <h2 className="tg-h2">{s.label} <span className="muted">· {list.length}</span></h2>
                <ul className="purchases card">{list.map(e => <Row key={e.key} e={e} />)}</ul>
              </section>
            )
          })
          : byPerson(shown).map(p => (
            <section key={p.key} className="card tg-person">
              <div className="row gap" style={{ alignItems: 'center' }}>
                {p.color && <PersonDot name={p.who} color={p.color} size={32} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="tg-h2" style={{ margin: 0 }}>{p.who}</h2>
                  <p className="small muted" style={{ margin: 0 }}>{personLine(p.entries, amount)}</p>
                </div>
                {p.list && <Link className="btn btn-sm btn-ghost" to={`/listes/${p.list}`}>Sa liste</Link>}
              </div>
              <ul className="purchases">{p.entries.map(e => <Row key={e.key} e={e} withWho={false} />)}</ul>
            </section>
          ))}
        {shown.length === 0 && <p className="muted">Rien pour cet événement.</p>}
      </>}

      {past.length > 0 && (
        <details className="bm">
          <summary>Déjà offerts ({past.length})</summary>
          <ul className="purchases">{past.map(e => <Row key={e.key} e={e} live={false} />)}</ul>
        </details>
      )}

      {editing?.claim && (
        <ClaimDateModal itemId={editing.claim.item_id} title={editing.title} ownerId={editing.claim.ownerId} ownerName={editing.who}
          eventId={editing.eventId} revealOn={editing.date} discreet={Boolean(editing.claim.discreet)}
          price={editing.stage === 'bought' ? { paid: editing.paid, list: editing.price } : undefined} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg(`« ${editing.title} » mis à jour.`); load() }} />
      )}
      {pricing && <PriceModal title={pricing.title} onClose={() => setPricing(null)} onDone={p => setBought(pricing, true, p)} />}
      {creating && <GroupGiftForm onClose={() => { setCreating(false); load() }} />}
    </div>
  )
}

function byPerson(list: Entry[]) {
  const m = new Map<string, { key: string; who: string; color: string | null; list: string | null; entries: Entry[] }>()
  for (const e of list) {
    const p = m.get(e.whoKey) ?? { key: e.whoKey, who: e.who, color: e.whoColor, list: e.list, entries: [] }
    p.entries.push(e)
    m.set(e.whoKey, p)
  }
  const rank: Record<Stage, number> = { choose: 0, buy: 1, bought: 2 }
  return [...m.values()]
    .map(p => ({ ...p, entries: p.entries.sort((a, b) => rank[a.stage] - rank[b.stage] || a.date.localeCompare(b.date)) }))
    .sort((a, b) => a.entries[0].date.localeCompare(b.entries[0].date) || a.who.localeCompare(b.who))
}

function personLine(list: Entry[], amount: (e: Entry) => number | null): string {
  const n = (s: Stage) => list.filter(e => e.stage === s).length
  const parts = [n('choose') ? `${n('choose')} à choisir` : '', n('buy') ? `${n('buy')} à acheter` : '', n('bought') ? `${n('bought')} acheté${n('bought') > 1 ? 's' : ''}` : ''].filter(Boolean)
  const total = list.reduce((s, e) => s + (e.stage === 'choose' ? 0 : amount(e) ?? 0), 0)
  return parts.join(' · ') + (total ? ` · ${euros(total)}` : '')
}
