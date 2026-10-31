import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'

export default function OpenShared() {
  const { token } = useParams()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('open_shared_list', { p_token: token }).then(({ data, error }) => {
      if (error) setErr(errMsg(error)); else nav(`/listes/${data}`, { replace: true })
    })
  }, [token, nav])
  return err ? <Notice>{err}</Notice> : <Spinner label="Ouverture de la liste…" />
}
