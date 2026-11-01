import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, errMsg, listShareUrl, siteUrl, APP_NAME } from '../lib/supabase'
import { bookmarkletHref } from '../lib/bookmarklet'
import { parsePrice } from '../lib/price'
import { safeUrl } from '../lib/affiliate'
import { fetchPreview, euroPrice } from '../lib/preview'
import { formatDateShort, formatPrice } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { CopyField, IconButton, Notice, Spinner } from '../components/ui'
import { GiftRow, GiftTable, Thumb } from '../components/GiftTable'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { useConfirm } from '../components/Confirm'

interface Draft { title: string; url: string; details: string; price: string; image: string }
const empty: Draft = { title: '', url: '', details: '', price: '', image: '' }

/* ---------- Formulaire cadeau (ajout et modification) ---------- */
function ItemForm({ initial, onSubmit, onCancel, submitLabel }: {
  initial: Draft; onSubmit: (d: Draft) => Promise<string | null>; onCancel: () => void; submitLabel: string
}) {
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const lastUrl = useRef(initial.url.trim())
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(prev => ({ ...prev, [k]: e.target.value }))

  // Dès que le lien est saisi : lecture de la fiche produit (image, prix, titre)
  const readLink = async () => {
    const u = safeUrl(d.url)
    if (!u || d.url.trim() === lastUrl.current) return
    lastUrl.current = d.url.trim()
    setReading(true); setHint('')
    const p = await fetchPreview(u.toString())
    setReading(false)
    if (!p.found) { setHint(`Lecture automatique impossible (${p.reason ?? 'site non lisible'}). Saisissez le prix à la main, ou utilisez le raccourci ci-dessous.`); return }
    const price = euroPrice(p)
    setD(prev => ({
      ...prev,
      image: p.image ?? '',
      title: prev.title.trim() ? prev.title : (p.title ?? ''),
      price: prev.price === '' && price !== undefined ? String(price) : prev.price,
    }))
    const bits = [p.image ? 'image' : null, price !== undefined ? `prix ${formatPrice(price)}` : null].filter(Boolean)
    setHint(bits.length ? `Trouvé sur ${p.site} : ${bits.join(' et ')}. Modifiable.` : `Rien de plus trouvé sur ${p.site} : renseignez le prix si vous le connaissez.`)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (d.url.trim() && !safeUrl(d.url)) { setErr('Ce lien ne semble pas valide (il doit commencer par http:// ou https://).'); return }
    setBusy(true)
    const msg = await onSubmit(d)
    setBusy(false)
    if (msg) setErr(msg)
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Notice>{err}</Notice>
      <label><span>Lien du produit <span className="muted">· image et prix récupérés automatiquement</span></span>
        <input value={d.url} onChange={set('url')} onBlur={readLink} placeholder="https://…" inputMode="url" autoFocus={!initial.url} />
      </label>
      {reading && <p className="small muted">Lecture de la fiche produit…</p>}
      {hint && <p className="small muted">{hint}</p>}
      <div className="formrow">
        {d.image && (
          <div className="formthumb">
            <Thumb src={d.image} alt="Aperçu" large />
            <button type="button" className="link small" onClick={() => setD(prev => ({ ...prev, image: '' }))}>Retirer</button>
          </div>
        )}
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
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || reading}>{submitLabel}</button>
      </div>
    </form>
  )
}

