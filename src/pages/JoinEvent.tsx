import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { Notice, Spinner } from '../components/ui'
import Icon from '../components/Icon'

interface Info {
  id: string | null; name: string; date: string; time: string | null; location: string | null
  image: string | null; by: string | null; members: number
}

/**
 * Lien d'invitation « ?e=CODE » : on montre l'événement et la personne choisit de le rejoindre (ou non).
 * Rien n'est partagé avant son accord. Si elle en fait déjà partie, on l'y emmène directement.
 */
export default function JoinEvent() {
  const { code } = useParams()
  const nav = useNavigate()
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('event_invite_info', { p_code: code }).then(({ data, error }) => {
      if (error) { setErr(errMsg(error)); setInfo(null); return }
      const i = data as Info | null
      if (i?.id) { nav(`/evenements/${i.id}`, { replace: true }); return }
      setInfo(i)
    })
  }, [code, nav])

  const join = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('join_event', { p_code: code })
    setBusy(false)
    if (error) setErr(errMsg(error)); else nav(`/evenements/${data}`, { replace: true })
  }

  if (info === undefined) return <Spinner label="Chargement de l'invitation…" />
  if (!info) return (
    <div className="card stack join-card">
      <h1>Invitation introuvable</h1>
      <Notice>{err}</Notice>
      <p className="muted">Ce lien n'est plus valable. Demandez un nouveau lien à la personne qui vous a invité(e).</p>
      <Link className="btn" to="/">Retour à ma liste</Link>
    </div>
  )

  const when = formatDate(info.date) + (info.time ? ` à ${info.time.slice(0, 5).replace(':', 'h')}` : '')
  return (
    <div className="card stack join-card">
      {info.image && <img className="join-img" src={info.image} alt="" />}
      <p className="small muted join-kicker">{info.by ? `${info.by} vous invite` : 'Vous êtes invité(e)'}</p>
      <h1>{info.name}</h1>
      <p className="ev-line"><Icon name="calendar" size={17} /><span>{when.charAt(0).toUpperCase() + when.slice(1)}</span></p>
      {info.location && <p className="ev-line"><Icon name="pin" size={17} /><span>{info.location}</span></p>}
      <p className="small muted">
        En rejoignant l'événement, votre liste d'envies devient visible des autres invités{info.members > 0 ? ` (${info.members} déjà inscrit${info.members > 1 ? 's' : ''})` : ''}, et vous voyez la leur.
      </p>
      <Notice>{err}</Notice>
      <div className="row gap wrap">
        <button className="btn btn-primary" disabled={busy} onClick={join}><Icon name="check" size={16} /> Rejoindre l'événement</button>
        <Link className="btn btn-ghost" to="/">Non merci</Link>
      </div>
    </div>
  )
}
