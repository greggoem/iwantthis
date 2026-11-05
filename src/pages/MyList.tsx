import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, errMsg, listShareUrl, APP_NAME } from '../lib/supabase'
import { parsePrice } from '../lib/price'
import { safeUrl } from '../lib/affiliate'
import { fetchPreview, euroPrice } from '../lib/preview'
import CropCapture, { canCaptureScreen, grabScreen } from '../components/ScreenCapture'
import { deleteItemImage, uploadItemImage } from '../lib/itemImage'
import { useAuth } from '../lib/auth'
import { formatDateShort, formatPrice, todayISO } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { CopyField, IconButton, Notice, Spinner } from '../components/ui'
import { GiftCard, GiftCollection, GiftRow, Thumb, ViewBar } from '../components/GiftTable'
import GroupRow, { GroupSection } from '../components/GroupRow'
import { sortItems, useViewPrefs } from '../lib/view'
import { cleanTitle, groupTree, nameFromUrl, parseLinks } from '../lib/groups'
import Icon from '../components/Icon'
import BookmarkletBox from '../components/BookmarkletBox'
import Modal from '../components/Modal'
import ShareSheet from '../components/ShareSheet'
import { listMessage } from '../lib/shareCard'
import { useConfirm } from '../components/Confirm'

/** groupId : '' = liste, un identifiant = groupe existant, NEW_GROUP = groupe à créer avec newGroup / newPickOne */
interface Draft { title: string; url: string; details: string; price: string; image: string; groupId: string; newGroup: string; newPickOne: boolean }
const NEW_GROUP = '__new__'
const empty: Draft = { title: '', url: '', details: '', price: '', image: '', groupId: '', newGroup: '', newPickOne: false }