/* ---------- Raccourci navigateur (magasins qui bloquent la lecture automatique) ---------- */
function BookmarkletBox() {
  const ref = useRef<HTMLAnchorElement>(null)
  // le href « javascript: » est posé après coup (React refuse ce type de lien dans le JSX)
  useEffect(() => { ref.current?.setAttribute('href', bookmarkletHref(siteUrl())) }, [])
  return (
    <details className="bm">
      <summary>Le magasin ne donne ni image ni prix ?</summary>
      <p className="small">
        Certains magasins (Amazon, Zalando, Fnac…) interdisent la lecture automatique. Ce raccourci passe par <strong>votre</strong> navigateur :
        sur ordinateur, <strong>glissez le bouton ci-dessous dans votre barre de favoris</strong> (Ctrl+Maj+B pour l'afficher).
        Sur la page d'un produit, cliquez sur ce favori : le cadeau arrive ici, déjà rempli.
      </p>
      <a ref={ref} className="btn btn-sm" draggable onClick={e => e.preventDefault()}><Icon name="plus" size={15} /> Ajouter à {APP_NAME}</a>
      <p className="small muted">Sur téléphone : collez le lien du produit et saisissez le prix à la main si besoin.</p>
    </details>
  )
}

/* ---------- Fenêtre « Partager ma liste » ---------- */
function ShareModal({ list, onClose }: { list: Wishlist; onClose: () => void }) {
  const url = listShareUrl(list.share_token)
  const msg = `Voici ma liste de cadeaux : ${url}`
  return (
    <Modal title="Partager ma liste" onClose={onClose}>
      <div className="stack">
        <p className="muted">Envoyez ce lien à vos proches : ils se connectent, voient vos envies et indiquent ce qu'ils achètent.
          Vous ne verrez pas ce qui est acheté avant la date de remise du cadeau.</p>
        <CopyField value={url} />
        <div className="row wrap gap">
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={16} /> WhatsApp</a>
          <a className="btn" href={`mailto:?subject=${encodeURIComponent('Ma liste de cadeaux')}&body=${encodeURIComponent(msg)}`}><Icon name="mail" size={16} /> E-mail</a>
        </div>
      </div>
    </Modal>
  )
}

/* ---------- Page ---------- */
type ModalState = null | { kind: 'share' } | { kind: 'add' } | { kind: 'edit'; item: Item }

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

  // données envoyées par le raccourci navigateur (#/?add=1&u=…&t=…&i=…&p=…)
  const prefill: Draft | null = params.get('add') === '1' ? (() => {
    const u = safeUrl(params.get('u')), img = safeUrl(params.get('i'))
    const cur = (params.get('c') ?? '').toUpperCase()
    const price = !cur || cur === 'EUR' ? parsePrice(params.get('p')) : undefined
    return {
      title: (params.get('t') ?? '').slice(0, 200), url: u ? u.toString() : '', details: '',
      price: price !== undefined ? String(price) : '', image: img ? img.toString() : '',
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

  const closeModal = () => { setModal(null); if (params.get('add')) setParams({}, { replace: true }) }

  const toRow = (d: Draft) => ({
    title: d.title.trim(),
    url: d.url.trim() ? safeUrl(d.url)!.toString() : null,
    details: d.details.trim() || null,
    price: d.price === '' ? null : Number(d.price),
    image_url: d.image && safeUrl(d.image) ? d.image : null,
  })

  const add = async (d: Draft) => {
    const { error } = await supabase.from('items').insert({ ...toRow(d), list_id: list!.id })
    if (error) return errMsg(error)
    closeModal(); await load(); return null
  }
  const update = async (id: string, d: Draft) => {
    const { error } = await supabase.from('items').update(toRow(d)).eq('id', id)
    if (error) return errMsg(error)
    closeModal(); await load(); return null
  }
  const remove = async (it: Item) => {
    if (!(await confirm({ title: 'Supprimer cette envie ?', message: `« ${it.title} » sera retiré de votre liste.`, confirmLabel: 'Supprimer', danger: true }))) return
    const { error } = await supabase.from('items').delete().eq('id', it.id)
    if (error) setErr(errMsg(error)); else load()
  }

  /** Relit le lien d'un cadeau : met à jour l'image et le prix si le site les donne */
  const refreshOne = async (it: Item, quiet = false): Promise<boolean> => {
    if (!it.url) return false
    const p = await fetchPreview(it.url)
    if (!p.found) { if (!quiet) setErr(`« ${it.title} » : ${p.reason ?? 'lecture impossible'}`); return false }
    const price = euroPrice(p)
    const patch: { image_url?: string; price?: number } = {}
    if (p.image) patch.image_url = p.image
    if (price !== undefined) patch.price = price
    if (Object.keys(patch).length === 0) { if (!quiet) setMsg(`« ${it.title} » : le site ne donne ni image ni prix.`); return false }
    const { error } = await supabase.from('items').update(patch).eq('id', it.id)
    if (error) { setErr(errMsg(error)); return false }
    if (!quiet) setMsg(`« ${it.title} » mis à jour${price !== undefined ? ` (${formatPrice(price)})` : ''}.`)
    return true
  }
  const refresh = async (it: Item) => { setErr(''); setMsg(''); setBusyId(it.id); await refreshOne(it); setBusyId(null); load() }
  const missing = items.filter(i => i.url && !i.image_url)
  const refreshMissing = async () => {
    setErr(''); setMsg(''); setBulk(true)
    let ok = 0
    for (const it of missing) if (await refreshOne(it, true)) ok++
    setBulk(false)
    setMsg(`${ok} cadeau(x) complété(s) sur ${missing.length}. Les autres magasins ne permettent pas la lecture automatique.`)
    load()
  }

  const saveTitle = async () => {
    if (!list || title.trim() === list.title || !title.trim()) return
    const { error } = await supabase.from('wishlists').update({ title: title.trim() }).eq('id', list.id)
    if (error) setErr(errMsg(error)); else setList({ ...list, title: title.trim() })
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="page-head">
        <input className="title-input" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Titre de la liste" />
        <div className="page-actions">
          <button className="btn" onClick={() => setModal({ kind: 'share' })}><Icon name="share" size={17} /> <span>Partager</span></button>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Icon name="plus" size={18} /> <span>Ajouter</span></button>
        </div>
      </div>

      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {items.length > 0 && (
        <div className="row between wrap gap sub-head">
          <span className="muted small">{items.length} envie{items.length > 1 ? 's' : ''}</span>
          {missing.length > 0 && (
            <button className="btn btn-sm" disabled={bulk} onClick={refreshMissing}>
              <Icon name="refresh" size={15} /> {bulk ? 'Lecture des liens…' : `Récupérer images et prix (${missing.length})`}
            </button>
          )}
        </div>
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
        <GiftTable statusLabel="Statut">
          {items.map(it => (
            <GiftRow
              key={it.id}
              item={it}
              highlight={Boolean(claims[it.id])}
              status={claims[it.id]
                ? <span className="chip chip-ok" title={`Remise le ${formatDateShort(claims[it.id].reveal_on)}`}><Icon name="gift" size={13} /> Offert par {claims[it.id].claimed_by_name}</span>
                : <span className="chip chip-quiet"><Icon name="lock" size={12} /> Surprise</span>}
              actions={<>
                <IconButton icon="pencil" label="Modifier" onClick={() => setModal({ kind: 'edit', item: it })} />
                {it.url && <IconButton icon="refresh" label="Actualiser image et prix" disabled={busyId === it.id} onClick={() => refresh(it)} />}
                <IconButton icon="trash" label="Supprimer" danger onClick={() => remove(it)} />
              </>}
            />
          ))}
        </GiftTable>
      )}

      {modal?.kind === 'share' && list && <ShareModal list={list} onClose={closeModal} />}
      {modal?.kind === 'add' && (
        <Modal title="Ajouter une envie" onClose={closeModal}>
          <ItemForm key={prefill ? params.toString() : 'new'} initial={prefill ?? empty} submitLabel="Ajouter à ma liste" onCancel={closeModal} onSubmit={add} />
          <BookmarkletBox />
        </Modal>
      )}
      {modal?.kind === 'edit' && (
        <Modal title="Modifier l'envie" onClose={closeModal}>
          <ItemForm
            initial={{ title: modal.item.title, url: modal.item.url ?? '', details: modal.item.details ?? '', price: modal.item.price?.toString() ?? '', image: modal.item.image_url ?? '' }}
            submitLabel="Enregistrer" onCancel={closeModal} onSubmit={d => update(modal.item.id, d)}
          />
        </Modal>
      )}
    </div>
  )
}
