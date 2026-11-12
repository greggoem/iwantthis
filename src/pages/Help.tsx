import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon, { type IconName } from '../components/Icon'
import MARKS from '../help-marks.json'

/** Un repère numéroté posé sur une capture (x, y en % de l'image) */
interface Mark { n: number; x: number; y: number }
interface Shot { src: string; alt: string }
interface Step { title: string; text: ReactNode; shots?: Shot[] }
interface Section { id: string; icon: IconName; title: string; intro: ReactNode; steps: Step[]; soon?: boolean }

const N = ({ n }: { n: number }) => <span className="help-n" aria-label={`repère ${n}`}>{n}</span>

const SECTIONS: Section[] = [
  {
    id: 'liste', icon: 'gift', title: 'Créer sa liste',
    intro: <>Votre liste d'envies se remplit en collant simplement le lien d'un produit : le nom, l'image et le prix sont récupérés pour vous.</>,
    steps: [
      {
        title: 'Collez le lien du produit',
        text: <>Touchez <strong>Ajouter</strong>, puis collez le lien <N n={1} /> copié depuis le site du magasin. Sur téléphone, <strong>Coller le lien</strong> <N n={2} /> le fait pour vous. Touchez <strong>Continuer</strong> <N n={3} />.</>,
        shots: [{ src: 'liste-1-lien', alt: 'Fenêtre « Ajouter une envie » avec le champ du lien' }],
      },
      {
        title: 'Vérifiez et complétez',
        text: <>L'image <N n={1} />, le nom et le prix arrivent tout seuls. Précisez la taille ou la couleur dans <strong>Détails</strong> <N n={2} />, puis <strong>Ajouter à ma liste</strong> <N n={3} />. Pas de lien ? Remplissez simplement les champs à la main.</>,
        shots: [{ src: 'liste-2-formulaire', alt: 'Formulaire prérempli avec image, nom et prix' }],
      },
      {
        title: 'Votre liste est prête',
        text: <>Vos envies s'affichent avec leur image et leur prix. <strong>Partager</strong> <N n={1} /> envoie votre liste à vos proches, <strong>Ajouter</strong> <N n={2} /> en ajoute une autre, et le menu <strong>⋯</strong> <N n={3} /> de chaque envie permet de la modifier, de la mettre en favori ou de la supprimer.</>,
        shots: [{ src: 'liste-3-liste', alt: 'La liste avec trois envies' }],
      },
    ],
  },
  {
    id: 'site', icon: 'external', title: 'Ajouter depuis un site',
    intro: <>Sur ordinateur, pas besoin de copier le lien : un clic depuis la page du produit suffit.</>,
    steps: [
      {
        title: 'Installez l\'extension',
        text: <>Dans <strong>Réglages › Extension</strong>, touchez <strong>Installer</strong> <N n={1} /> pour votre navigateur (Chrome, Edge, Brave, Opera ou Firefox). Une petite icône I Want This apparaît dans la barre du navigateur.</>,
        shots: [{ src: 'site-1-extension', alt: 'Page Extension avec les boutons Installer' }],
      },
      {
        title: 'Un clic sur la page du produit',
        text: <>Sur la fiche d'un produit, cliquez sur l'icône : l'envie s'ouvre déjà remplie, avec l'image et le prix, même sur les magasins qui bloquent la lecture automatique. Pas d'extension possible ? Glissez le bouton <strong>Ajouter à I Want This</strong> <N n={1} /> dans votre barre de favoris : il fait la même chose.</>,
        shots: [{ src: 'site-2-bouton', alt: 'Le bouton à glisser dans la barre de favoris' }],
      },
    ],
  },
  {
    id: 'appli', icon: 'share', title: 'Ajouter depuis une appli',
    intro: <>Vous trouvez une envie dans l'appli d'une marque (Zara, H&amp;M, Amazon…) ? Utilisez son bouton <strong>Partager</strong>.</>,
    steps: [
      {
        title: 'Android et iPhone',
        text: <>Sur <strong>Android</strong>, installez d'abord I Want This sur l'écran d'accueil : il apparaît alors dans le menu <strong>Partager</strong> des applis. Sur <strong>iPhone</strong>, choisissez <strong>Copier le lien</strong>, puis collez-le dans I Want This. Le détail est dans <strong>Réglages › Extension</strong> <N n={1} />.</>,
        shots: [{ src: 'appli-1-guide', alt: 'Explications pour Android et iPhone' }],
      },
      {
        title: 'Le formulaire arrive déjà rempli',
        text: <>I Want This lit la fiche du produit : l'image <N n={1} />, le nom et le prix sont prêts. Vérifiez, complétez la taille ou la couleur, et enregistrez.</>,
        shots: [{ src: 'appli-2-partage', alt: 'Formulaire rempli après un partage' }],
      },
    ],
  },
  {
    id: 'organiser', icon: 'star', title: 'Organiser sa liste',
    intro: <>Rassemblez plusieurs liens sous une même envie, mettez en avant vos préférées et choisissez votre affichage.</>,
    steps: [
      {
        title: 'Créez un groupe',
        text: <>Dans le menu <strong>⋯</strong>, choisissez <strong>Nouveau groupe</strong> <N n={1} /> : une collection de livres, plusieurs modèles au choix… Si un seul cadeau suffit, cochez <strong>Un seul à choisir</strong> : dès qu'un proche en achète un, les autres ne sont plus proposés.</>,
        shots: [{ src: 'orga-1-groupe', alt: 'Menu ⋯ avec « Nouveau groupe »' }],
      },
      {
        title: 'Favoris, tri et affichage',
        text: <>Le groupe <N n={1} /> se déplie pour montrer ses éléments. Le menu <strong>⋯</strong> de chaque envie permet de la marquer comme <strong>favori</strong> (étoile) : vos favoris passent en tête. Triez la liste et passez de la vue liste à la galerie avec les boutons <N n={2} />.</>,
        shots: [{ src: 'orga-2-liste', alt: 'Liste avec un groupe et un favori' }],
      },
    ],
  },
  {
    id: 'partager', icon: 'share', title: 'Partager sa liste',
    intro: <>Envoyez votre liste à qui vous voulez : un lien suffit.</>,
    steps: [
      {
        title: 'Envoyez le lien',
        text: <>Touchez <strong>Partager</strong> : copiez le lien <N n={1} /> ou envoyez-le directement par WhatsApp ou par e-mail, avec un message et une image prêts. Vos proches se connectent et voient votre liste ; elle apparaît ensuite dans leurs <strong>Listes de mes proches</strong>.</>,
        shots: [{ src: 'partager-1', alt: 'Fenêtre « Partager ma liste »' }],
      },
    ],
  },
  {
    id: 'offrir', icon: 'bag', title: 'Offrir un cadeau',
    intro: <>Retrouvez les listes de vos proches, et indiquez ce que vous achetez pour éviter les doublons.</>,
    steps: [
      {
        title: 'Les listes de vos proches',
        text: <>Dans <strong>Listes de mes proches</strong>, chaque personne <N n={1} /> a sa carte, avec ses événements. Les listes y arrivent toutes seules quand on vous partage un lien ou que vous rejoignez un événement.</>,
        shots: [{ src: 'offrir-1-proches', alt: 'Listes de mes proches' }],
      },
      {
        title: 'Marquez « Acheté »',
        text: <>Sur la liste d'un proche, touchez <strong>Acheté</strong> après votre achat, choisissez l'occasion <N n={1} /> puis <strong>Confirmer</strong> <N n={2} />. Les autres invités le voient tout de suite ; la personne, elle, ne le découvre qu'après la date de remise.</>,
        shots: [{ src: 'offrir-2-liste', alt: 'Choix de l\'occasion après « Acheté »' }],
      },
      {
        title: 'Vos cadeaux à offrir',
        text: <>La page <strong>À offrir</strong> rassemble tout ce que vous avez acheté, pour qui et pour quelle date. Vous pouvez y changer la date ou annuler un achat.</>,
        shots: [{ src: 'offrir-3-a-offrir', alt: 'Page « Mes cadeaux à offrir »' }],
      },
    ],
  },
  {
    id: 'surprise', icon: 'lock', title: 'La surprise',
    intro: <>Vous ne voyez jamais ce qu'on vous offre avant le jour J : c'est protégé par le serveur, pas seulement caché à l'écran.</>,
    steps: [
      {
        title: 'Tout reste « Surprise »',
        text: <>Sur votre liste, chaque envie affiche <strong>Surprise</strong> <N n={1} />, qu'elle soit achetée ou non. Continuez à ajouter ou modifier vos envies sans rien deviner.</>,
        shots: [{ src: 'surprise-1', alt: 'Envies marquées « Surprise »' }],
      },
      {
        title: 'Le lendemain, on découvre',
        text: <>Le lendemain de la date de remise, un bandeau vous attend : touchez <strong>Découvrir</strong> <N n={1} /> pour voir qui vous a offert quoi. Les cadeaux reçus sont ensuite rangés dans vos archives.</>,
        shots: [{ src: 'surprise-2', alt: 'Bandeau « Un cadeau vous attend ! »' }],
      },
    ],
  },
  {
    id: 'evenements', icon: 'calendar', title: 'Les événements',
    intro: <>Noël, anniversaire, crémaillère… Un événement réunit des proches : chacun voit les listes des autres.</>,
    steps: [
      {
        title: 'Créez un événement',
        text: <>Dans <strong>Événements</strong>, touchez <strong>Créer un événement</strong> <N n={1} /> : un nom et une date suffisent. Ajoutez si vous voulez une heure, un lieu et une image.</>,
        shots: [{ src: 'event-1-liste', alt: 'Page Événements' }],
      },
      {
        title: 'Invitez vos proches',
        text: <>Sur la page de l'événement, touchez <strong>Inviter</strong> <N n={1} />.</>,
        shots: [{ src: 'event-2-detail', alt: 'Page d\'un événement' }],
      },
      {
        title: 'Un lien, ou une invitation par e-mail',
        text: <>Envoyez le lien avec <strong>Partager</strong> <N n={1} /> (WhatsApp, e-mail…), ou ajoutez quelqu'un par son nom et son e-mail : il reçoit une invitation.</>,
        shots: [{ src: 'event-3-inviter', alt: 'Fenêtre « Inviter des proches »' }],
      },
      {
        title: 'Vos invités acceptent',
        text: <>En ouvrant le lien, vos proches voient l'événement et touchent <strong>Rejoindre l'événement</strong> <N n={1} />. Rien n'est partagé avant leur accord.</>,
        shots: [{ src: 'event-4-rejoindre', alt: 'Page « Rejoindre l\'événement »' }],
      },
    ],
  },
  {
    id: 'tirage', icon: 'dice', title: 'Le tirage au sort',
    intro: <>Chacun offre un cadeau à une seule personne, tirée au sort : idéal pour les grandes familles.</>,
    steps: [
      {
        title: 'Activez et réglez le tirage',
        text: <>L'organisateur choisit <strong>Activer le tirage au sort</strong> dans le menu <strong>⋯</strong> de l'événement. La section <strong>Tirage au sort</strong> <N n={1} /> permet d'exclure des paires (un couple, par exemple) et de choisir qui participe, puis de lancer le tirage.</>,
        shots: [{ src: 'tirage-1', alt: 'Section « Tirage au sort »' }],
      },
      {
        title: 'Chacun découvre son résultat',
        text: <>Chaque participant touche <strong>Découvrir à qui j'offre un cadeau</strong> <N n={1} /> et accède à la liste de la personne tirée. Le résultat est secret : même l'organisateur ne voit que le sien.</>,
        shots: [{ src: 'tirage-2', alt: 'Bouton « Découvrir à qui j\'offre un cadeau »' }],
      },
    ],
  },
  {
    id: 'enfant', icon: 'users', title: 'Ajouter un enfant',
    intro: <>Votre enfant n'a pas d'e-mail ? Tenez sa liste depuis votre compte. Vos proches la voient comme les autres, et vous pouvez la remplir avec lui sans rien dévoiler de ce qui a été acheté.</>,
    steps: [
      {
        title: 'Ouvrez le menu de votre liste',
        text: <>Dans <strong>Ma liste</strong>, touchez <strong>⋯</strong> <N n={1} />, puis <strong>Ajouter une liste d'enfant</strong> <N n={2} />.</>,
        shots: [{ src: 'enfant-1-menu', alt: 'Menu ⋯ ouvert avec « Ajouter une liste d\'enfant »' }],
      },
      {
        title: 'Son prénom, son âge, sa couleur',
        text: <>Indiquez son prénom <N n={1} /> (l'âge est facultatif) et choisissez la couleur de sa pastille <N n={2} />. Cochez <strong>Partager dans mes événements</strong> pour que vos invités voient sa liste, puis <strong>Créer la liste</strong> <N n={3} />.</>,
        shots: [{ src: 'enfant-2-formulaire', alt: 'Fenêtre « Ajouter un enfant »' }],
      },
      {
        title: 'Passez d\'une liste à l\'autre',
        text: <>Les pastilles <N n={1} /> en haut de la page passent de votre liste à celle de votre enfant. Ici, les achats sont <strong>toujours cachés</strong> : vous pouvez remplir sa liste à côté de lui. Pour voir ce qui a été acheté, ou marquer vous-même un cadeau <strong>Acheté</strong>, touchez <strong>voir les achats</strong> <N n={2} />.</>,
        shots: [{ src: 'enfant-3-liste', alt: 'La liste de Tom, avec les pastilles Moi et Tom' }],
      },
      {
        title: '« Pour qui ? »',
        text: <>Quand vous ajoutez une envie, depuis le site, l'extension ou le bouton Partager d'une appli, choisissez la liste <N n={1} /> : la vôtre ou celle de votre enfant. Le site retient la dernière utilisée.</>,
        shots: [{ src: 'enfant-4-pour-qui', alt: 'Formulaire d\'ajout avec « Pour qui ? »' }],
      },
    ],
  },
  {
    id: 'reglages', icon: 'sparkles', title: 'Réglages et compte',
    intro: <>Le menu ☰ en haut à droite regroupe votre profil et vos réglages.</>,
    steps: [
      {
        title: 'Le menu du compte',
        text: <><strong>Mon profil</strong> pour votre nom, votre e-mail et votre mot de passe ; <strong>Apparence</strong>, <strong>Comment ça marche</strong>, <strong>Extension</strong> et <strong>API</strong> ; et <strong>Se déconnecter</strong>, qui ne déconnecte que cet appareil.</>,
        shots: [{ src: 'reglages-1-menu', alt: 'Menu du compte ouvert' }],
      },
      {
        title: 'Choisissez votre apparence',
        text: <>Cinq styles au choix : Classique, Menthe, Nuit (sombre), Fête et Doodle. Le choix est gardé sur cet appareil.</>,
        shots: [{ src: 'reglages-2-apparence', alt: 'Choix de l\'apparence' }],
      },
    ],
  },
]

/** Captures « ordinateur » sur grand écran, « téléphone » sur mobile (repères calculés par scripts/captures-aide.mjs) */
const WIDE = '(min-width: 821px)'
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches)
  useEffect(() => {
    const m = window.matchMedia(WIDE)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

function Capture({ shot, wide }: { shot: Shot; wide: boolean }) {
  const fmt = wide ? 'desktop' : 'phone'
  const marks = ((MARKS as Record<string, Record<string, Mark[]>>)[shot.src]?.[fmt]) ?? []
  const screen = (
    <div className="help-screen">
      <img src={`${import.meta.env.BASE_URL}aide/${shot.src}-${fmt}.webp`} alt={shot.alt} loading="lazy" width={wide ? 1024 : 390} height={wide ? 680 : 844} />
      {marks.map(m => <span key={m.n} className="help-mark" style={{ left: `${m.x}%`, top: `${m.y}%` }} aria-hidden>{m.n}</span>)}
    </div>
  )
  return wide ? (
    <figure className="help-browser">
      <div className="help-browser-bar" aria-hidden><i /><i /><i /><span>iwantthis.gift</span></div>
      {screen}
    </figure>
  ) : <figure className="help-phone">{screen}</figure>
}

export default function Help() {
  const [params, setParams] = useSearchParams()
  const current = SECTIONS.find(s => s.id === params.get('s') && !s.soon) ?? SECTIONS[0]
  const wide = useWide()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [current.id])
  const go = (id: string) => setParams({ s: id })
  const idx = SECTIONS.indexOf(current)
  const next = SECTIONS.slice(idx + 1).find(s => !s.soon)
  const prev = [...SECTIONS.slice(0, idx)].reverse().find(s => !s.soon)

  return (
    <div className="help">
      <div className="help-top">
        <h1>Comment ça marche</h1>
        <p className="muted">Tout I Want This, étape par étape.</p>
      </div>
      <div className="help-layout">
        <nav className="help-nav" aria-label="Étapes">
          {SECTIONS.map((s, i) => (
            <button key={s.id} type="button" className={`help-tab${s.id === current.id ? ' on' : ''}`} disabled={s.soon}
              aria-current={s.id === current.id ? 'page' : undefined} onClick={() => go(s.id)}>
              <span className="help-num">{i + 1}</span>
              <span className="help-tab-label">{s.title}</span>
              {s.soon && <span className="help-soon">bientôt</span>}
            </button>
          ))}
        </nav>
        <article className="help-body">
          <header className="help-head">
            <span className="help-ico"><Icon name={current.icon} size={22} /></span>
            <div>
              <p className="help-kicker">Étape {idx + 1}</p>
              <h2>{current.title}</h2>
            </div>
          </header>
          <p className="help-intro">{current.intro}</p>
          {current.steps.map((st, i) => (
            <section key={i} className="help-step">
              <div className="help-text">
                <h3><span className="help-stepnum">{i + 1}</span>{st.title}</h3>
                <p>{st.text}</p>
              </div>
              {st.shots?.map(sh => <Capture key={sh.src} shot={sh} wide={wide} />)}
            </section>
          ))}
          <div className="help-pager">
            {prev ? <button type="button" className="btn" onClick={() => go(prev.id)}>← {prev.title}</button> : <span />}
            {next ? <button type="button" className="btn btn-primary" onClick={() => go(next.id)}>{next.title} →</button> : <Link className="btn btn-primary" to="/">Aller à ma liste</Link>}
          </div>
        </article>
      </div>
    </div>
  )
}