/* ---------- Formulaire cadeau (ajout et modification) ---------- */
function ItemForm({ initial, groups, onSubmit, onCancel, submitLabel }: {
  initial: Draft; groups: Item[]; onSubmit: (d: Draft) => Promise<string | null>; onCancel: () => void; submitLabel: string
}) {
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [sending, setSending] = useState(false)
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null)
  const [menu, setMenu] = useState(false)
  const { session } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const uploaded = useRef<string[]>([])   // images envoyées pendant cette saisie (nettoyées si abandon / remplacées)
  const lastUrl = useRef(initial.url.trim())
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(prev => ({ ...prev, [k]: e.target.value }))

  // Dès que le lien est saisi : lecture de la fiche produit (image, prix, titre)
  const readLink = async (raw: string = d.url) => {
    const u = safeUrl(raw)
    if (!u || raw.trim() === lastUrl.current) return
    lastUrl.current = raw.trim()
    setReading(true); setHint('')
    const p = await fetchPreview(u.toString())
    setReading(false)
    if (p.url && safeUrl(p.url)) {   // lien court (amzn.eu…) remplacé par le lien complet
      lastUrl.current = p.url
      setD(prev => ({ ...prev, url: p.url! }))
    }
    if (!p.found) { setHint(`Lecture automatique impossible (${p.reason ?? 'site non lisible'}). Saisissez le prix à la main, ou utilisez le raccourci ci-dessous.`); return }
    const price = euroPrice(p)
    setD(prev => ({
      ...prev,
      image: prev.image || (p.image ?? ''),   // une image choisie à la main n'est pas écrasée
      title: prev.title.trim() ? prev.title : (p.title ?? ''),
      price: prev.price === '' && price !== undefined ? String(price) : prev.price,
    }))
    const bits = [p.image ? 'image' : null, price !== undefined ? `prix ${formatPrice(price)}` : null].filter(Boolean)
    setHint(bits.length ? `Trouvé sur ${p.site} : ${bits.join(' et ')}. Modifiable.` : `Rien de plus trouvé sur ${p.site} : renseignez le prix si vous le connaissez.`)
  }

  // lecture automatique : tout de suite au collage, ou peu après l'arrêt de la saisie
  useEffect(() => {
    const raw = d.url
    if (!safeUrl(raw) || raw.trim() === lastUrl.current) return
    const t = window.setTimeout(() => { readLink(raw) }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.url])
  const onPasteUrl = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim()
    if (safeUrl(text)) { e.preventDefault(); setD(prev => ({ ...prev, url: text })); readLink(text) }
  }

  const pickImage = async (file: File | undefined) => {
    if (!file || !session) return
    setErr(''); setSending(true)
    const r = await uploadItemImage(session.user.id, file)
    setSending(false)
    if (fileRef.current) fileRef.current.value = ''
    if ('error' in r) { setErr(r.error); return }
    uploaded.current.push(r.url)
    setD(prev => ({ ...prev, image: r.url }))
    setHint('Image ajoutée.')
  }
  // capture d'écran : Ctrl+V / Cmd+V n'importe où dans le formulaire, ou glisser-déposer une image
  const imageFrom = (dt: DataTransfer | null): File | undefined =>
    Array.from(dt?.files ?? []).find(f => f.type.startsWith('image/')) ?? Array.from(dt?.items ?? []).find(i => i.type.startsWith('image/'))?.getAsFile() ?? undefined
  const capture = async () => { setErr(''); const c = await grabScreen(); if (c) setShot(c) }
  const onPasteForm = (e: React.ClipboardEvent) => {
    const f = imageFrom(e.clipboardData)
    if (f) { e.preventDefault(); pickImage(f) }
  }
  const onDropImage = (e: React.DragEvent) => {
    const f = imageFrom(e.dataTransfer)
    if (f) { e.preventDefault(); pickImage(f) }
  }
  const cancel = async () => {
    for (const u of uploaded.current) if (u !== initial.image) await deleteItemImage(u)   // rien ne traîne si on abandonne
    onCancel()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (d.url.trim() && !safeUrl(d.url)) { setErr('Ce lien ne semble pas valide (il doit commencer par http:// ou https://).'); return }
    if (d.groupId === NEW_GROUP && !d.newGroup.trim()) { setErr('Donnez un nom au nouveau groupe.'); return }
    setBusy(true)
    const msg = await onSubmit(d)
    setBusy(false)
    if (msg) { setErr(msg); return }
    // enregistré : on supprime les images envoyées mais plus utilisées (remplacées ou retirées)
    for (const u of [...uploaded.current, initial.image]) if (u && u !== d.image) await deleteItemImage(u)
  }

  return (
    <form className="stack" onSubmit={submit} onPaste={onPasteForm}>
      {shot && <CropCapture source={shot} onCancel={() => setShot(null)} onDone={f => { setShot(null); pickImage(f) }} />}
      <Notice>{err}</Notice>
      <label><span>Lien du produit <span className="muted">· image, prix et titre récupérés automatiquement</span></span>
        <input value={d.url} onChange={set('url')} onPaste={onPasteUrl} onBlur={() => readLink()} placeholder="https://…" inputMode="url" autoFocus={!initial.url} />
      </label>
      {reading && <p className="small muted">Lecture de la fiche produit…</p>}
      {hint && <p className="small muted">{hint}</p>}
      <div className="formrow">
        <div className="formthumb">
          <div className="imgbox" onDragOver={e => e.preventDefault()} onDrop={onDropImage} title="Glissez une image ici">
            {d.image ? <Thumb src={d.image} alt="Aperçu" large /> : <div className="imgph"><Icon name="image" size={26} /><span>Aucune image</span></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickImage(e.target.files?.[0])} />
          <div className="imgmenu-wrap">
            <button type="button" className="btn btn-sm" disabled={sending} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
              <Icon name="image" size={15} /> {sending ? 'Envoi…' : d.image ? 'Modifier' : 'Ajouter une image'} <Icon name="chevron" size={14} />
            </button>
            {menu && (
              <>
                <div className="imgmenu-back" onClick={() => setMenu(false)} />
                <div className="imgmenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); fileRef.current?.click() }}>Choisir une photo ou un fichier</button>
                  {canCaptureScreen() && <button type="button" role="menuitem" onClick={() => { setMenu(false); capture() }}>Capturer l'écran</button>}
                  {d.image && <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); setD(prev => ({ ...prev, image: '' })) }}>Retirer l'image</button>}
                </div>
              </>
            )}
          </div>
          <span className="small muted imghint">ou collez une capture (Ctrl+V)</span>
        </div>
        <div className="stack grow">
          <label>Cadeau
            <input required maxLength={200} value={d.title} onChange={set('title')} placeholder="Ex. Pull en laine mérinos" />
          </label>
          <label><span>Détails <span className="muted">· taille, couleur, modèle…</span></span>
            <textarea maxLength={1000} rows={2} value={d.details} onChange={set('details')} placeholder="Ex. Taille L, bleu marine" />
          </label>
          <label><span>Prix <span className="muted">· en €, facultatif</span></span>
            <input type="number" min="0" step="0.01" value={d.price} onChange={set('price')} />
          </label>
        </div>
      </div>
      <label>Où l'ajouter ?
        <select value={d.groupId} onChange={e => setD(prev => ({ ...prev, groupId: e.target.value }))}>
          <option value="">Ma liste (sans groupe)</option>
          {groups.map(g => <option key={g.id} value={g.id}>Groupe : {g.title}</option>)}
          <option value={NEW_GROUP}>＋ Nouveau groupe…</option>
        </select>
      </label>
      {d.groupId === NEW_GROUP && (
        <div className="stack newgroup">
          <label>Nom du nouveau groupe
            <input maxLength={200} value={d.newGroup} onChange={e => setD(prev => ({ ...prev, newGroup: e.target.value }))} placeholder="Ex. Livres d'architecture" autoFocus />
          </label>
          <ModeChoice pickOne={d.newPickOne} onChange={v => setD(prev => ({ ...prev, newPickOne: v }))} />
        </div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={cancel}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || reading || sending}>{submitLabel}</button>
      </div>
    </form>
  )
}

