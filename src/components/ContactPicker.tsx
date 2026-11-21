import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { Notice } from './ui'
import { PersonDot } from './ListPills'
import Icon from './Icon'

interface Contact { user_id: string; display_name: string; status: 'member' | 'invited' | null }
interface Managed { id: string; name: string; color: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * « Inviter un proche » : un bouton qui déplie la liste des personnes déjà rencontrées sur le site
 * (invitées d'un clic, sans voir leur e-mail) et des proches sans e-mail que l'on gère (enfants, grands-parents…).
 */
export default function ContactPicker({ eventId, managed, onInvited, onAddManaged, onNewManaged }: {
  eventId: string
  managed: Managed[]                                  // mes listes gérées qui ne sont pas encore dans l'événement
  onInvited: (invited: string[], added: string[], mailed: number) => void
  onAddManaged: (ids: string[]) => Promise<unknown>
  onNewManaged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Contact[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || list) return
    supabase.rpc('my_contacts', { p_event: eventId }).then(({ data, error }) => {
      if (error) { setErr(errMsg(error)); setList([]); return }
      setList(((data as Contact[]) ?? []).filter(c => c.status !== 'member'))
    })
  }, [open, list, eventId])

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (!open) {
    return (
      <button type="button" className="btn btn-primary contact-open" onClick={() => setOpen(true)}>
        <Icon name="users" size={17} /> Inviter un proche
      </button>
    )
  }

  type Row = { id: string; name: string; kind: 'account' | 'managed'; color: string | null; status: Contact['status'] }
  const rows: Row[] = [
    ...(list ?? []).map(c => ({ id: c.user_id, name: c.display_name, kind: 'account' as const, color: null, status: c.status })),
    ...managed.map(m => ({ id: m.id, name: m.name, kind: 'managed' as const, color: m.color ?? 'corail', status: null })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  const shown = q.trim() ? rows.filter(r => norm(r.name).includes(norm(q.trim()))) : rows

  const invite = async () => {
    if (!picked.size) return
    setBusy(true); setErr('')
    const accounts = [...picked].filter(id => rows.find(r => r.id === id)?.kind === 'account')
    const lists = [...picked].filter(id => rows.find(r => r.id === id)?.kind === 'managed')
    let names: string[] = [], mailed = 0
    if (accounts.length) {
      const { data, error } = await supabase.rpc('invite_contacts', { p_event: eventId, p_users: accounts })
      if (error) { setBusy(false); setErr(errMsg(error)); return }
      const inv = (data as { invite_id: string; display_name: string }[]) ?? []
      names = inv.map(r => r.display_name)
      // un e-mail par invitation (les adresses restent sur le serveur)
      const sent = await Promise.all(inv.map(r => supabase.functions.invoke('send-invite-email', { body: { invite_id: r.invite_id } })
        .then(({ data: d }) => Boolean((d as { sent?: boolean } | null)?.sent)).catch(() => false)))
      mailed = sent.filter(Boolean).length
    }
    if (lists.length) await onAddManaged(lists)
    setBusy(false)
    setList(l => (l ?? []).map(c => picked.has(c.user_id) ? { ...c, status: 'invited' } : c))
    setPicked(new Set())
    onInvited(names, lists.map(id => rows.find(r => r.id === id)!.name), mailed)
  }

  return (
    <section className="stack contacts">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Inviter un proche</h3>
        <button type="button" className="linklike small" onClick={() => { setOpen(false); setPicked(new Set()) }}>Fermer</button>
      </div>
      <Notice>{err}</Notice>
      {!list ? <p className="small muted" style={{ margin: 0 }}>Chargement…</p> : (
        <>
          {rows.length > 6 && <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un proche" aria-label="Rechercher un proche" />}
          <div className="contact-list">
            {shown.map(c => (
              <label key={c.id} className={`contact${c.status ? ' off' : ''}`}>
                <input type="checkbox" disabled={!!c.status} checked={!!c.status || picked.has(c.id)} onChange={() => toggle(c.id)} />
                <PersonDot name={c.name} color={c.kind === 'managed' ? c.color ?? 'corail' : undefined} size={30} />
                <span className="contact-name">{c.name}</span>
                {c.status === 'invited' && <span className="small muted">déjà invité·e</span>}
                {c.kind === 'managed' && <span className="small muted">sans e-mail</span>}
              </label>
            ))}
            {!shown.length && <p className="small muted contact-empty">{rows.length ? 'Personne ne correspond.' : 'Pas encore de proches sur le site : invitez par lien ou par e-mail ci-dessous.'}</p>}
            <button type="button" className="contact contact-new" onClick={onNewManaged}>
              <span className="contact-plus"><Icon name="plus" size={16} /></span>
              <span className="contact-name">Ajouter un proche sans e-mail<br /><span className="small muted" style={{ fontWeight: 400 }}>Enfant, grand-parent… vous gérez sa liste</span></span>
            </button>
          </div>
          <div className="row gap wrap">
            <button type="button" className="btn btn-primary" disabled={!picked.size || busy} onClick={invite}>
              {busy ? 'Invitation…' : picked.size ? `Inviter ${picked.size > 1 ? `ces ${picked.size} personnes` : 'cette personne'}` : 'Cochez les personnes à inviter'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
