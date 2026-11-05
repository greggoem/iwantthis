import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/supabase'
import ThemePicker from '../components/ThemePicker'
import ExtensionLinks from '../components/ExtensionLinks'
import Icon from '../components/Icon'
import { LogoMark } from '../components/Logo'

/* Petites illustrations dessinées en SVG (suivent les couleurs du thème choisi) */
const Frame = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg className="wl-art" viewBox="0 0 320 180" role="img" aria-label={label}>{children}</svg>
)

function ArtAdd() {
  return (
    <Frame label="Un lien de produit collé dans le formulaire d'ajout">
      <rect x="10" y="10" width="300" height="160" rx="12" className="a-card" />
      <rect x="26" y="28" width="268" height="26" rx="8" className="a-field" />
      <text x="38" y="46" className="a-txt">https://magasin.be/pull-en-laine…</text>
      <rect x="26" y="68" width="64" height="64" rx="10" className="a-img" />
      <path d="M40 116l16-20 12 14 8-8 10 14z" className="a-ink" opacity=".35" />
      <rect x="102" y="74" width="150" height="10" rx="5" className="a-ink" opacity=".8" />
      <rect x="102" y="94" width="90" height="8" rx="4" className="a-ink" opacity=".3" />
      <rect x="102" y="112" width="48" height="12" rx="6" className="a-accent" />
      <rect x="214" y="140" width="80" height="22" rx="11" className="a-accent" />
      <text x="254" y="155" textAnchor="middle" className="a-txt-w">Ajouter</text>
    </Frame>
  )
}
function ArtShare() {
  return (
    <Frame label="Une liste partagée avec des proches">
      <rect x="10" y="10" width="300" height="160" rx="12" className="a-card" />
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(26 ${26 + i * 40})`}>
          <rect width="34" height="30" rx="7" className="a-img" />
          <rect x="46" y="4" width="120" height="8" rx="4" className="a-ink" opacity=".75" />
          <rect x="46" y="18" width="60" height="7" rx="3.5" className="a-ink" opacity=".25" />
        </g>
      ))}
      <rect x="196" y="62" width="98" height="24" rx="12" className="a-ok" />
      <text x="245" y="78" textAnchor="middle" className="a-txt-w">Acheté ✓</text>
      <circle cx="270" cy="30" r="12" className="a-accent" />
      <path d="M264 30h12M270 24v12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </Frame>
  )
}
function ArtSurprise() {
  return (
    <Frame label="Un cadeau acheté reste une surprise pour son destinataire">
      <rect x="10" y="10" width="300" height="160" rx="12" className="a-card" />
      <rect x="120" y="76" width="80" height="62" rx="6" className="a-ink" opacity=".85" />
      <rect x="114" y="62" width="92" height="20" rx="5" className="a-ink" />
      <rect x="154" y="62" width="12" height="76" className="a-accent" />
      <path d="M160 62c-12 0-22-5-22-13 0-6 5-9 10-8 6 2 10 10 12 21zM160 62c12 0 22-5 22-13 0-6-5-9-10-8-6 2-10 10-12 21z" className="a-accent" />
      <text x="160" y="160" textAnchor="middle" className="a-txt">le propriétaire ne voit rien</text>
      <text x="48" y="56" className="a-spark">✦</text><text x="262" y="48" className="a-spark">✦</text><text x="250" y="120" className="a-spark">✦</text>
    </Frame>
  )
}
function ArtExtension() {
  return (
    <Frame label="L'icône de l'extension dans la barre du navigateur, sur une page produit">
      <rect x="10" y="10" width="300" height="160" rx="12" className="a-card" />
      <path d="M10 22a12 12 0 0 1 12-12h276a12 12 0 0 1 12 12v22H10z" className="a-bar" />
      <rect x="26" y="20" width="170" height="16" rx="8" className="a-field" />
      <g transform="translate(262 17)"><rect width="22" height="22" rx="6" className="a-accent" /><path d="M5 9h12v9H5zM4 6h14v4H4zM10 6h2v12h-2z" fill="#fff" /></g>
      <path d="M273 44v14" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" className="a-ink" />
      <path d="M268 54l5 7 5-7" className="a-ink" fill="none" strokeWidth="2" strokeLinecap="round" />
      <rect x="26" y="66" width="86" height="86" rx="10" className="a-img" />
      <rect x="126" y="74" width="120" height="10" rx="5" className="a-ink" opacity=".8" />
      <rect x="126" y="94" width="80" height="8" rx="4" className="a-ink" opacity=".3" />
      <rect x="126" y="116" width="54" height="14" rx="7" className="a-accent" />
    </Frame>
  )
}

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
          <div className="wl-steps">
            <article><ArtAdd /><h3>Ajoutez vos envies</h3><p>Collez le lien d'un produit : le nom, l'image et le prix se remplissent tout seuls. Vous pouvez aussi ajouter une photo ou regrouper plusieurs idées (« un livre parmi ces trois »).</p></article>
            <article><ArtShare /><h3>Partagez votre liste</h3><p>Envoyez le lien à vos proches, ou créez un événement (Noël, anniversaire…) avec tirage au sort si vous voulez. Chacun voit votre liste et peut marquer « Acheté », pour éviter les doublons.</p></article>
            <article><ArtSurprise /><h3>La surprise reste entière</h3><p>Vous ne voyez jamais ce qui a été acheté pour vous : les cadeaux ne vous sont révélés que le lendemain de la date de remise. Et si vous offrez, vous pouvez même masquer l'envie aux autres.</p></article>
          </div>
        </div>
      </section>

      <section className="wl-block">
        <span className="wl-num">3</span>
        <div className="wl-body">
          <h2>Ajoutez une envie en un clic</h2>
          <p className="muted">Pour ne plus copier-coller à la main, installez l'extension de votre navigateur : sur la page d'un produit, cliquez sur l'icône {APP_NAME}, et l'envie arrive dans votre liste, déjà remplie.</p>
          <ArtExtension />
          <ExtensionLinks />
        </div>
      </section>

      <div className="wl-end">
        <Link className="btn btn-primary btn-lg" to={go} onClick={start}>Commencer ma liste d'envies <Icon name="arrow" size={18} /></Link>
        <p className="small muted">Ce guide reste disponible dans <Link to="/profil">Mon profil</Link> et <Link to="/reglages">Réglages</Link>.</p>
      </div>
    </div>
  )
}
