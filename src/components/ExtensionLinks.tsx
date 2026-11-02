import { APP_NAME, siteUrl } from '../lib/supabase'
import { EXTENSION_ZIP, EXTENSION_ZIP_FIREFOX, STORE_LINKS } from '../lib/extensions'
import { LogoMark } from './Logo'
import Icon from './Icon'
import BookmarkletBox from './BookmarkletBox'

const BROWSERS: { key: keyof typeof STORE_LINKS; name: string; hint: string }[] = [
  { key: 'chrome', name: 'Chrome', hint: 'et Brave, Opera, Vivaldi…' },
  { key: 'edge', name: 'Edge', hint: 'Microsoft Edge' },
  { key: 'firefox', name: 'Firefox', hint: 'Mozilla Firefox' },
]

/** « Mon profil » : l'extension de navigateur (un clic sur une page produit pour l'ajouter à ma liste) */
export default function ExtensionLinks() {
  return (
    <section className="card stack mt">
      <div className="exthead">
        <LogoMark size={36} />
        <div>
          <h2>Extension pour votre navigateur</h2>
          <p className="small muted">Sur une page produit, un clic sur l'icône {APP_NAME} ouvre l'ajout déjà rempli (nom, image, prix), avec le choix du groupe. Ça marche même sur les magasins qui bloquent la lecture automatique.</p>
        </div>
      </div>

      <ul className="extlist">
        {BROWSERS.map(b => (
          <li key={b.key}>
            <div><strong>{b.name}</strong> <span className="muted small">{b.hint}</span></div>
            {STORE_LINKS[b.key]
              ? <a className="btn btn-sm btn-primary" href={STORE_LINKS[b.key]} target="_blank" rel="noopener noreferrer">Installer <Icon name="external" size={14} /></a>
              : <span className="chip chip-quiet">bientôt sur le store</span>}
          </li>
        ))}
      </ul>

      <details className="bm">
        <summary>Installer à la main dès maintenant</summary>
        <p className="small"><a className="btn btn-sm" href={EXTENSION_ZIP} download><Icon name="arrow" size={14} /> Télécharger l'extension (.zip)</a> puis décompressez l'archive.</p>
        <ul className="small steps-list">
          <li><strong>Chrome, Edge, Brave :</strong> ouvrez <code>chrome://extensions</code> (ou <code>edge://extensions</code>), activez le <em>Mode développeur</em>, cliquez <em>Charger l'extension non empaquetée</em> et choisissez le dossier décompressé.</li>
          <li><strong>Firefox :</strong> <a href={EXTENSION_ZIP_FIREFOX} download>téléchargez la version Firefox</a>, décompressez-la, ouvrez <code>about:debugging#/runtime/this-firefox</code>, <em>Charger un module complémentaire temporaire</em>, choisissez <code>manifest.json</code> (à refaire à chaque redémarrage tant qu'elle n'est pas sur le store).</li>
        </ul>
        <p className="small muted">L'extension lit seulement la page sur laquelle vous cliquez, et n'a accès ni à votre compte ni à vos mots de passe.</p>
      </details>
      <details className="bm">
        <summary>Sur téléphone : partager un produit vers {APP_NAME}</summary>
        <ul className="small steps-list">
          <li><strong>Android (Chrome) :</strong> ouvrez ce site, menu ⋮ → <em>Installer l'application</em> (ou <em>Ajouter à l'écran d'accueil</em>). Ensuite, dans n'importe quelle appli (Amazon, Zalando, navigateur…), touchez <em>Partager</em> puis <em>{APP_NAME}</em> : le formulaire s'ouvre déjà rempli.</li>
          <li><strong>iPhone / iPad :</strong> Safari ne permet pas encore ce partage direct. Ouvrez l'app <em>Raccourcis</em> → <em>+</em> → ajoutez <em>Recevoir des URL depuis la feuille de partage</em>, <em>Encoder l'URL</em> (sur « Entrée de raccourci »), puis <em>Ouvrir des URL</em> avec <code>{siteUrl()}#/?add=1&amp;u=</code> suivi de la variable « URL encodée ». Dans le menu Partager, touchez <em>Raccourcis</em> → votre raccourci.</li>
          <li><strong>Sinon :</strong> copiez le lien du produit, ouvrez {APP_NAME} → <em>Ajouter</em> et collez-le : le nom, l'image et le prix se remplissent.</li>
        </ul>
      </details>
      <BookmarkletBox open hideTip title="Raccourci pour la barre de favoris (tous navigateurs)" />
    </section>
  )
}
