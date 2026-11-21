import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { Notice } from './ui'
import { PersonDot } from './ListPills'

interface Contact { user_id: string; display_name: string; status: 'member' | 'invited' | null }

/** « Vos proches » : personnes déjà rencontrées sur le site, à inviter d'un clic (sans voir leur e-mail) */
export default function ContactPicker({ eventId, onInvited }: { eventId: string; onInvited: (names: string[], mailed: number) => void }) {
  const [list, setList] = useState<Contact[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [all, setAll] = useState(false)

  useEffect(() => {
    supabase.rpc('my_contacts', { p_event: eventId }).then(({ data, error }) => {
      if (error) { setErr(errMsg(error)); setList([]); return }
      setList(((data as Contact[]) ?? []).filter(c => c.status !== 'member'))
    })
  }, [eventId])

  if (!list) return null
  if (!list.length) return null

  const free = list.filter(c => !c.status)
  const shown = all ? list : list.slice(0, 8)
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const invite = async () => {
    if (!picked.size) return
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('invite_contacts', { p_event: eventId, p_users: [...picked] })
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    const rows = (data as { invite_id: string; display_name: string }[]) ?? []
    // un e-mail par invitation (les adresses restent sur le serveur)
    const sent = await Promise.all(rows.map(r => supabase.functions.invoke('send-invite-email', { body: { invite_id: r.invite_id } })
      .then(({ data: d }) => Boolean((d as { sent?: boolean } | null)?.sent)).catch(() => false)))
    setBusy(false)
    setList(l => (l ?? []).map(c => picked.has(c.user_id) ? { ...c, status: 'invited' } : c))
    setPicked(new Set())
    onInvited(rows.map(r => r.display_name), sent.filter(Boolean).length)
  }

  return (
    <section className="stack contacts">
      <h3 style={{ margin: 0 }}>Vos proches</h3>
      <p className="small muted" style={{ margin: 0 }}>Les personnes que vous connaissez déjà sur le site. Elles reçoivent l'invitation et choisissent de rejoindre l'événement.</p>
      <Notice>{err}</Notice>
      <div className="contact-list">
        {shown.map(c => (
          <label key={c.user_id} className={`contact${c.status ? ' off' : ''}`}>
            <input type="checkbox" disabled={!!c.status} checked={!!c.status || picked.has(c.user_id)} onChange={() => toggle(c.user_id)} />
            <PersonDot name={c.display_name} size={30} />
            <span className="contact-name">{c.display_name}</span>
            {c.status === 'invited' && <span className="small muted">déjà invité·e</span>}
          </label>
        ))}
      </div>
      {list.length > 8 && !all && <button type="button" className="linklike small" onClick={() => setAll(true)}>Voir les {list.length} proches</button>}
      {free.length > 0 && (
        <div className="row gap wrap">
          <button type="button" className="btn btn-primary" disabled={!picked.size || busy} onClick={invite}>
            {busy ? 'Invitation…' : picked.size ? `Inviter ${picked.size > 1 ? `ces ${picked.size} personnes` : 'cette personne'}` : 'Cochez les personnes à inviter'}
          </button>
        </div>
      )}
    </section>
  )
}
