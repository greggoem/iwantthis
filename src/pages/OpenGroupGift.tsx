import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'

/** Lien partagé « ?g=TOKEN » d'un cadeau commun : on rejoint les invités puis on ouvre le cadeau */
export default function OpenGroupGift() {
  const { token } = useParams()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('open_group_gift', { p_token: token }).then(({ data, error }) => {
      if (error) setErr(errMsg(error)); else nav(`/commun/${data}`, { replace: true })
    })
  }, [token, nav])
  return err ? <div className="narrow stack"><Notice>{err}</Notice><Link to="/" className="btn">Accueil</Link></div> : <Spinner label="Ouverture du cadeau commun…" />
}
