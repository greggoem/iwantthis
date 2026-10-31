import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, errMsg, listShareUrl, siteUrl, APP_NAME } from '../lib/supabase'
import { bookmarkletHref } from '../lib/bookmarklet'
import { parsePrice } from '../lib/price'
import { safeUrl } from '../lib/affiliate'
import { fetchPreview, euroPrice } from '../lib/preview'
import { formatDateShort, formatPrice } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { CopyField, Notice, Spinner } from '../components/ui'
import { GiftRow, GiftTable, Thumb } from '../components/GiftTable'

interface Draft { title: string; url: string; details: string; price: string; image: string }
const empty: Draft = { title: '', url: '', details: '', price: '', image: '' }

function ItemForm({ initial, onSubmit, onCancel, submitLabel }: {
  initial: Draft; onSubmit: (d: Draft) => Promise<string | null>; onCancel?: () => void; submitLabel: string
}) {
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const lastUrl = useRef(initial.url.trim())
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(prev => ({ ...prev, [k]: e.target.value }))

  // Dès que le lien est saisi : on va lire la fiche produit (image, prix, titre)
  const readLink = async () => {
    const u = safeUrl(d.url)
    if (!u || d.url.trim() === lastUrl.current) return
    lastUrl.current = d.url.trim()
    setReading(true); setHint('')
    const p = await fetchPreview(u.toString())
    setReading(false)
    if (!p.found) { setHint(`Lecture automatique impossible (${p.reason ?? 'site non lisible'}). Saisissez le prix à la main, ou utilisez le raccourci en bas de page.`); return }
    const price = euroPrice(p)
    setD(prev => ({
      ...prev,
      image: p.image ?? '',
      title: prev.title.trim() ? prev.title : (p.title ?? ''),
      price: prev.price === '' && price !== undefined ? String(price) : prev.price,
    }))
    const bits = [p.image ? 'image' : null, price !== undefined ? `prix ${formatPrice(price)}` : null].filter(Boolean)
    setHint(bits.length
      ? `✓ Trouvé sur ${p.site} : ${bits.join(' et ')}. Vérifiez, c'est modifiable.`
      : `Rien de plus trouvé sur ${p.site} : renseignez le prix si vous le connaissez.`)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (d.url.trim() && !safeUrl(d.url)) { setErr('Ce lien ne semble pas valide (il doit commencer par http:// ou https://).'); return }
    setBusy(true)
    const msg = await onSubmit(d)
    setBusy(false)
    if (msg) setErr(msg)
    else if (!onCancel) { setD(empty); setHint(''); lastUrl.current = '' }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <Notice>{err}</Notice>
      <label><span>Lien vers le site <span className="muted">(l'image et le prix sont récupérés automatiquement)</span></span>
        <input value={d.url} onChange={set('url')} onBlur={readLink} placeholder="https://…" inputMode="url" />
      </label>
      {reading && <p className="small muted">Lecture de la fiche produit…</p>}
      {hint && <p className="small muted">{hint}</p>}
      <div className="formrow">
        {d.image && (
          <div className="formthumb">
            <Thumb src={d.image} alt="Aperçu" />
            <button type="button" className="link small" onClick={() => setD(prev => ({ ...prev, image: '' }))}>Retirer l'image</button>
          </div>
        )}
        <div className="stack grow">
          <label>Cadeau
            <input required maxLength={200} value={d.title} onChange={set('title')} placeholder="Ex. Pull en laine mérinos" />
          </label>
          <label><span>Détails <span className="muted">(taille, couleur, modèle…)</span></span>
            <textarea maxLength={1000} rows={2} value={d.details} onChange={set('details')} placeholder="Ex. Taille L, bleu marine" />
          </label>
          <label><span>Prix <span className="muted">(en €, facultatif)</span></span>
            <input type="number" min="0" step="0.01" value={d.price} onChange={set('price')} />
          </label>
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={busy || reading}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>}
      </div>
    </form>
  )
}

function BookmarkletBox() {
  const ref = useRef<HTMLAnchorElement>(null)
  // le href « javascript: » est posé après coup (React refuse ce type de lien dans le JSX)
  useEffect(() => { ref.current?.setAttribute('href', bookmarkletHref(siteUrl())) }, [])
  return (
    <details className="card bm">
      <summary>Le magasin ne donne ni image ni prix ? (Amazon, Zalando, Fnac…)</summary>
      <p className="small">
        Certains magasins interdisent la lecture automatique. Ce raccourci passe par <strong>votre</strong> navigateur, donc il fonctionne partout :
        sur ordinateur, <strong>glissez le bouton ci-dessous dans votre barre de favoris</strong> (affichez-la avec Ctrl+Maj+B).
        Ensuite, sur la page d'un produit, cliquez sur ce favori : le cadeau arrive ici, déjà rempli (titre, image, prix).
      </p>
      <a ref={ref} className="btn btn-primary" draggable onClick={e => e.preventDefault()}>🎁 Ajouter à {APP_NAME}</a>
      <p className="small muted">Sur téléphone : collez le lien du produit ci-dessus et saisissez le prix à la main si besoin.</p>
    </details>
  )
}

