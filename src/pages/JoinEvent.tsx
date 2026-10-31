import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'

export default function JoinEvent() {
  const { code } = useParams()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('join_event', { p_code: code }).then(({ data, error }) => {
      if (error) setErr(errMsg(error)); else nav(`/evenements/${data}`, { replace: true })
    })
  }, [code, nav])
  return err ? <Notice>{err}</Notice> : <Spinner label="Inscription à l'événement…" />
}
