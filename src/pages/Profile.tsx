import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, siteUrl } from '../lib/supabase'
import { Notice } from '../components/ui'
import DeleteAccount from '../components/DeleteAccount'

export default function Profile() {
  const { profile, session, refreshProfile } = useAuth()
  const user = session!.user
  const hasPassword = (user.identities ?? []).some(i => i.provider === 'email')
  const google = (user.identities ?? []).some(i => i.provider === 'google')

  const [name, setName] = useState('')
  const [nameMsg, setNameMsg] = useState(''); const [nameErr, setNameErr] = useState('')
  useEffect(() => { if (profile) setName(profile.display_name) }, [profile])
  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    setNameErr(''); setNameMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', user.id)
    if (error) setNameErr(errMsg(error)); else { setNameMsg('Nom mis à jour.'); refreshProfile() }
  }

  const [email, setEmail] = useState('')
  const [mailMsg, setMailMsg] = useState(''); const [mailErr, setMailErr] = useState('')
  const saveEmail = async (e: FormEvent) => {
    e.preventDefault()
    setMailErr(''); setMailMsg('')
    const next = email.trim().toLowerCase()
    if (next === (user.email ?? '').toLowerCase()) { setMailErr('C’est déjà votre adresse actuelle.'); return }
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: siteUrl() })
    if (error) setMailErr(errMsg(error))
    else { setMailMsg(`Un e-mail de confirmation a été envoyé. Ouvrez le lien reçu (sur la nouvelle adresse${user.email ? ' et peut-être aussi sur l’ancienne' : ''}) pour valider le changement. Votre adresse actuelle reste valable en attendant.`); setEmail('') }
  }

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('')
  const savePw = async (e: FormEvent) => {
    e.preventDefault()
    setPwErr(''); setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setPwErr(errMsg(error)); else { setPwMsg('Mot de passe mis à jour.'); setPw('') }
  }

  return (
    <div className="narrow">
      <h1>Mon profil</h1>
      <p className="small muted">Un doute sur le fonctionnement du site ? Relisez le <Link to="/reglages?s=guide">guide « Comment ça marche »</Link>.</p>

      <form className="card stack" onSubmit={saveName}>
        <Notice>{nameErr}</Notice><Notice kind="ok">{nameMsg}</Notice>
        <label>Prénom affiché aux autres
          <input required maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div><button className="btn btn-primary">Enregistrer</button></div>
        <p className="small muted">Les achats déjà réservés gardent l'ancien nom affiché.</p>
      </form>

      <form className="card stack mt" onSubmit={saveEmail}>
        <h2>Adresse e-mail</h2>
        <Notice>{mailErr}</Notice><Notice kind="ok">{mailMsg}</Notice>
        <p className="small muted">Adresse actuelle : <strong>{user.email}</strong>{google && !hasPassword && ' (compte relié à Google)'}</p>
        <label>Nouvelle adresse
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {google && <p className="small muted">Changer l'adresse n'affecte pas votre connexion avec Google : elle continuera de fonctionner avec votre compte Google.</p>}
        <div><button className="btn btn-primary">Changer l'adresse</button></div>
      </form>

      <form className="card stack mt" onSubmit={savePw}>
        <h2>Mot de passe</h2>
        <Notice>{pwErr}</Notice><Notice kind="ok">{pwMsg}</Notice>
        {!hasPassword && <p className="small muted">Vous vous connectez avec Google. Vous pouvez aussi définir un mot de passe pour vous connecter par e-mail.</p>}
        <label>{hasPassword ? 'Nouveau mot de passe' : 'Mot de passe'} (6 caractères minimum)
          <input type="password" minLength={6} required value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <div><button className="btn btn-primary">{hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}</button></div>
      </form>

      <p className="small muted mt">Thème, extensions et accès API : <Link to="/reglages">Réglages</Link>.</p>

      <DeleteAccount />
    </div>
  )
}