/* ---------- Groupe : création / modification ---------- */
interface GroupDraft { title: string; pickOne: boolean; details: string }

function ModeChoice({ pickOne, onChange }: { pickOne: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mode-choice" role="radiogroup" aria-label="Type de groupe">
      <label className={`mode-card ${!pickOne ? 'on' : ''}`}>
        <input type="radio" name="mode" checked={!pickOne} onChange={() => onChange(false)} />
        <strong>Plusieurs possibles</strong>
        <span>Une collection : chaque élément peut être offert séparément.</span>
      </label>
      <label className={`mode-card ${pickOne ? 'on' : ''}`}>
        <input type="radio" name="mode" checked={pickOne} onChange={() => onChange(true)} />
        <strong>Un seul à choisir</strong>
        <span>Plusieurs options pour la même envie : une fois l'une offerte, les autres sont grisées.</span>
      </label>
    </div>
  )
}

function LinksField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = parseLinks(value).length
  return (
    <label><span>Liens <span className="muted">· un par ligne{n > 0 ? ` · ${n} lien${n > 1 ? 's' : ''} reconnu${n > 1 ? 's' : ''}` : ''}</span></span>
      <textarea rows={6} value={value} onChange={e => onChange(e.target.value)} spellCheck={false}
        placeholder={'https://www.amazon.com.be/…\nBeaubourg — https://www.fnac.com/…'} />
      <span className="small muted">Le nom de chaque objet, son image et son prix sont lus sur la page du produit. Pour imposer un nom : « Nom — lien ».</span>
    </label>
  )
}

