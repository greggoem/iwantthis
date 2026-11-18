import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { STORE_LINKS } from '../lib/extensions'
import { platform, isMobile, deviceSetupDone, hasDeviceStep, markDeviceSetup, buttonInstalled } from '../lib/platform'
import Icon from './Icon'

/** Première connexion sur un appareil : on propose une fois la bonne « première étape » (extension, installation…) */
export default function DeviceTip() {
  const [hidden, setHidden] = useState(() => deviceSetupDone() || !hasDeviceStep())
  // ordinateur : on attend de savoir si l'extension est déjà là avant de la proposer
  const [checked, setChecked] = useState(() => isMobile())
  useEffect(() => {
    if (hidden || checked) return
    buttonInstalled().then(yes => { if (yes) { markDeviceSetup(); setHidden(true) } setChecked(true) })
  }, [hidden, checked])
  if (hidden || !checked) return null
  const p = platform()
  const close = () => { markDeviceSetup(); setHidden(true) }
  const phone = p === 'ios' || p === 'android'
  const text = phone
    ? { t: 'Nouveau sur ce téléphone ?', d: p === 'android' ? 'Installez I Want This pour y envoyer les produits vus dans vos applis, et rester connecté.' : 'Mettez I Want This sur votre écran d\'accueil : vous l\'ouvrez comme une appli et restez connecté.' }
    : { t: 'Nouveau sur cet ordinateur ?', d: 'Ajoutez vos envies en un clic depuis n\'importe quel magasin, avec l\'extension du navigateur.' }
  const ext = p === 'chromium' || p === 'firefox'
  return (
    <section className="device-tip" aria-label="Conseil pour cet appareil">
      <div className="dt-head">
        <span className="dt-ico"><Icon name={phone ? 'gift' : 'external'} size={18} /></span>
        <div className="dt-text"><strong>{text.t}</strong><p>{text.d}</p></div>
        <button type="button" className="dt-close" aria-label="Fermer" onClick={close}><Icon name="x" size={16} /></button>
      </div>
      <div className="dt-actions">
        {ext
          ? <a className="btn btn-sm dt-main" href={p === 'firefox' ? STORE_LINKS.firefox : STORE_LINKS.chrome} target="_blank" rel="noopener noreferrer" onClick={close}>Ajouter l'extension</a>
          : <Link className="btn btn-sm dt-main" to="/bienvenue?appareil=1" onClick={() => markDeviceSetup()}>{p === 'android' ? 'Installer' : 'Voir comment'}</Link>}
        <button type="button" className="btn btn-sm dt-later" onClick={close}>Plus tard</button>
      </div>
    </section>
  )
}
