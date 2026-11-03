import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import type { AppNotification } from '../lib/types'
import { IconButton, Notice, Spinner } from '../components/ui'
import Icon from '../components/Icon'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Notifications dans le site : ajouts à un événement, etc. */
export default function Notifications() {
  const nav = useNavigate()
  const [rows, setRows] = useState<AppNotification[] | null>(null)
  const [err, setErr] = useState('')
  const refresh = () => window.dispatchEvent(new Event('iwt-notifications'))

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) { setErr(errMsg(error)); setRows([]); return }
    setRows((data as AppNotification[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const open = async (n: AppNotification) => {
    if (!n.read_at) { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); refresh() }
    if (n.link) nav(n.link); else load()
  }
  const readAll = async () => {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    if (error) setErr(errMsg(error)); else { refresh(); load() }
  }
  const remove = async (n: AppNotification) => {
    const { error } = await supabase.from('notifications').delete().eq('id', n.id)
    if (error) setErr(errMsg(error)); else { refresh(); load() }
  }

  if (rows === null) return <Spinner />
  const unread = rows.filter(r => !r.read_at).length

  return (
    <div className="narrow">
      <div className="row between wrap gap">
        <h1>Notifications</h1>
        {unread > 0 && <button className="btn btn-sm" onClick={readAll}><Icon name="check" size={15} /> Tout marquer comme lu</button>}
      </div>
      <Notice>{err}</Notice>
      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-ico"><Icon name="bell" size={26} /></div>
          <h2>Rien de nouveau</h2>
          <p className="muted">Vous serez prévenu(e) ici quand quelqu'un vous ajoute à un événement.</p>
        </div>
      ) : (
        <ul className="notifs">
          {rows.map(n => (
            <li key={n.id} className={n.read_at ? '' : 'unread'}>
              <button type="button" className="notif-main" onClick={() => open(n)}>
                <span className="notif-dot" aria-hidden="true" />
                <span className="notif-text">
                  <strong>{n.title}</strong>
                  {n.body && <span className="small muted">{n.body}</span>}
                  <span className="small muted">{ago(n.created_at)}</span>
                </span>
              </button>
              <IconButton icon="trash" label="Supprimer cette notification" onClick={() => remove(n)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
