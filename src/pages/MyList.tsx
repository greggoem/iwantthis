import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg, listShareUrl, APP_NAME } from '../lib/supabase'
import { parsePrice } from '../lib/price'
import { safeUrl } from '../lib/affiliate'
import { fetchPreview, euroPrice } from '../lib/preview'
import CropCapture, { canCaptureScreen, grabScreen } from '../components/ScreenCapture'
import { deleteItemImage, uploadItemImage } from '../lib/itemImage'
import { useAuth } from '../lib/auth'
import { formatDateShort, formatPrice } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { CopyField, Notice, Spinner } from '../components/ui'
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
import ActionMenu from '../components/ActionMenu'
import ListPills from '../components/ListPills'
import ChildForm, { type ChildDraft } from '../components/ChildForm'
import { formatAge, isKid, lastListId, rememberList } from '../lib/kids'

/** groupId : '' = liste, un identifiant = groupe existant, NEW_GROUP = groupe à créer avec newGroup / newPickOne */
interface Draft { title: string; url: string; details: string; price: string; image: string; groupId: string; newGroup: string; newPickOne: boolean; listId?: string }
/** Listes où l'on peut ajouter : la sienne et celles de ses enfants */
interface Target { id: string; name: string; color: string | null; kid: boolean }
const NEW_GROUP = '__new__'
const empty: Draft = { title: '', url: '', details: '', price: '', image: '', groupId: '', newGroup: '', newPickOne: false }

