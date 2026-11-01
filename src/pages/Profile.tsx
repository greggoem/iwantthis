import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { Notice } from '../components/ui'
import ApiAccess from '../components/ApiAccess'
import DeleteAccount from '../components/DeleteAccount'

export default function Profile() {
  const { profile, session, refreshProfile } = useAuth()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (profile) setName(profile.display_name) }, [profile])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', session!.user.id)
    if (error) setErr(errMsg(error)); else { setMsg('Nom mis à jour.'); refreshProfile() }
  }

  return (
    <div className="narrow">
      <h1>Mon profil</h1>
      <form className="card stack" onSubmit={save}>
        <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>
        <label>Prénom affiché aux autres
          <input required maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <p className="small muted">Connecté avec {session?.user.email}</p>
        <button className="btn btn-primary">Enregistrer</button>
      </form>
      <p className="small muted">Les achats déjà réservés gardent l'ancien nom affiché.</p>

      <ApiAccess />
      <DeleteAccount />
    </div>
  )
}
