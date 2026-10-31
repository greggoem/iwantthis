import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg, listShareUrl } from '../lib/supabase'
import { safeUrl } from '../lib/affiliate'
import { formatDateShort, formatPrice } from '../lib/format'
import type { Claim, Item, Wishlist } from '../lib/types'
import { CopyField, Notice, Spinner } from '../components/ui'
import ItemLink from '../components/ItemLink'

interface Draft { title: string; url: string; details: string; price: string }
const empty: Draft = { title: '', url: '', details: '', price: '' }

function ItemForm({ initial, onSubmit, onCancel, submitLabel }: {
  initial: Draft; onSubmit: (d: Draft) => Promise<string | null>; onCancel?: () => void; submitLabel: string
}) {
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD(prev => ({ ...prev, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (d.url.trim() && !safeUrl(d.url)) { setErr('Ce lien ne semble pas valide (il doit commencer par http:// ou https://).'); return }
    setBusy(true)
    const msg = await onSubmit(d)
    setBusy(false)
    if (msg) setErr(msg); else if (!onCancel) setD(empty)
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <Notice>{err}</Notice>
      <label>Cadeau
        <input required maxLength={200} value={d.title} onChange={set('title')} placeholder="Ex. Pull en laine mérinos" />
      </label>
      <label><span>Lien vers le site <span className="muted">(facultatif)</span></span>
        <input value={d.url} onChange={set('url')} placeholder="https://…" inputMode="url" />
      </label>
      <label><span>Détails <span className="muted">(taille, couleur, modèle…)</span></span>
        <textarea maxLength={1000} rows={2} value={d.details} onChange={set('details')} placeholder="Ex. Taille L, bleu marine" />
      </label>
      <label><span>Prix indicatif <span className="muted">(facultatif, en €)</span></span>
        <input type="number" min="0" step="0.01" value={d.price} onChange={set('price')} />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>}
      </div>
    </form>
  )
}

export default function MyList() {
  const [list, setList] = useState<Wishlist | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [claims, setClaims] = useState<Record<string, Claim>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
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

  const toRow = (d: Draft) => ({
    title: d.title.trim(),
    url: d.url.trim() ? safeUrl(d.url)!.toString() : null,
    details: d.details.trim() || null,
    price: d.price === '' ? null : Number(d.price),
  })

  const add = async (d: Draft) => {
    const { error } = await supabase.from('items').insert({ ...toRow(d), list_id: list!.id })
    if (error) return errMsg(error)
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
  const saveTitle = async () => {
    if (!list || title.trim() === list.title || !title.trim()) return
    const { error } = await supabase.from('wishlists').update({ title: title.trim() }).eq('id', list.id)
    if (error) setErr(errMsg(error)); else setList({ ...list, title: title.trim() })
  }

  if (loading) return <Spinner />

  return (
    <div className="narrow">
      <input className="h1-input" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Titre de la liste" />
      <Notice>{err}</Notice>

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

      <h2 className="mt">Mes envies ({items.length})</h2>
      {items.length === 0 && <p className="muted">Votre liste est vide : ajoutez votre premier cadeau ci-dessous.</p>}

      <ul className="items">
        {items.map(it => (
          <li key={it.id}>
            {editId === it.id ? (
              <ItemForm
                initial={{ title: it.title, url: it.url ?? '', details: it.details ?? '', price: it.price?.toString() ?? '' }}
                submitLabel="Enregistrer" onCancel={() => setEditId(null)} onSubmit={d => update(it.id, d)}
              />
            ) : (
              <div className="card item">
                <div className="item-main">
                  <strong>{it.title}</strong>
                  {it.details && <p className="small">{it.details}</p>}
                  <div className="row wrap gap">
                    {it.price !== null && <span className="small muted">{formatPrice(it.price)}</span>}
                    <ItemLink url={it.url} />
                  </div>
                  {claims[it.id] && (
                    <p className="badge badge-ok">
                      🎁 Offert par {claims[it.id].claimed_by_name} (remise le {formatDateShort(claims[it.id].reveal_on)})
                    </p>
                  )}
                </div>
                <div className="item-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(it.id)}>Modifier</button>
                  <button className="btn btn-ghost btn-sm danger" onClick={() => remove(it)}>Supprimer</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt">Ajouter un cadeau</h2>
      <ItemForm initial={empty} submitLabel="Ajouter à ma liste" onSubmit={add} />
    </div>
  )
}
