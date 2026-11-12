import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon, { type IconName } from '../components/Icon'

/** Un repère numéroté posé sur une capture (x, y en % de l'image) */
interface Mark { n: number; x: number; y: number }
interface Shot { src: string; alt: string; marks?: Mark[] }
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
        shots: [{ src: 'liste-1-lien', alt: 'Fenêtre « Ajouter une envie » avec le champ du lien', marks: [{ n: 1, x: 93, y: 65.5 }, { n: 2, x: 5, y: 78.5 }, { n: 3, x: 51, y: 78.5 }] }],
      },
      {
        title: 'Vérifiez et complétez',
        text: <>L'image <N n={1} />, le nom et le prix arrivent tout seuls. Précisez la taille ou la couleur dans <strong>Détails</strong> <N n={2} />, puis <strong>Ajouter à ma liste</strong> <N n={3} />. Pas de lien ? Remplissez simplement les champs à la main.</>,
        shots: [{ src: 'liste-2-formulaire', alt: 'Formulaire prérempli avec image, nom et prix', marks: [{ n: 1, x: 5, y: 23.5 }, { n: 2, x: 5, y: 50.5 }, { n: 3, x: 54, y: 92.5 }] }],
      },
      {
        title: 'Votre liste est prête',
        text: <>Vos envies s'affichent avec leur image et leur prix. <strong>Partager</strong> <N n={1} /> envoie votre liste à vos proches, <strong>Ajouter</strong> <N n={2} /> en ajoute une autre, et le menu <strong>⋯</strong> <N n={3} /> de chaque envie permet de la modifier, de la mettre en favori ou de la supprimer.</>,
        shots: [{ src: 'liste-3-liste', alt: 'La liste avec trois envies', marks: [{ n: 1, x: 4, y: 15 }, { n: 2, x: 36, y: 15 }, { n: 3, x: 94, y: 46.5 }] }],
      },
    ],
  },
  { id: 'site', icon: 'external', title: 'Ajouter depuis un site', intro: null, steps: [], soon: true },
  { id: 'appli', icon: 'share', title: 'Ajouter depuis une appli', intro: null, steps: [], soon: true },
  { id: 'organiser', icon: 'star', title: 'Organiser sa liste', intro: null, steps: [], soon: true },
  { id: 'partager', icon: 'share', title: 'Partager sa liste', intro: null, steps: [], soon: true },
  { id: 'offrir', icon: 'bag', title: 'Offrir un cadeau', intro: null, steps: [], soon: true },
  { id: 'surprise', icon: 'lock', title: 'La surprise', intro: null, steps: [], soon: true },
  { id: 'evenements', icon: 'calendar', title: 'Les événements', intro: null, steps: [], soon: true },
  { id: 'tirage', icon: 'dice', title: 'Le tirage au sort', intro: null, steps: [], soon: true },
  {
    id: 'enfant', icon: 'users', title: 'Ajouter un enfant',
    intro: <>Votre enfant n'a pas d'e-mail ? Tenez sa liste depuis votre compte. Vos proches la voient comme les autres, et vous pouvez la remplir avec lui sans rien dévoiler de ce qui a été acheté.</>,
    steps: [
      {
        title: 'Ouvrez le menu de votre liste',
        text: <>Dans <strong>Ma liste</strong>, touchez <strong>⋯</strong> <N n={1} />, puis <strong>Ajouter une liste d'enfant</strong> <N n={2} />.</>,
        shots: [{ src: 'enfant-1-menu', alt: 'Menu ⋯ ouvert avec « Ajouter une liste d\'enfant »', marks: [{ n: 1, x: 76, y: 14.5 }, { n: 2, x: 11, y: 27.6 }] }],
      },
      {
        title: 'Son prénom, son âge, sa couleur',
        text: <>Indiquez son prénom <N n={1} /> (l'âge est facultatif) et choisissez la couleur de sa pastille <N n={2} />. Cochez <strong>Partager dans mes événements</strong> pour que vos invités voient sa liste, puis <strong>Créer la liste</strong> <N n={3} />.</>,
        shots: [{ src: 'enfant-2-formulaire', alt: 'Fenêtre « Ajouter un enfant »', marks: [{ n: 1, x: 5, y: 50.5 }, { n: 2, x: 4, y: 73.5 }, { n: 3, x: 49, y: 92.5 }] }],
      },
      {
        title: 'Passez d\'une liste à l\'autre',
        text: <>Les pastilles <N n={1} /> en haut de la page passent de votre liste à celle de votre enfant. Ici, les achats sont <strong>toujours cachés</strong> : vous pouvez remplir sa liste à côté de lui. Pour voir ce qui a été acheté, ou marquer vous-même un cadeau <strong>Acheté</strong>, touchez <strong>voir les achats</strong> <N n={2} />.</>,
        shots: [{ src: 'enfant-3-liste', alt: 'La liste de Tom, avec les pastilles Moi et Tom', marks: [{ n: 1, x: 58, y: 9 }, { n: 2, x: 60, y: 24.8 }] }],
      },
      {
        title: '« Pour qui ? »',
        text: <>Quand vous ajoutez une envie, depuis le site, l'extension ou le bouton Partager d'une appli, choisissez la liste <N n={1} /> : la vôtre ou celle de votre enfant. Le site retient la dernière utilisée.</>,
        shots: [{ src: 'enfant-4-pour-qui', alt: 'Formulaire d\'ajout avec « Pour qui ? »', marks: [{ n: 1, x: 52, y: 20 }] }],
      },
    ],
  },
  { id: 'reglages', icon: 'sparkles', title: 'Réglages et compte', intro: null, steps: [], soon: true },
]

function Phone({ shot }: { shot: Shot }) {
  return (
    <figure className="help-phone">
      <div className="help-screen">
        <img src={`${import.meta.env.BASE_URL}aide/${shot.src}.webp`} alt={shot.alt} loading="lazy" width={390} height={844} />
        {shot.marks?.map(m => <span key={m.n} className="help-mark" style={{ left: `${m.x}%`, top: `${m.y}%` }} aria-hidden>{m.n}</span>)}
      </div>
    </figure>
  )
}

export default function Help() {
  const [params, setParams] = useSearchParams()
  const current = SECTIONS.find(s => s.id === params.get('s') && !s.soon) ?? SECTIONS[0]
  const [, force] = useState(0)
  useEffect(() => { window.scrollTo({ top: 0 }); force(x => x + 1) }, [current.id])
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
              {st.shots?.map(sh => <Phone key={sh.src} shot={sh} />)}
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
