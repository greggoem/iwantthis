import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'

interface Row { id: string; owner_id: string; title: string; items: { count: number }[] }

export default function SharedLists() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('wishlists').select('id,owner_id,title,items(count)').neq('owner_id', session!.user.id)
      const r = (data as unknown as Row[]) ?? []
      setRows(r)
      if (r.length) {
        const { data: p } = await supabase.from('profiles').select('id,display_name').in('id', r.map(x => x.owner_id))
        setNames(Object.fromEntries((p ?? []).map((x: { id: string; display_name: string }) => [x.id, x.display_name])))
      }
      setLoading(false)
    })()
  }, [session])

  const open = (e: FormEvent) => {
    e.preventDefault()
    const m = paste.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (!m) { setErr('Lien non reconnu. Collez le lien complet reçu de votre proche.'); return }
    nav(`/l/${m[0]}`)
  }

  if (loading) return <Spinner />
  return (
    <div className="narrow">
      <h1>Listes de mes proches</h1>
      {rows.length === 0 && (
        <p className="muted">Aucune liste pour l'instant. Ouvrez un lien de partage reçu, ou rejoignez un événement : les listes des invités apparaissent ici.</p>
      )}
      <ul className="items">
        {rows.map(r => (
          <li key={r.id}>
            <Link className="card item linkcard" to={`/listes/${r.id}`}>
              <div className="item-main">
                <strong>{names[r.owner_id] ?? 'Quelqu\'un'}</strong>
                <p className="small muted">{r.title} · {r.items[0]?.count ?? 0} cadeau(x)</p>
              </div>
              <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>

      <form className="card stack mt" onSubmit={open}>
        <h2>J'ai reçu un lien</h2>
        <Notice>{err}</Notice>
        <div className="row">
          <input value={paste} onChange={e => setPaste(e.target.value)} placeholder="Collez le lien de partage ici" />
          <button className="btn btn-primary">Ouvrir</button>
        </div>
      </form>
    </div>
  )
}