export default function MyList() {
  const [params, setParams] = useSearchParams()
  const prefill: Draft | null = params.get('add') === '1' ? (() => {
    const u = safeUrl(params.get('u')), img = safeUrl(params.get('i'))
    const cur = (params.get('c') ?? '').toUpperCase()
    const price = !cur || cur === 'EUR' ? parsePrice(params.get('p')) : undefined
    return {
      title: (params.get('t') ?? '').slice(0, 200), url: u ? u.toString() : '', details: '',
      price: price !== undefined ? String(price) : '', image: img ? img.toString() : '',
    }
  })() : null
  const [list, setList] = useState<Wishlist | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('ensure_my_list')
    if (error) { setErr(errMsg(error)); setLoading(false); return }
    const l = (Array.isArray(data) ? data[0] : data) as Wishlist
    setList(l); setTitle(l.title)
    const [it, cl] = await Promise.all([
      supabase.from('items').select('*').eq('list_id', l.id).order('created_at'),
      supabase.from('item_claims').select('*'),   // la sécurité serveur ne renvoie que les achats déjà « révélés »
    ])
    setItems((it.data as Item[]) ?? [])
    setClaims(Object.fromEntries(((cl.data as Claim[]) ?? []).map(c => [c.item_id, c])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (prefill && !loading) document.getElementById('ajouter')?.scrollIntoView({ behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, params.get('add')])

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
    if (prefill) setParams({}, { replace: true })
    await load(); return null
  }
  const update = async (id: string, d: Draft) => {
    const { error } = await supabase.from('items').update(toRow(d)).eq('id', id)
    if (error) return errMsg(error)
    setEditId(null); await load(); return null
  }
  const remove = async (it: Item) => {
    if (!confirm(`Supprimer « ${it.title} » de votre liste ?`)) return
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
  const refresh = async (it: Item) => {
    setErr(''); setMsg(''); setBusyId(it.id)
    await refreshOne(it)
    setBusyId(null); load()
  }
  const missing = items.filter(i => i.url && !i.image_url)
  const refreshMissing = async () => {
    setErr(''); setMsg(''); setBulk(true)
    let ok = 0
    for (const it of missing) if (await refreshOne(it, true)) ok++
    setBulk(false)
    setMsg(`${ok} cadeau(x) complété(s) sur ${missing.length}. Les autres sites ne permettent pas la lecture automatique.`)
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
      <input className="h1-input" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Titre de la liste" />
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>

      {list && (
        <section className="card stack">
          <h2>Partager ma liste</h2>
          <p className="small muted">
            Envoyez ce lien à vos proches : ils se connectent, voient vos envies et peuvent indiquer ce qu'ils achètent.
            Vous, vous ne verrez pas ce qui a été acheté avant la date de remise du cadeau.
          </p>
          <CopyField value={listShareUrl(list.share_token)} />
        </section>
      )}

      <div className="row between wrap gap mt">
        <h2 style={{ margin: 0 }}>Mes envies ({items.length})</h2>
        {missing.length > 0 && (
          <button className="btn btn-sm" disabled={bulk} onClick={refreshMissing}>
            {bulk ? 'Lecture des liens…' : `↻ Récupérer images et prix (${missing.length})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card steps">
          <h3>Pour démarrer</h3>
          <ol>
            <li><strong>Ajoutez vos envies</strong> ci-dessous : collez simplement le lien du produit, l'image et le prix sont récupérés pour vous.</li>
            <li><strong>Partagez le lien</strong> de votre liste avec vos proches (WhatsApp, e-mail…).</li>
            <li><strong>Créez un événement</strong> (Noël, anniversaire) pour inviter la famille, voir toutes les listes et organiser un tirage au sort.</li>
          </ol>
        </div>
      ) : (
        <GiftTable statusLabel="Statut">
          {items.map(it => editId === it.id ? (
            <div key={it.id} className="gtable-edit">
              <ItemForm
                initial={{ title: it.title, url: it.url ?? '', details: it.details ?? '', price: it.price?.toString() ?? '', image: it.image_url ?? '' }}
                submitLabel="Enregistrer" onCancel={() => setEditId(null)} onSubmit={d => update(it.id, d)}
              />
            </div>
          ) : (
            <GiftRow
              key={it.id}
              item={it}
              highlight={Boolean(claims[it.id])}
              status={claims[it.id]
                ? <span className="badge badge-ok">🎁 Offert par {claims[it.id].claimed_by_name}<br /><span className="small">remise le {formatDateShort(claims[it.id].reveal_on)}</span></span>
                : <span className="small muted">🤫 Surprise</span>}
              actions={<>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(it.id)}>Modifier</button>
                {it.url && <button className="btn btn-ghost btn-sm" disabled={busyId === it.id} onClick={() => refresh(it)}>{busyId === it.id ? '…' : '↻ Actualiser'}</button>}
                <button className="btn btn-ghost btn-sm danger" onClick={() => remove(it)}>Supprimer</button>
              </>}
            />
          ))}
        </GiftTable>
      )}

      <h2 className="mt" id="ajouter">Ajouter un cadeau</h2>
      <div className="narrow-left stack">
        {prefill && <Notice kind="ok">Cadeau récupéré depuis la page du magasin : vérifiez et enregistrez.</Notice>}
        <ItemForm key={prefill ? params.toString() : 'new'} initial={prefill ?? empty} submitLabel="Ajouter à ma liste" onSubmit={add} />
        <BookmarkletBox />
      </div>
    </div>
  )
}
