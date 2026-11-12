import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/supabase'
import ThemePicker from '../components/ThemePicker'
import { HowItWorks, ExtensionGuide, MobileGuide } from '../components/HowItWorks'
import Icon from '../components/Icon'
import { LogoMark } from '../components/Logo'

export default function Welcome() {
  const go = (() => { try { return sessionStorage.getItem('postLoginPath') || '/' } catch { return '/' } })()
  const start = () => { try { sessionStorage.removeItem('postLoginPath') } catch { /* ignore */ } }
  return (
    <div className="welcome">
      <header className="wl-hero">
        <LogoMark size={56} />
        <h1>Bienvenue sur {APP_NAME} !</h1>
        <p className="lead">Votre adresse e-mail est confirmée. Plus personne ne se demandera quoi vous offrir.</p>
        <Link className="btn btn-primary btn-lg" to={go} onClick={start}>Commencer ma liste d'envies <Icon name="arrow" size={18} /></Link>
      </header>

      <section className="wl-block">
        <span className="wl-num">1</span>
        <div className="wl-body">
          <h2>Choisissez votre apparence</h2>
          <p className="muted">Cliquez sur celle qui vous plaît. Vous pourrez la changer à tout moment dans Réglages.</p>
          <ThemePicker compact bare />
        </div>
      </section>

      <section className="wl-block">
        <span className="wl-num">2</span>
        <div className="wl-body">
          <h2>Comment ça marche</h2>
          <HowItWorks />
          <p><Link to="/aide">Le guide complet, étape par étape →</Link></p>
        </div>
      </section>

      <section className="wl-block">
        <span className="wl-num">3</span>
        <div className="wl-body">
          <h2>Ajoutez une envie en un clic</h2>
          <ExtensionGuide />
          <MobileGuide />
        </div>
      </section>

      <div className="wl-end">
        <Link className="btn btn-primary btn-lg" to={go} onClick={start}>Commencer ma liste d'envies <Icon name="arrow" size={18} /></Link>
        <p className="small muted">Ce guide reste disponible dans <Link to="/reglages?s=guide">Réglages</Link>.</p>
      </div>
    </div>
  )
}
