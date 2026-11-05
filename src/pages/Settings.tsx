import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import ApiAccess from '../components/ApiAccess'
import ThemePicker from '../components/ThemePicker'
import ExtensionLinks from '../components/ExtensionLinks'

export default function Settings() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => { supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true)) }, [])
  return (
    <div className="narrow">
      <h1>Réglages</h1>
      <p className="small muted">Votre nom, votre e-mail et votre mot de passe se trouvent dans <Link to="/profil">Mon profil</Link>.</p>
      <ThemePicker />
      <ExtensionLinks />
      <ApiAccess />
      {admin && (
        <section className="card stack">
          <h2>Administration</h2>
          <p className="small muted">Réservé aux administrateurs du site.</p>
          <Link className="btn" to="/admin"><Icon name="chart" size={16} /> <span>Statistiques du site</span></Link>
        </section>
      )}
    </div>
  )
}