function GroupForm({ initial, withLinks, submitLabel, onCancel, onSubmit }: {
  initial: GroupDraft; withLinks: boolean; submitLabel: string; onCancel: () => void
  onSubmit: (g: GroupDraft, links: string, progress: (done: number, total: number) => void) => Promise<string | null>
}) {
  const [g, setG] = useState(initial)
  const [links, setLinks] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<[number, number] | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    setBusy(true)
    const msg = await onSubmit(g, links, (d, t) => setProg([d, t]))
    setBusy(false)
    if (msg) setErr(msg)
  }
  return (
    <form className="stack" onSubmit={submit}>
      <Notice>{err}</Notice>
      <label>Nom du groupe
        <input required maxLength={200} value={g.title} autoFocus onChange={e => setG({ ...g, title: e.target.value })} placeholder="Ex. Livres d'architecture" />
      </label>
      <ModeChoice pickOne={g.pickOne} onChange={v => setG({ ...g, pickOne: v })} />
      <label><span>Détails <span className="muted">· facultatif</span></span>
        <textarea maxLength={1000} rows={2} value={g.details} onChange={e => setG({ ...g, details: e.target.value })} placeholder="Ex. Neufs ou d'occasion, en français ou en anglais" />
      </label>
      {withLinks && <LinksField value={links} onChange={setLinks} />}
      {prog && (
        <div className="stack">
          <div className="progress"><div style={{ width: `${(prog[0] / Math.max(1, prog[1])) * 100}%` }} /></div>
          <p className="small muted">Lecture des liens : {prog[0]} sur {prog[1]}…</p>
        </div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Un instant…' : submitLabel}</button>
      </div>
    </form>
  )
}

function KidsForm({ group, onCancel, onSubmit }: {
  group: Item; onCancel: () => void
  onSubmit: (links: string, progress: (done: number, total: number) => void) => Promise<string | null>
}) {
  const [links, setLinks] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<[number, number] | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (!parseLinks(links).length) { setErr('Collez au moins un lien commençant par http:// ou https://.'); return }
    setBusy(true)
    const msg = await onSubmit(links, (d, t) => setProg([d, t]))
    setBusy(false)
    if (msg) setErr(msg)
  }
  return (
    <form className="stack" onSubmit={submit}>
      <Notice>{err}</Notice>
      <p className="muted">Les éléments seront ajoutés au groupe « {group.title} ».</p>
      <LinksField value={links} onChange={setLinks} />
      {prog && (
        <div className="stack">
          <div className="progress"><div style={{ width: `${(prog[0] / Math.max(1, prog[1])) * 100}%` }} /></div>
          <p className="small muted">Lecture des liens : {prog[0]} sur {prog[1]}…</p>
        </div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Un instant…' : 'Ajouter au groupe'}</button>
      </div>
    </form>
  )
}

/* ---------- Fenêtre « Partager ma liste » ---------- */
function ShareModal({ list, onClose }: { list: Wishlist; onClose: () => void }) {
  const url = listShareUrl(list.share_token)
  // l'image du prochain événement qui en a une est reprise sur la carte de partage
  const [ev, setEv] = useState<{ name: string; event_date: string; image_url: string } | null | undefined>(undefined)
  useEffect(() => {
    supabase.from('events').select('name,event_date,image_url').not('image_url', 'is', null).gte('event_date', todayISO()).order('event_date').limit(1)
      .then(({ data }) => setEv(((data as { name: string; event_date: string; image_url: string }[]) ?? [])[0] ?? null))
  }, [])
  if (ev === undefined) return <Modal title="Partager ma liste" onClose={onClose}><Spinner /></Modal>
  return (
    <ShareSheet
      title="Partager ma liste"
      intro="Vos proches se connectent, voient vos envies et indiquent ce qu'ils achètent. Vous ne verrez pas ce qui est acheté avant la date de remise."
      message={listMessage(list.title, url, APP_NAME)}
      subject={list.title}
      heading={list.title} sub={ev ? `${ev.name} · ${formatDateShort(ev.event_date)}` : undefined} imageUrl={ev?.image_url}
      fileName="ma-liste-de-cadeaux"
      onClose={onClose}
    >
      <CopyField value={url} />
    </ShareSheet>
  )
}

/* ---------- Page ---------- */
type ModalState = null | { kind: 'share' } | { kind: 'add' } | { kind: 'edit'; item: Item }
  | { kind: 'group' } | { kind: 'editGroup'; item: Item } | { kind: 'kids'; item: Item }

export default function MyList() {
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()
  const [list, setList] = useState<Wishlist | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [modal, setModal] = useState<ModalState>(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [prefs, setPrefs, cycleSort] = useViewPrefs()

  // données envoyées par le raccourci navigateur (#/?add=1&u=…&t=…&i=…&p=…)
  const prefill: Draft | null = params.get('add') === '1' ? (() => {
    const u = safeUrl(params.get('u')), img = safeUrl(params.get('i'))
    const cur = (params.get('c') ?? '').toUpperCase()
    const price = !cur || cur === 'EUR' ? parsePrice(params.get('p')) : undefined
    return {
      title: (params.get('t') ?? '').slice(0, 200), url: u ? u.toString() : '', details: '',
      price: price !== undefined ? String(price) : '', image: img ? img.toString() : '',
      groupId: '', newGroup: '', newPickOne: false,
    }
  })() : null

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('ensure_my_list')
    if (error) { setErr(errMsg(error)); setLoading(false); return }
    const l = (Array.isArray(data) ? data[0] : data) as Wishlist
    setList(l); setTitle(l.title)
    const [it, cl] = await Promise.all([
      supabase.from('items').select('*').eq('list_id', l.id).order('created_at'),
      supabase.from('item_claims').select('*'),   // le serveur ne renvoie que les achats déjà « révélés »
    ])
    setItems((it.data as Item[]) ?? [])
    setClaims(Object.fromEntries(((cl.data as Claim[]) ?? []).map(c => [c.item_id, c])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (prefill && !loading) setModal({ kind: 'add' }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loading, params.get('add')])

  const { tops, kids } = groupTree(items)
  const groupList = items.filter(i => i.is_group)
  const gallery = prefs.view === 'gallery'
  const Row = gallery ? GiftCard : GiftRow
  const Group = gallery ? GroupSection : GroupRow
  // statut pour le tri : 0 = surprise, 1 = déjà offert (révélé) ; un groupe vaut la part de ses éléments offerts
  const statusOf = (it: Item): number => {
    if (!it.is_group) return claims[it.id] ? 1 : 0
    const ks = kids[it.id] ?? []
    return ks.length ? ks.filter(k => claims[k.id]).length / ks.length : 0
  }
  const sortedTops = sortItems(tops, prefs, g => kids[g.id] ?? [], statusOf)
  const sortedKids = (g: Item) => sortItems(kids[g.id] ?? [], prefs, () => [], statusOf)

  /** Lit chaque lien (3 à la fois) et crée un élément nommé d'après l'objet */
  const importLinks = async (parent: Item, text: string, progress: (done: number, total: number) => void): Promise<string | null> => {
    const links = parseLinks(text)
    if (!links.length) return null
    let done = 0, next = 0
    const rows: ({ title: string; url: string; price: number | null; image_url: string | null } | null)[] = new Array(links.length).fill(null)
    progress(0, links.length)
    const worker = async () => {
      while (next < links.length) {
        const i = next++
        const l = links[i]
        const u = safeUrl(l.url)
        if (u) {
          const p = await fetchPreview(u.toString())
          const price = p.found ? euroPrice(p) : undefined
          const title = l.label || (p.found && p.title ? cleanTitle(p.title) : '') || nameFromUrl(l.url)
          rows[i] = { title: title.slice(0, 200), url: p.url && safeUrl(p.url) ? p.url : u.toString(), price: price ?? null, image_url: p.found && p.image && safeUrl(p.image) ? p.image : null }
        }
        progress(++done, links.length)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, links.length) }, worker))
    const toInsert = rows.filter((r): r is NonNullable<typeof r> => r !== null).map(r => ({ ...r, list_id: parent.list_id, parent_id: parent.id }))
    if (!toInsert.length) return 'Aucun lien valide trouvé.'
    const { error } = await supabase.from('items').insert(toInsert)
    return error ? errMsg(error) : null
  }

  const addGroup = async (g: GroupDraft, links: string, progress: (d: number, t: number) => void) => {
    const { data, error } = await supabase.from('items').insert({
      list_id: list!.id, title: g.title.trim(), details: g.details.trim() || null, is_group: true, pick_one: g.pickOne,
    }).select('*').single()
    if (error) return errMsg(error)
    const msg = await importLinks(data as Item, links, progress)
    closeModal(); await load()
    if (msg) setErr(`Groupe créé, mais : ${msg}`)
    return null
  }
  const editGroup = async (it: Item, g: GroupDraft) => {
    const { error } = await supabase.from('items').update({ title: g.title.trim(), details: g.details.trim() || null, pick_one: g.pickOne }).eq('id', it.id)
    if (error) return errMsg(error)
    closeModal(); await load(); return null
  }
  const addKids = async (it: Item, links: string, progress: (d: number, t: number) => void) => {
    const msg = await importLinks(it, links, progress)
    if (msg) return msg
    closeModal(); await load(); return null
  }

  const closeModal = () => { setModal(null); if (params.get('add')) setParams({}, { replace: true }) }

  const toRow = (d: Draft) => ({
    title: d.title.trim(),
    url: d.url.trim() ? safeUrl(d.url)!.toString() : null,
    details: d.details.trim() || null,
    price: d.price === '' ? null : Number(d.price),
    image_url: d.image && safeUrl(d.image) ? d.image : null,
  })

  /** Renvoie le groupe choisi (créé au besoin) : null = liste, sinon son identifiant ; ou un message d'erreur */
  const resolveParent = async (d: Draft): Promise<{ parent: string | null } | { error: string }> => {
    if (d.groupId !== NEW_GROUP) return { parent: d.groupId || null }
    const { data, error } = await supabase.from('items').insert({
      list_id: list!.id, title: d.newGroup.trim(), is_group: true, pick_one: d.newPickOne,
    }).select('id').single()
    return error ? { error: errMsg(error) } : { parent: (data as { id: string }).id }
  }

  const add = async (d: Draft) => {
    const r = await resolveParent(d)
    if ('error' in r) return r.error
    const { error } = await supabase.from('items').insert({ ...toRow(d), list_id: list!.id, parent_id: r.parent })
    if (error) return errMsg(error)
    closeModal(); await load(); return null
  }
  const update = async (id: string, d: Draft) => {
    const r = await resolveParent(d)
    if ('error' in r) return r.error
    const { error } = await supabase.from('items').update({ ...toRow(d), parent_id: r.parent }).eq('id', id)
    if (error) return errMsg(error)
    closeModal(); await load(); return null
  }
  const remove = async (it: Item) => {
    const n = kids[it.id]?.length ?? 0
    const message = it.is_group
      ? `Le groupe « ${it.title} » sera retiré de votre liste${n ? `, avec ses ${n} élément${n > 1 ? 's' : ''}` : ''}.`
      : `« ${it.title} » sera retiré de votre liste.`
    if (!(await confirm({ title: it.is_group ? 'Supprimer ce groupe ?' : 'Supprimer cette envie ?', message, confirmLabel: 'Supprimer', danger: true }))) return
    const { error } = await supabase.from('items').delete().eq('id', it.id)
    if (error) setErr(errMsg(error)); else load()
  }

  /** Relit le lien d'un cadeau : met à jour l'image et le prix si le site les donne */
  const refreshOne = async (it: Item, quiet = false): Promise<boolean> => {
    if (!it.url) return false
    const p = await fetchPreview(it.url)
    const better = p.url && p.url !== it.url && safeUrl(p.url) ? p.url : undefined
    if (better) await supabase.from('items').update({ url: better }).eq('id', it.id)
    if (!p.found) { if (!quiet) setErr(`« ${it.title} » : ${p.reason ?? 'lecture impossible'}`); return !!better }
    const price = euroPrice(p)
    const patch: { image_url?: string; price?: number } = {}
    if (p.image) patch.image_url = p.image
    if (price !== undefined) patch.price = price
    if (Object.keys(patch).length === 0) { if (!quiet) setMsg(`« ${it.title} » : le site ne donne ni image ni prix.`); return !!better }
    const { error } = await supabase.from('items').update(patch).eq('id', it.id)
    if (error) { setErr(errMsg(error)); return false }
    if (!quiet) setMsg(`« ${it.title} » mis à jour${price !== undefined ? ` (${formatPrice(price)})` : ''}.`)
    return true
  }
  const refresh = async (it: Item) => { setErr(''); setMsg(''); setBusyId(it.id); await refreshOne(it); setBusyId(null); load() }
  const withUrl = items.filter(i => !i.is_group && i.url)
  const [progress, setProgress] = useState(0)
  /** Relit tous les liens de la liste (3 à la fois) : images et prix remis à jour */
  const refreshAll = async () => {
    setErr(''); setMsg(''); setBulk(true); setProgress(0)
    let done = 0, next = 0
    const worker = async () => {
      while (next < withUrl.length) {
        const it = withUrl[next++]
        await refreshOne(it, true)
        setProgress(++done)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, withUrl.length) }, worker))
    setBulk(false)
    load()
  }

  const saveTitle = async () => {
    if (!list || title.trim() === list.title || !title.trim()) return
    const { error } = await supabase.from('wishlists').update({ title: title.trim() }).eq('id', list.id)
    if (error) setErr(errMsg(error)); else setList({ ...list, title: title.trim() })
  }

  const itemRow = (it: Item, kid: boolean) => (
    <Row
      key={it.id}
      item={it}
      kid={kid}
      highlight={Boolean(claims[it.id])}
      status={claims[it.id]
        ? <span className="chip chip-ok" title={`Offert par ${claims[it.id].claimed_by_name} · remise le ${formatDateShort(claims[it.id].reveal_on)}`}><Icon name="gift" size={13} /><span className="ell">Offert par {claims[it.id].claimed_by_name}</span></span>
        : <span className="chip chip-quiet"><Icon name="lock" size={12} /> Surprise</span>}
      actions={<>
        <IconButton icon="pencil" label="Modifier" onClick={() => setModal({ kind: 'edit', item: it })} />
        {it.url && <IconButton icon="refresh" label="Actualiser image et prix" disabled={busyId === it.id} onClick={() => refresh(it)} />}
        <IconButton icon="trash" label="Supprimer" danger onClick={() => remove(it)} />
      </>}
    />
  )

  if (loading) return <Spinner />

  return (
    <div>
      <div className="page-head">
        <input className="title-input" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Titre de la liste" />
        <div className="page-actions">
          <button className="btn" onClick={() => setModal({ kind: 'share' })}><Icon name="share" size={17} /> <span>Partager</span></button>
          <button className="btn" onClick={() => setModal({ kind: 'group' })}><Icon name="plus" size={17} /> <span>Groupe</span></button>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Icon name="plus" size={18} /> <span>Ajouter</span></button>
        </div>
      </div>

      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {items.length > 0 && (
        <ViewBar prefs={prefs} onChange={setPrefs} left={<>
          <span className="muted small">{tops.length} envie{tops.length > 1 ? 's' : ''}{tops.some(t => t.is_group) ? ` · ${items.filter(i => !i.is_group).length} cadeaux au total` : ''}</span>
          {withUrl.length > 0 && (
            <button className="btn btn-sm" disabled={bulk} onClick={refreshAll} title="Relire tous les liens : met à jour les images et les prix">
              <Icon name="refresh" size={15} /> {bulk ? `Actualisation… ${progress}/${withUrl.length}` : 'Tout actualiser'}
            </button>
          )}
        </>} />
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="gift" size={26} /></div>
          <h2>Votre liste est vide</h2>
          <p className="muted">Collez le lien d'un produit : l'image et le prix sont récupérés pour vous.</p>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Icon name="plus" size={18} /> Ajouter une envie</button>
          <ol className="steps">
            <li>Ajoutez vos envies</li>
            <li>Partagez le lien avec vos proches</li>
            <li>Créez un événement pour inviter la famille et organiser un tirage au sort</li>
          </ol>
        </div>
      ) : (
        <GiftCollection view={prefs.view} prefs={prefs} onSort={cycleSort} statusLabel="Statut">
          {sortedTops.map(it => {
            if (it.is_group) {
              const ks = sortedKids(it)
              const given = ks.filter(k => claims[k.id]).length
              return (
                <Group
                  key={it.id}
                  group={it}
                  kids={ks}
                  image={it.image_url ?? ks.find(k => k.image_url)?.image_url ?? null}
                  status={given > 0
                    ? <span className="chip chip-ok"><Icon name="gift" size={13} /> {given} offert{given > 1 ? 's' : ''}</span>
                    : <span className="chip chip-quiet"><Icon name="lock" size={12} /> Surprise</span>}
                  actions={<>
                    <IconButton icon="plus" label="Ajouter des éléments" onClick={() => setModal({ kind: 'kids', item: it })} />
                    <IconButton icon="pencil" label="Modifier le groupe" onClick={() => setModal({ kind: 'editGroup', item: it })} />
                    <IconButton icon="trash" label="Supprimer le groupe" danger onClick={() => remove(it)} />
                  </>}
                  renderKid={k => itemRow(k, true)}
                />
              )
            }
            return itemRow(it, false)
          })}
        </GiftCollection>
      )}

      {modal?.kind === 'share' && list && <ShareModal list={list} onClose={closeModal} />}
      {modal?.kind === 'add' && (
        <Modal title="Ajouter une envie" onClose={closeModal}>
          <ItemForm key={prefill ? params.toString() : 'new'} groups={groupList} initial={prefill ?? empty} submitLabel="Ajouter à ma liste" onCancel={closeModal} onSubmit={add} />
          <BookmarkletBox />
        </Modal>
      )}
      {modal?.kind === 'group' && (
        <Modal title="Nouveau groupe" onClose={closeModal}>
          <p className="muted">Pour une même envie avec plusieurs liens : une collection de livres, plusieurs modèles au choix…</p>
          <GroupForm initial={{ title: '', pickOne: false, details: '' }} withLinks submitLabel="Créer le groupe" onCancel={closeModal} onSubmit={addGroup} />
        </Modal>
      )}
      {modal?.kind === 'editGroup' && (
        <Modal title="Modifier le groupe" onClose={closeModal}>
          <GroupForm initial={{ title: modal.item.title, pickOne: modal.item.pick_one, details: modal.item.details ?? '' }} withLinks={false}
            submitLabel="Enregistrer" onCancel={closeModal} onSubmit={g => editGroup(modal.item, g)} />
        </Modal>
      )}
      {modal?.kind === 'kids' && (
        <Modal title="Ajouter des éléments" onClose={closeModal}>
          <KidsForm group={modal.item} onCancel={closeModal} onSubmit={(l, pr) => addKids(modal.item, l, pr)} />
        </Modal>
      )}
      {modal?.kind === 'edit' && (
        <Modal title="Modifier l'envie" onClose={closeModal}>
          <ItemForm
            groups={groupList}
            initial={{ title: modal.item.title, url: modal.item.url ?? '', details: modal.item.details ?? '', price: modal.item.price?.toString() ?? '', image: modal.item.image_url ?? '', groupId: modal.item.parent_id ?? '', newGroup: '', newPickOne: false }}
            submitLabel="Enregistrer" onCancel={closeModal} onSubmit={d => update(modal.item.id, d)}
          />
        </Modal>
      )}
    </div>
  )
}
