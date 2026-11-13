import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PersonDot } from '../components/ListPills'
import { formatAge, kidShownIn } from '../lib/kids'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { formatDateShort, todayISO } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { IconButton, Notice, Spinner } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import Icon from '../components/Icon'
import { GiftCard, GiftCollection, GiftRow, ViewBar } from '../components/GiftTable'
import GroupRow, { GroupSection } from '../components/GroupRow'
import { sortItems, useViewPrefs } from '../lib/view'
import { groupTree } from '../lib/groups'
import ClaimDateModal from '../components/ClaimDateModal'

interface CommonEvent { id: string; name: string; event_date: string }

export default function ListView() {
  const { id } = useParams()
  const { session } = useAuth()
  const confirm = useConfirm()
  const me = session!.user.id
  const [list, setList] = useState<Wishlist | null>(null)
  const [owner, setOwner] = useState('')
  const [keeper, setKeeper] = useState('')   // liste d'enfant : le parent qui la tient
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [events, setEvents] = useState<CommonEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [choice, setChoice] = useState('custom')
  const [customDate, setCustomDate] = useState(todayISO())
  const discreet = false   // option « discret » mise en pause (la base la gère toujours)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<Set<string>>(new Set())
  const [copyMsg, setCopyMsg] = useState('')
  const [editClaim, setEditClaim] = useState<Item | null>(null)
  // Après un achat : inviter à créer (ou partager) sa propre liste — moteur de bouche-à-oreille
  const [nudge, setNudge] = useState<{ title: string; empty: boolean } | null>(null)
  const [prefs, setPrefs, cycleSort] = useViewPrefs()

  const load = useCallback(async () => {
    const { data: l } = await supabase.from('wishlists').select('*').eq('id', id!).maybeSingle()
    if (!l) { setList(null); setLoading(false); return }
    const wl = l as Wishlist
    setList(wl)
    const [p, it, cl, ev, ov] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', wl.owner_id).maybeSingle(),
      supabase.from('items').select('*').eq('list_id', wl.id).order('created_at'),
      supabase.from('item_claims').select('*'),
      supabase.from('events').select('id,name,event_date,event_members(user_id)'),
      wl.child_name ? supabase.from('event_child_lists').select('event_id,list_id,shown').eq('list_id', wl.id) : Promise.resolve({ data: [] }),
    ])
    const parent = (p.data as { display_name: string } | null)?.display_name ?? 'Cette personne'
    setOwner(wl.child_name || parent)
    setKeeper(wl.child_name ? parent : '')
    setItems((it.data as Item[]) ?? [])
    const ids = new Set(((it.data as Item[]) ?? []).map(i => i.id))
    setClaims(Object.fromEntries(((cl.data as Claim[]) ?? []).filter(c => ids.has(c.item_id)).map(c => [c.item_id, c])))
    const common = ((ev.data as unknown as (CommonEvent & { event_members: { user_id: string }[] })[]) ?? [])
      .filter(e => e.event_members.some(m => m.user_id === wl.owner_id) && kidShownIn(wl, e.id, (ov.data as { event_id: string; list_id: string; shown: boolean }[]) ?? []))
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
      p_discreet: discreet,
    })
    setBusy(false)
    if (error) { setErr(errMsg(error)); load(); return }
    const claimed = items.find(i => i.id === claimingId)
    setClaimingId(null)
    load()
    // Ma propre liste est-elle vide ? (la mienne, pas celles de mes enfants)
    const { data: mine } = await supabase.from('wishlists').select('id').eq('owner_id', me).is('child_name', null).maybeSingle()
    let empty = true
    if (mine) {
      const { count } = await supabase.from('items').select('id', { count: 'exact', head: true }).eq('list_id', (mine as { id: string }).id)
      empty = !count
    }
    setNudge({ title: claimed?.title ?? '', empty })
  }

  /** Copie l'idée d'un proche dans MA liste (titre, lien, détails, prix, image) */
  const copyIdea = async (it: Item) => {
    setErr(''); setCopyMsg('')
    const { data, error } = await supabase.rpc('ensure_my_list')
    if (error) { setErr(errMsg(error)); return }
    const mine = (Array.isArray(data) ? data[0] : data) as Wishlist
    const { data: existing } = await supabase.from('items').select('id,title,url').eq('list_id', mine.id)
    const norm = (t: string) => t.trim().toLowerCase()
    const dup = ((existing as { id: string; title: string; url: string | null }[]) ?? [])
      .some(x => (it.url && x.url === it.url) || norm(x.title) === norm(it.title))
    if (dup && !(await confirm({ title: 'Déjà dans votre liste', message: 'Une envie identique ou très proche figure déjà dans votre liste. L\'ajouter quand même ?', confirmLabel: 'Ajouter quand même' }))) return
    const { error: ie } = await supabase.from('items').insert({
      list_id: mine.id, title: it.title, url: it.url, details: it.details, price: it.price, image_url: it.image_url,
    })
    if (ie) { setErr(errMsg(ie)); return }
    setCopied(prev => new Set(prev).add(it.id))
    setCopyMsg(`« ${it.title} » a été ajouté à votre liste.`)
  }

  /** Copie un groupe entier (et ses éléments) dans MA liste */
  const copyGroup = async (g: Item, ks: Item[]) => {
    setErr(''); setCopyMsg('')
    const { data, error } = await supabase.rpc('ensure_my_list')
    if (error) { setErr(errMsg(error)); return }
    const mine = (Array.isArray(data) ? data[0] : data) as Wishlist
    const { data: existing } = await supabase.from('items').select('title,is_group').eq('list_id', mine.id)
    const norm = (t: string) => t.trim().toLowerCase()
    const dup = ((existing as { title: string; is_group: boolean }[]) ?? []).some(x => x.is_group && norm(x.title) === norm(g.title))
    if (dup && !(await confirm({ title: 'Déjà dans votre liste', message: 'Un groupe du même nom figure déjà dans votre liste. L\'ajouter quand même ?', confirmLabel: 'Ajouter quand même' }))) return
    const { data: ng, error: ge } = await supabase.from('items').insert({
      list_id: mine.id, title: g.title, details: g.details, is_group: true, pick_one: g.pick_one,
    }).select('id').single()
    if (ge) { setErr(errMsg(ge)); return }
    if (ks.length) {
      const { error: ke } = await supabase.from('items').insert(ks.map(k => ({
        list_id: mine.id, parent_id: (ng as { id: string }).id, title: k.title, url: k.url, details: k.details, price: k.price, image_url: k.image_url,
      })))
      if (ke) { setErr(errMsg(ke)); return }
    }
    setCopied(prev => new Set(prev).add(g.id))
    setCopyMsg(`Le groupe « ${g.title} » (${ks.length} élément${ks.length > 1 ? 's' : ''}) a été ajouté à votre liste.`)
  }

  const unclaim = async (itemId: string) => {
    const { error } = await supabase.from('item_claims').delete().eq('item_id', itemId)
    if (error) setErr(errMsg(error)); else load()
  }

  if (loading) return <Spinner />
  if (!list) return <Notice>Liste introuvable, ou vous n'y avez pas accès. Demandez le lien de partage à la personne.</Notice>
  if (list.owner_id === me && !list.child_name) return <Navigate to="/" replace />
  const myKid = list.owner_id === me   // liste de mon enfant : je vois et marque les achats ici

  const { tops, kids } = groupTree(items)
  const gallery = prefs.view === 'gallery'
  const Row = gallery ? GiftCard : GiftRow
  const Group = gallery ? GroupSection : GroupRow
  // statut pour le tri : 0 = à offrir, 1 = pris ; un groupe vaut la part de ses éléments pris
  const statusOf = (it: Item): number => {
    if (!it.is_group) return claims[it.id] ? 1 : 0
    const ks = kids[it.id] ?? []
    return ks.length ? ks.filter(k => claims[k.id]).length / ks.length : 0
  }
  const sortedTops = sortItems(tops, prefs, g => kids[g.id] ?? [], statusOf)
  const sortedKids = (g: Item) => sortItems(kids[g.id] ?? [], prefs, () => [], statusOf)
  const row = (it: Item, group?: Item) => {
    const c = claims[it.id]
    const mine = c?.claimed_by === me
    const groupTaken = Boolean(group?.pick_one && (kids[group.id] ?? []).some(k => claims[k.id]))
    const obsolete = groupTaken && !c          // un autre élément du groupe a déjà été pris
    return (
      <Row
        key={it.id}
        item={it}
        kid={Boolean(group)}
        dim={obsolete}
        highlight={Boolean(c)}
        status={c
          ? <span className="chip chip-ok"><Icon name="check" size={13} /><span className="ell">Acheté</span></span>
          : obsolete ? <span className="chip chip-quiet">Plus nécessaire</span> : <span className="chip">À offrir</span>}
        actions={<>
          {!c && !obsolete && claimingId !== it.id && <button className="btn btn-sm" onClick={() => startClaim(it.id)}>Acheté</button>}
          {mine && <IconButton icon="pencil" label="Modifier la date de remise" onClick={() => setEditClaim(it)} />}
          {mine && <IconButton icon="x" label="Annuler mon achat" danger onClick={() => unclaim(it.id)} />}
          {!obsolete && <IconButton icon={copied.has(it.id) ? 'check' : 'copy'} label={copied.has(it.id) ? 'Ajouté à votre liste' : 'Copier cette idée dans ma liste'} onClick={() => copyIdea(it)} />}
        </>}
      >
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
              {myKid ? `Vos proches verront que c'est acheté ; remise prévue le ${revealDate ? formatDateShort(revealDate) : '…'}.` : keeper ? `${keeper} verra votre achat (pour éviter les doublons) ; remise prévue le ${revealDate ? formatDateShort(revealDate) : '…'}.` : `${owner} ne verra l'achat qu'à partir du lendemain du ${revealDate ? formatDateShort(revealDate) : '…'}.`}
              {group?.pick_one && ' Les autres options du groupe seront alors marquées « plus nécessaire ».'}
            </p>
            <div className="row">
              <button className="btn btn-primary btn-sm" disabled={busy || (choice === 'custom' && !customDate)} onClick={confirmClaim}>Confirmer</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setClaimingId(null)}>Annuler</button>
            </div>
          </div>
        )}
      </Row>
    )
  }
  const revealDate = choice === 'custom' ? customDate : events.find(e => e.id === choice)?.event_date

  return (
    <div>
      <div className="row gap" style={{ alignItems: 'center', marginBottom: '.4rem' }}>
        {keeper && <PersonDot name={owner} color={list.child_color ?? 'corail'} size={48} />}
        <div className="title-block">
          <h1 style={{ margin: 0 }}>La liste d'envies de {owner}</h1>
          {keeper && <p className="muted title-sub">{list.child_age ? `${formatAge(list.child_age)} · ` : ''}{myKid ? 'votre enfant' : `liste tenue par ${keeper}`}</p>}
        </div>
      </div>
      <p className="muted">{myKid
        ? <>Ici, vous voyez ce que vos proches ont acheté et pouvez marquer vos propres achats. Dans <Link to={`/?liste=${list.id}`}>Ma liste</Link>, les achats restent cachés : vous pouvez la remplir avec {owner} sans rien dévoiler.</>
        : keeper
        ? `${owner} ne voit pas ce site. ${keeper} voit ce qui est acheté, pour éviter les doublons.`
        : `${owner} ne voit pas ce que vous marquez comme acheté, avant le lendemain de la date de remise.`}</p>
      <Notice>{err}</Notice>
      {copyMsg && <Notice kind="ok">{copyMsg} <Link to="/">Voir ma liste</Link></Notice>}
      {nudge && (
        <div className="notice notice-ok nudge" role="status" data-testid="apres-achat">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
            <div className="stack" style={{ gap: '.35rem' }}>
              <strong>{nudge.title ? `C'est noté pour « ${nudge.title} ».` : `C'est noté.`} {myKid || keeper ? '' : `${owner} n'en saura rien.`}</strong>
              {nudge.empty
                ? <span>Et vous, qu'est-ce qui vous ferait plaisir ? Créez votre liste en une minute : vos proches éviteront eux aussi les doublons.</span>
                : <span>Votre liste est prête : partagez-la à {myKid || keeper ? 'vos proches' : owner}, pour que la surprise marche dans les deux sens.</span>}
              <div className="row" style={{ gap: '.5rem' }}>
                {nudge.empty
                  ? <Link className="btn btn-primary btn-sm" to="/?add=1">Ajouter ma première envie</Link>
                  : <Link className="btn btn-primary btn-sm" to="/">Partager ma liste</Link>}
              </div>
            </div>
            <IconButton icon="x" label="Fermer" onClick={() => setNudge(null)} />
          </div>
        </div>
      )}
      {items.length === 0 && <p className="muted">Cette liste est encore vide.</p>}
      {editClaim && claims[editClaim.id] && (
        <ClaimDateModal itemId={editClaim.id} title={editClaim.title} ownerId={list.owner_id} ownerName={owner}
          eventId={claims[editClaim.id].event_id} revealOn={claims[editClaim.id].reveal_on} discreet={claims[editClaim.id].discreet}
          onClose={() => setEditClaim(null)} onSaved={() => { setEditClaim(null); load() }} />
      )}

      {items.length > 0 && <ViewBar prefs={prefs} onChange={setPrefs} left={<span className="muted small">{tops.length} envie{tops.length > 1 ? 's' : ''}</span>} />}
      {items.length > 0 && (
        <GiftCollection view={prefs.view} prefs={prefs} onSort={cycleSort} statusLabel="Achat">
          {sortedTops.map(it => {
            if (it.is_group) {
              const ks = sortedKids(it)
              const taken = ks.filter(k => claims[k.id]).length
              return (
                <Group
                  key={it.id}
                  group={it}
                  kids={ks}
                  image={it.image_url ?? ks.find(k => k.image_url)?.image_url ?? null}
                  defaultOpen={ks.some(k => k.id === claimingId)}
                  status={it.pick_one
                    ? (taken > 0 ? <span className="chip chip-ok"><Icon name="check" size={13} /> Choix fait</span> : <span className="chip">À choisir</span>)
                    : <span className={`chip ${taken === ks.length && ks.length > 0 ? 'chip-ok' : ''}`}>{taken} sur {ks.length} achetés</span>}
                  actions={<IconButton icon={copied.has(it.id) ? 'check' : 'copy'} label={copied.has(it.id) ? 'Groupe ajouté à votre liste' : 'Copier ce groupe dans ma liste'} onClick={() => copyGroup(it, ks)} />}
                  renderKid={k => row(k, it)}
                />
              )
            }
            return row(it)
          })}
        </GiftCollection>
      )}
    </div>
  )
}
