import { Link } from 'react-router-dom'
import ApiAccess from '../components/ApiAccess'
import ThemePicker from '../components/ThemePicker'
import ExtensionLinks from '../components/ExtensionLinks'

export default function Settings() {
  return (
    <div className="narrow">
      <h1>Réglages</h1>
      <p className="small muted">Votre nom, votre e-mail et votre mot de passe se trouvent dans <Link to="/profil">Mon profil</Link>.</p>
      <ThemePicker />
      <ExtensionLinks />
      <ApiAccess />
    </div>
  )
}