/* ---------- Formulaire cadeau (ajout et modification) ---------- */
function ItemForm({ initial, groups, onSubmit, onCancel, submitLabel, stepped = false, linkFooter, targets, initialTarget, currentListId, myName = '' }: {
  initial: Draft; groups: Item[]; onSubmit: (d: Draft) => Promise<string | null>; onCancel: () => void; submitLabel: string
  /** « Pour qui ? » : affiché quand le compte tient au moins une liste d'enfant */
  targets?: Target[]; initialTarget?: string; currentListId?: string; myName?: string
  /** ajout : d'abord le lien (collé ou partagé), puis le formulaire déjà rempli */
  stepped?: boolean; linkFooter?: React.ReactNode
}) {
  const [d, setD] = useState<Draft>(initial)
  const [target, setTarget] = useState(initialTarget ?? currentListId ?? '')
  const [otherGroups, setOtherGroups] = useState<Item[]>([])
  useEffect(() => {
    if (!targets || !target || target === currentListId) return
    supabase.from('items').select('*').eq('list_id', target).eq('is_group', true).order('title')
      .then(({ data }) => setOtherGroups((data as Item[]) ?? []))
  }, [target, currentListId, targets])
  const tgt = targets?.find(t => t.id === target)
  const shownGroups = !targets || target === currentListId ? groups : otherGroups
  const pickTarget = (id: string) => { setTarget(id); setD(prev => ({ ...prev, groupId: prev.groupId === NEW_GROUP ? NEW_GROUP : '' })) }
  // lien reçu sans image (bouton Partager d'une appli) : on lit la fiche avant d'afficher le formulaire
  const needsRead = stepped && Boolean(safeUrl(initial.url)) && !initial.image
  const [step, setStep] = useState<'link' | 'form'>(stepped && (needsRead || !initial.title.trim()) ? 'link' : 'form')
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
  const lastUrl = useRef(needsRead ? '' : initial.url.trim())
  const preferRead = useRef(needsRead)
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
    if (!p.found) { setHint(`Lecture automatique impossible (${p.reason ?? 'site non lisible'}). Complétez les champs à la main, et ajoutez une image si besoin.`); return }
    const price = euroPrice(p)
    const fromShare = preferRead.current
    setD(prev => ({
      ...prev,
      image: prev.image || (p.image ?? ''),   // une image choisie à la main n'est pas écrasée
      // texte venu du bouton Partager d'une appli : le titre de la fiche produit est en général plus précis
      title: fromShare && p.title ? p.title : prev.title.trim() ? prev.title : (p.title ?? ''),
      price: prev.price === '' && price !== undefined ? String(price) : prev.price,
    }))
    preferRead.current = false
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
    if (safeUrl(text)) { e.preventDefault(); setD(prev => ({ ...prev, url: text })); if (step === 'link') next(text); else readLink(text) }
  }
  // étape 1 → 2 : on lit la fiche produit puis on montre le formulaire prérempli
  const next = async (raw: string = d.url) => {
    if (raw.trim() && !safeUrl(raw)) { setErr('Ce lien ne semble pas valide (il doit commencer par http:// ou https://).'); return }
    setErr('')
    if (raw.trim()) await readLink(raw)
    setStep('form')
  }
  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      const link = text.match(/https?:\/\/[^\s<>"']+/i)?.[0]
      if (!link) { setErr('Le presse-papiers ne contient pas de lien. Copiez d\'abord le lien du produit.'); return }
      setD(prev => ({ ...prev, url: link })); next(link)
    } catch { setErr('Collez le lien dans le champ (appui long → Coller).') }
  }
  useEffect(() => { if (needsRead) next(initial.url) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

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
    const msg = await onSubmit(targets ? { ...d, listId: target } : d)
    setBusy(false)
    if (msg) { setErr(msg); return }
    // enregistré : on supprime les images envoyées mais plus utilisées (remplacées ou retirées)
    for (const u of [...uploaded.current, initial.image]) if (u && u !== d.image) await deleteItemImage(u)
  }

  if (step === 'link') return (
    <form className="stack add-step" onSubmit={e => { e.preventDefault(); next() }}>
      <Notice>{err}</Notice>
      {reading ? (
        <div className="add-reading" role="status" aria-live="polite">
          <div className="sk-row">
            <div className="sk-img"><span className="sk-gift"><Icon name="gift" size={30} /></span></div>
            <div className="sk-lines"><i className="sk-line" style={{ width: '90%' }} /><i className="sk-line" style={{ width: '65%' }} /><i className="sk-line sk-price" /></div>
          </div>
          <p className="small muted add-reading-txt">
            Lecture de la fiche produit{(() => { try { return ` sur ${new URL(d.url).hostname.replace(/^www\./, '')}` } catch { return '' } })()}
            <span className="dots"><b>.</b><b>.</b><b>.</b></span>
          </p>
        </div>
      ) : (
        <>
          <label><span>Lien du produit</span>
            <input value={d.url} onChange={set('url')} onPaste={onPasteUrl} placeholder="https://…" inputMode="url" type="url" autoFocus />
          </label>
          <p className="small muted" style={{ margin: 0 }}>Le nom, l'image et le prix sont récupérés automatiquement. Vous pourrez les modifier ensuite.</p>
          <div className="add-step-btns">
            {'clipboard' in navigator && 'readText' in navigator.clipboard && (
              <button type="button" className="btn" onClick={pasteFromClipboard}><Icon name="copy" size={16} /> Coller le lien</button>
            )}
            <button className="btn btn-primary" disabled={!safeUrl(d.url)}>Continuer</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm add-nolink" onClick={() => setStep('form')}>Pas de lien ? Remplir à la main</button>
          {linkFooter}
        </>
      )}
    </form>
  )

  const urlField = (
    <>
      <label><span>Lien du produit <span className="muted">· image, prix et titre récupérés automatiquement</span></span>
        <input value={d.url} onChange={set('url')} onPaste={onPasteUrl} onBlur={() => readLink()} placeholder="https://…" inputMode="url" autoFocus={!stepped && !initial.url} />
      </label>
      {reading && <p className="small muted">Lecture de la fiche produit…</p>}
    </>
  )
  return (
    <form className={`stack${stepped ? ' fill-in' : ''}`} onSubmit={submit} onPaste={onPasteForm}>
      {shot && <CropCapture source={shot} onCancel={() => setShot(null)} onDone={f => { setShot(null); pickImage(f) }} />}
      <Notice>{err}</Notice>
      {targets && targets.length > 1 && (
        <fieldset className="kid-colors for-who">
          <legend>Pour qui ?</legend>
          <ListPills lists={targets.map(t => ({ id: t.id, owner_id: '', title: '', share_token: '', child_name: t.kid ? t.name : null, child_color: t.color }))}
            current={target} myName={myName} onPick={pickTarget} label="Pour qui ?" />
        </fieldset>
      )}
      {!stepped && urlField}
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
          <span className="small muted imghint">ou collez une image (Ctrl+V)</span>
        </div>
        <div className="stack grow">
          <label>Cadeau
            <input required maxLength={200} value={d.title} onChange={set('title')} placeholder="Ex. Pull en laine mérinos" autoFocus={stepped && !d.title.trim() && !d.url.trim()} />
          </label>
          <label><span>Détails <span className="muted">· taille, couleur, modèle…</span></span>
            <textarea maxLength={1000} rows={2} value={d.details} onChange={set('details')} placeholder="Ex. Taille L, bleu marine" />
          </label>
          <label><span>Prix <span className="muted">· en €, facultatif</span></span>
            <input type="number" min="0" step="0.01" value={d.price} onChange={set('price')} />
          </label>
        </div>
      </div>
      {stepped && urlField}
      <label>Où l'ajouter ?
        <select value={d.groupId} onChange={e => setD(prev => ({ ...prev, groupId: e.target.value }))}>
          <option value="">{tgt?.kid ? `Liste de ${tgt.name}` : 'Ma liste'} (sans groupe)</option>
          {shownGroups.map(g => <option key={g.id} value={g.id}>Groupe : {g.title}</option>)}
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
        <button className="btn btn-primary" disabled={busy || reading || sending}>{targets && targets.length > 1 ? (tgt?.kid ? `Ajouter pour ${tgt.name}` : 'Ajouter à ma liste') : submitLabel}</button>
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
  const { profile } = useAuth()
  const kid = list.child_name
  const who = kid || profile?.display_name
  const shareTitle = who ? `La liste d'envies de ${who}` : list.title
  const url = listShareUrl(list.share_token)
  return (
    <ShareSheet
      title={kid ? `Partager la liste de ${kid}` : 'Partager ma liste'}
      intro={kid
        ? `Vos proches se connectent, voient les envies de ${kid} et indiquent ce qu'ils achètent. Vous voyez ce qui est acheté, pour éviter les doublons.`
        : 'Vos proches se connectent, voient vos envies et indiquent ce qu\'ils achètent. Vous ne verrez pas ce qui est acheté avant le lendemain de la date de remise.'}
      message={listMessage(shareTitle, url, APP_NAME)}
      subject={shareTitle}
      heading={shareTitle} imageUrl={null}
      fileName="ma-liste-de-cadeaux"
      onClose={onClose}
    >
      <CopyField value={url} share={false} />
    </ShareSheet>
  )
}

/* ---------- Page ---------- */
type ModalState = null | { kind: 'share' } | { kind: 'add' } | { kind: 'edit'; item: Item }
  | { kind: 'group' } | { kind: 'editGroup'; item: Item } | { kind: 'kids'; item: Item }
  | { kind: 'child'; list: Wishlist | null }

export default function MyList() {
  const [params, setParams] = useSearchParams()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [list, setList] = useState<Wishlist | null>(null)
  const [lists, setLists] = useState<Wishlist[]>([])   // la sienne d'abord, puis celles des enfants
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [opened, setOpened] = useState(false)   // cadeaux reçus découverts pendant cette visite
  const [modal, setModal] = useState<ModalState>(null)
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

  const wanted = params.get('liste')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('ensure_my_list')
    if (error) { setErr(errMsg(error)); setLoading(false); return }
    const mine = (Array.isArray(data) ? data[0] : data) as Wishlist
    const { data: k } = await supabase.from('wishlists').select('*').eq('owner_id', mine.owner_id).not('child_name', 'is', null).order('created_at')
    const all = [mine, ...((k as Wishlist[]) ?? [])]
    setLists(all)
    const l = all.find(x => x.id === wanted) ?? mine
    setList(l)
    const [it, cl] = await Promise.all([
      supabase.from('items').select('*').eq('list_id', l.id).order('created_at'),
      supabase.from('item_claims').select('*'),   // le serveur ne renvoie que les achats déjà « révélés »
    ])
    setItems((it.data as Item[]) ?? [])
    setClaims(Object.fromEntries(((cl.data as Claim[]) ?? []).map(c => [c.item_id, c])))
    setLoading(false)
  }, [wanted])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (prefill && !loading) setModal({ kind: 'add' }) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loading, params.get('add')])

  const kidList = isKid(list)
  const pick = (id: string) => setParams(id === lists[0]?.id ? {} : { liste: id })
  // cadeaux reçus : « nouveaux » tant que la personne ne les a pas découverts, puis archivés
  // (liste d'enfant : le parent voit les achats au fil de l'eau, rien n'est archivé)
  const seen = (id: string) => !kidList && Boolean(claims[id]?.owner_seen_at)
  const archivedIds = new Set<string>()
  for (const g of items.filter(i => i.is_group)) {
    const ks = items.filter(k => k.parent_id === g.id)
    if (g.pick_one && ks.some(k => seen(k.id))) { archivedIds.add(g.id); ks.forEach(k => archivedIds.add(k.id)); continue }
    ks.filter(k => seen(k.id)).forEach(k => archivedIds.add(k.id))
    if (ks.length > 0 && ks.every(k => archivedIds.has(k.id))) archivedIds.add(g.id)
  }
  for (const i of items) if (!i.is_group && !i.parent_id && seen(i.id)) archivedIds.add(i.id)
  const activeItems = items.filter(i => !archivedIds.has(i.id))
  const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title, 'fr')
  const fresh = kidList ? [] : items.filter(i => !i.is_group && claims[i.id] && !claims[i.id].owner_seen_at).sort(byTitle)
  const archive = items.filter(i => !i.is_group && seen(i.id)).sort((a, b) => (claims[b.id].reveal_on).localeCompare(claims[a.id].reveal_on) || byTitle(a, b))
  const discover = async () => {
    setOpened(true)
    const { error } = await supabase.rpc('mark_gifts_seen')
    if (error) setErr(errMsg(error))
  }

  const { tops, kids } = groupTree(activeItems)
  const nGifts = activeItems.filter(i => !i.is_group).length
  const groupList = activeItems.filter(i => i.is_group)
  const gallery = prefs.view === 'gallery'
  const Row = gallery ? GiftCard : GiftRow
  const Group = gallery ? GroupSection : GroupRow
  // statut pour le tri : 0 = surprise, 1 = déjà offert (révélé) ; un groupe vaut la part de ses éléments offerts
  const statusOf = (it: Item): number => {
    if (kidList) return 0   // liste d'enfant : le tri ne doit rien trahir des achats
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

  const closeModal = () => { setModal(null); if (params.get('add')) setParams(wanted ? { liste: wanted } : {}, { replace: true }) }

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
      list_id: d.listId ?? list!.id, title: d.newGroup.trim(), is_group: true, pick_one: d.newPickOne,
    }).select('id').single()
    return error ? { error: errMsg(error) } : { parent: (data as { id: string }).id }
  }

  const add = async (d: Draft) => {
    const r = await resolveParent(d)
    if ('error' in r) return r.error
    const dest = d.listId ?? list!.id
    const { error } = await supabase.from('items').insert({ ...toRow(d), list_id: dest, parent_id: r.parent })
    if (error) return errMsg(error)
    rememberList(dest)
    const other = lists.find(l => l.id === dest)
    setModal(null)
    if (dest !== list!.id && other) {
      setParams(dest === lists[0]?.id ? {} : { liste: dest }, { replace: true })   // on montre la liste où l'envie est arrivée
    } else {
      if (params.get('add')) setParams(wanted ? { liste: wanted } : {}, { replace: true })
      await load()
    }
    if (lists.length > 1) setMsg(other?.child_name ? `Ajouté à la liste de ${other.child_name}.` : 'Ajouté à votre liste.')
    return null
  }

  // listes d'enfants
  const saveChild = async (c: ChildDraft, target: Wishlist | null) => {
    if (target) {
      const { error } = await supabase.from('wishlists').update({ child_name: c.name, child_age: c.age || null, child_color: c.color, in_events: c.inEvents }).eq('id', target.id)
      if (error) return errMsg(error)
      setModal(null); await load(); return null
    }
    const { data, error } = await supabase.rpc('create_child_list', { p_name: c.name, p_age: c.age || null, p_color: c.color, p_in_events: c.inEvents })
    if (error) return errMsg(error)
    const nl = (Array.isArray(data) ? data[0] : data) as Wishlist
    setModal(null)
    setParams({ liste: nl.id })
    setMsg(`La liste de ${c.name} est prête : ajoutez ses envies.`)
    return null
  }
  const deleteChild = async (target: Wishlist) => {
    if (!(await confirm({ title: `Supprimer la liste de ${target.child_name} ?`, message: 'Toutes ses envies seront supprimées. Vos proches ne la verront plus.', confirmLabel: 'Supprimer', danger: true }))) return
    const { error } = await supabase.rpc('delete_child_list', { p_list: target.id })
    if (error) { setErr(errMsg(error)); return }
    setModal(null); setParams({}); setMsg(`La liste de ${target.child_name} a été supprimée.`)
  }
  const nextColor = () => {
    const used = new Set(lists.map(l => l.child_color))
    return ['corail', 'bleu', 'vert', 'jaune', 'violet'].find(c => !used.has(c)) ?? 'corail'
  }
  const targets: Target[] | undefined = lists.length > 1
    ? lists.map(l => ({ id: l.id, name: l.child_name || 'Moi', color: l.child_color ?? null, kid: !!l.child_name }))
    : undefined
  // raccourci, extension, partage : la dernière liste utilisée sur cet appareil ; bouton « Ajouter » : la liste affichée
  const addTarget = prefill && lists.some(l => l.id === lastListId()) ? lastListId()! : list?.id
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
  // Image ajoutée à la main (envoi, capture, collage) : stockée chez nous, jamais remplacée par l'actualisation
  const isOwnImage = (u: string | null) => !!u && u.includes('/storage/v1/object/public/item-images/')
  /** keepImage : ne remplace pas une image existante (seulement si l'envie n'en a pas) */
  const refreshOne = async (it: Item, quiet = false, keepImage = false): Promise<boolean> => {
    if (!it.url) return false
    const p = await fetchPreview(it.url)
    const better = p.url && p.url !== it.url && safeUrl(p.url) ? p.url : undefined
    if (better) await supabase.from('items').update({ url: better }).eq('id', it.id)
    if (!p.found) { if (!quiet) setErr(`« ${it.title} » : ${p.reason ?? 'lecture impossible'}`); return !!better }
    const price = euroPrice(p)
    const patch: { image_url?: string; price?: number } = {}
    if (p.image && p.image !== it.image_url && !isOwnImage(it.image_url) && !(keepImage && it.image_url)) patch.image_url = p.image
    if (price !== undefined) patch.price = price
    if (Object.keys(patch).length === 0) { if (!quiet) setMsg(`« ${it.title} » : rien de nouveau (prix inchangé ou absent, image conservée).`); return !!better }
    const { error } = await supabase.from('items').update(patch).eq('id', it.id)
    if (error) { setErr(errMsg(error)); return false }
    if (!quiet) setMsg(`« ${it.title} » mis à jour${price !== undefined ? ` (${formatPrice(price)})` : ''}.`)
    return true
  }
  const refresh = async (it: Item) => { setErr(''); setMsg(''); setBusyId(it.id); await refreshOne(it); setBusyId(null); load() }
  const withUrl = activeItems.filter(i => !i.is_group && i.url)
  const [progress, setProgress] = useState(0)
  /** Relit tous les liens de la liste (3 à la fois) : images et prix remis à jour */
  const refreshAll = async () => {
    setErr(''); setMsg(''); setBulk(true); setProgress(0)
    let done = 0, next = 0
    const worker = async () => {
      while (next < withUrl.length) {
        const it = withUrl[next++]
        await refreshOne(it, true, true)
        setProgress(++done)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, withUrl.length) }, worker))
    setBulk(false)
    load()
  }

  const toggleFav = async (it: Item) => {
    const v = !it.is_favorite
    setItems(xs => xs.map(x => x.id === it.id ? { ...x, is_favorite: v } : x))
    const { error } = await supabase.from('items').update({ is_favorite: v }).eq('id', it.id)
    if (error) { setItems(xs => xs.map(x => x.id === it.id ? { ...x, is_favorite: !v } : x)); setErr(errMsg(error)) }
  }
  const itemRow = (it: Item, kid: boolean) => (
    <Row
      key={it.id}
      item={it}
      kid={kid}
      highlight={!kidList && Boolean(claims[it.id])}
      status={kidList ? null : claims[it.id]
        ? <span className="chip chip-ok" title={`${kidList ? 'Acheté' : 'Offert'} par ${claims[it.id].claimed_by_name} · remise le ${formatDateShort(claims[it.id].reveal_on)}`}><Icon name="gift" size={13} /><span className="ell">{kidList ? 'Acheté' : 'Offert'} par {claims[it.id].claimed_by_name}</span></span>
        : kidList ? null : <span className="chip chip-quiet"><Icon name="lock" size={12} /> Surprise</span>}
      actions={<ActionMenu label={`Actions pour « ${it.title} »`} actions={[
        { icon: 'star', label: it.is_favorite ? 'Retirer des favoris' : 'Marquer comme favori', active: !!it.is_favorite, onClick: () => toggleFav(it) },
        { icon: 'pencil', label: 'Modifier', onClick: () => setModal({ kind: 'edit', item: it }) },
        !!it.url && { icon: 'refresh', label: 'Actualiser image et prix', disabled: busyId === it.id, onClick: () => refresh(it) },
        { icon: 'trash', label: 'Supprimer', danger: true, onClick: () => remove(it) },
      ]} />}
    />
  )

  if (loading) return <Spinner />

  return (
    <div>
      {lists.length > 1 && <ListPills lists={lists} current={list?.id ?? ''} myName={profile?.display_name ?? ''} onPick={pick} onAddKid={() => setModal({ kind: 'child', list: null })} />}
      <div className="page-head">
        <div className="title-block">
          <h1 className="title-input" style={{ margin: 0 }}>{kidList ? `La liste d'envies de ${list!.child_name}` : 'Ma liste d\'envies'}</h1>
          {kidList && <p className="muted title-sub">Liste d'enfant · gérée par vous{list!.child_age ? ` · ${formatAge(list!.child_age)}` : ''} · achats cachés ici, visibles dans <Link to={`/listes/${list!.id}`}>Listes de mes proches</Link></p>}
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setModal({ kind: 'share' })}><Icon name="share" size={17} /> <span>Partager</span></button>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Icon name="plus" size={18} /> <span>Ajouter</span></button>
          <ActionMenu label="Plus d'options pour la liste" actions={[
            { icon: 'plus', label: 'Nouveau groupe', onClick: () => setModal({ kind: 'group' }) },
            { icon: 'plus', label: 'Ajouter une liste d\'enfant', onClick: () => setModal({ kind: 'child', list: null }) },
            kidList && { icon: 'pencil', label: `Modifier la liste de ${list!.child_name}`, onClick: () => setModal({ kind: 'child', list }) },
            kidList && { icon: 'trash', label: `Supprimer la liste de ${list!.child_name}`, danger: true, onClick: () => deleteChild(list!) },
          ]} />
        </div>
      </div>

      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {fresh.length > 0 && (
        <section className="gifts-banner" aria-live="polite">
          <div className="gifts-banner-head">
            <span className="gb-ico"><Icon name="gift" size={22} /></span>
            <div className="gb-text">
              <strong>{fresh.length === 1 ? 'Un cadeau vous attend !' : `${fresh.length} cadeaux vous attendent !`}</strong>
              <span className="muted small">Ils étaient une surprise jusqu'à hier : découvrez qui vous a offert quoi.</span>
            </div>
            {!opened && <button className="btn btn-primary" onClick={discover}>Découvrir</button>}
          </div>
          {opened && (
            <>
              <ul className="gifts-list">
                {fresh.map(it => (
                  <li key={it.id}>
                    <Thumb src={it.image_url} alt={it.title} />
                    <span className="gl-title">{it.title}</span>
                    <span className="chip chip-ok"><Icon name="gift" size={13} /><span className="ell">{claims[it.id].claimed_by_name}</span></span>
                  </li>
                ))}
              </ul>
              <p className="small muted">À votre prochaine visite, ces cadeaux seront rangés dans vos archives.</p>
            </>
          )}
        </section>
      )}

      {items.length > 0 && (
        <ViewBar prefs={prefs} onChange={setPrefs} left={<>
          <span className="muted small">{tops.length} envie{tops.length > 1 ? 's' : ''}{tops.some(t => t.is_group) ? ` · ${nGifts} cadeau${nGifts > 1 ? 'x' : ''} au total` : ''}</span>
          {withUrl.length > 0 && (
            <button className="btn btn-sm" disabled={bulk} onClick={refreshAll} title="Relire tous les liens : met à jour les prix et ajoute les images manquantes (vos images restent)">
              <Icon name="refresh" size={15} /> {bulk ? `Actualisation… ${progress}/${withUrl.length}` : 'Tout actualiser'}
            </button>
          )}
        </>} />
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="gift" size={26} /></div>
          <h2>{kidList ? `La liste de ${list!.child_name} est vide` : 'Votre liste est vide'}</h2>
          <p className="muted">Collez le lien d'un produit : l'image et le prix sont récupérés pour vous.</p>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Icon name="plus" size={18} /> Ajouter une envie</button>
          <ol className="steps">
            <li>Ajoutez vos envies</li>
            <li>Partagez le lien avec vos proches</li>
            <li>Créez un événement pour inviter la famille et organiser un tirage au sort</li>
          </ol>
        </div>
      ) : activeItems.length === 0 ? (
        <p className="muted gifts-allgiven">Toutes vos envies ont été offertes 🎉 Ajoutez-en de nouvelles quand vous voulez.</p>
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
                  status={kidList || ks.length === 0 ? null : given > 0
                    ? <span className="chip chip-ok"><Icon name="gift" size={13} /> {given} {kidList ? 'acheté' : 'offert'}{given > 1 ? 's' : ''}</span>
                    : kidList ? null : <span className="chip chip-quiet"><Icon name="lock" size={12} /> Surprise</span>}
                  actions={<ActionMenu label={`Actions pour le groupe « ${it.title} »`} actions={[
                    { icon: 'plus', label: 'Ajouter des éléments', onClick: () => setModal({ kind: 'kids', item: it }) },
                    { icon: 'pencil', label: 'Modifier le groupe', onClick: () => setModal({ kind: 'editGroup', item: it }) },
                    { icon: 'trash', label: 'Supprimer le groupe', danger: true, onClick: () => remove(it) },
                  ]} />}
                  renderKid={k => itemRow(k, true)}
                />
              )
            }
            return itemRow(it, false)
          })}
        </GiftCollection>
      )}

      {archive.length > 0 && (
        <details className="gifts-archive">
          <summary><Icon name="gift" size={16} /> Cadeaux reçus · archives ({archive.length})</summary>
          <ul className="gifts-list">
            {archive.map(it => (
              <li key={it.id}>
                <Thumb src={it.image_url} alt={it.title} />
                <span className="gl-title">{it.title}</span>
                <span className="muted small">offert par {claims[it.id].claimed_by_name} · {formatDateShort(claims[it.id].reveal_on)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {modal?.kind === 'share' && list && <ShareModal list={list} onClose={closeModal} />}
      {modal?.kind === 'add' && (
        <Modal title="Ajouter une envie" onClose={closeModal}>
          <ItemForm key={prefill ? params.toString() : 'new'} groups={groupList} initial={prefill ?? empty} submitLabel={kidList ? `Ajouter pour ${list!.child_name}` : 'Ajouter à ma liste'} onCancel={closeModal} onSubmit={add}
            stepped linkFooter={<BookmarkletBox />} targets={targets} initialTarget={addTarget} currentListId={list?.id} myName={profile?.display_name ?? ''} />
        </Modal>
      )}
      {modal?.kind === 'child' && (
        <Modal title={modal.list ? `Modifier la liste de ${modal.list.child_name}` : 'Ajouter un enfant'} onClose={closeModal}>
          <ChildForm
            initial={modal.list
              ? { name: modal.list.child_name ?? '', age: modal.list.child_age ?? '', color: modal.list.child_color ?? 'corail', inEvents: modal.list.in_events !== false }
              : { name: '', age: '', color: nextColor(), inEvents: true }}
            submitLabel={n => modal.list ? 'Enregistrer' : `Créer la liste de ${n}`}
            onCancel={closeModal} onSubmit={c => saveChild(c, modal.list)}
            onDelete={modal.list ? () => deleteChild(modal.list!) : undefined} />
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
