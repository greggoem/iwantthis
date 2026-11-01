import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/supabase'
import Icon, { type IconName } from '../components/Icon'
import Logo from '../components/Logo'

const STEPS = [
  { t: 'Créez votre liste', d: 'Collez le lien d\'un produit : l\'image et le prix sont récupérés pour vous. Ajoutez la taille, la couleur… ou une simple idée.' },
  { t: 'Partagez un lien', d: 'Envoyez-le par WhatsApp ou e-mail. Vos proches se connectent et découvrent vos envies, sur ordinateur comme sur téléphone.' },
  { t: 'Ils achètent, sans doublon', d: 'Chacun indique « J\'ai acheté ce cadeau ». Les autres invités le voient aussitôt : plus jamais deux fois le même pull.' },
  { t: 'La surprise reste entière', d: 'Vous ne voyez rien de ce qui est acheté avant la date de remise. Ce jour-là, tout s\'affiche.' },
]

const FEATURES: { i: IconName; t: string; d: string }[] = [
  { i: 'image', t: 'Image et prix automatiques', d: 'À partir du lien, la fiche du magasin est lue quand il le permet. Sinon, un raccourci pour votre navigateur ou une saisie à la main.' },
  { i: 'sparkles', t: 'Événements', d: 'Noël, anniversaire, crémaillère… Créez un événement avec une date et invitez la famille ou les amis par un lien.' },
  { i: 'dice', t: 'Tirage au sort', d: 'Un « Secret Santa » en un clic, avec des exclusions (un couple, par exemple). Personne ne voit le tirage des autres.' },
  { i: 'lock', t: 'Surprise garantie', d: 'Le secret est protégé par le serveur, pas seulement caché à l\'écran : le propriétaire ne peut pas lire les achats avant la date.' },
]

const FAQ = [
  { q: 'Est-ce gratuit ?', a: 'Oui. Créer un compte, une liste, des événements et un tirage au sort ne coûte rien.' },
  { q: 'Mes proches doivent-ils créer un compte ?', a: 'Oui, c\'est rapide et gratuit. C\'est ce qui permet de savoir qui a acheté quoi, tout en le cachant au propriétaire de la liste.' },
  { q: 'Puis-je savoir ce qu\'on m\'offre ?', a: 'Non, volontairement. Les achats ne deviennent visibles pour vous qu\'à la date de remise du cadeau, choisie par la personne qui achète (par exemple la date de l\'événement).' },
  { q: 'Comment fonctionne le tirage au sort ?', a: 'L\'organisateur ajoute d\'éventuelles exclusions, puis lance le tirage. Chacun découvre uniquement la personne à qui il doit offrir un cadeau, organisateur compris.' },
  { q: 'Puis-je me désinscrire ?', a: 'Oui, à tout moment : dans Mon profil, « Supprimer mon compte » efface votre compte, votre liste et vos achats. Vos événements sont transmis à un autre invité.' },
  { q: 'Pourquoi des liens « partenaires » ?', a: 'Certains liens vers des magasins peuvent rapporter une petite commission au site. Le prix pour vous ne change pas.' },
]

const ROWS = [
  { t: 'Écharpe en laine', s: 'Rouge', p: '35,00 €', ok: false, c: '#f4d9d2' },
  { t: 'Bougie parfumée', s: 'Vanille', p: '15,00 €', ok: true, c: '#e9e4d8' },
  { t: 'Livre de cuisine', s: 'Édition illustrée', p: '29,90 €', ok: false, c: '#d9e4ea' },
]

export default function Landing() {
  return (
    <div className="land">
      <header className="land-top">
        <div className="land-in row between">
          <Logo name={APP_NAME} />
          <div className="row">
            <Link className="btn btn-ghost" to="/login">Connexion</Link>
            <Link className="btn btn-primary" to="/login?mode=up">Créer ma liste</Link>
          </div>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-in land-hero-grid">
          <div>
            <p className="land-kicker">Listes de cadeaux partagées</p>
            <h1>Offrez ce qui fait vraiment plaisir.</h1>
            <p className="land-sub">
              Chacun crée sa liste d'envies et la partage en un lien. Ses proches indiquent ce qu'ils achètent : pas de doublon, et le propriétaire garde la surprise.
            </p>
            <div className="row wrap gap">
              <Link className="btn btn-primary btn-lg" to="/login?mode=up">Créer ma liste <Icon name="arrow" size={18} /></Link>
              <Link className="btn btn-lg" to="/login">J'ai déjà un compte</Link>
            </div>
            <p className="small muted land-note">Gratuit · sans application à installer</p>
          </div>

          <div className="land-mock" aria-hidden>
            <div className="mock-bar"><strong>Liste de Julie</strong><span>vue par ses proches</span></div>
            {ROWS.map(r => (
              <div key={r.t} className={`mock-row ${r.ok ? 'mock-done' : ''}`}>
                <div className="mock-th" style={{ background: r.c }} />
                <div className="mock-txt"><strong>{r.t}</strong><small>{r.s}</small></div>
                <b>{r.p}</b>
                <span className={r.ok ? 'chip chip-ok' : 'chip'}>{r.ok ? 'Acheté par Louis' : 'À offrir'}</span>
              </div>
            ))}
            <div className="mock-note"><Icon name="lock" size={14} /> Julie ne voit pas « Acheté par Louis » avant le 25 décembre.</div>
          </div>
        </div>
      </section>

      <section className="land-sec">
        <div className="land-in">
          <h2>Comment ça marche</h2>
          <div className="land-steps">
            {STEPS.map((s, i) => (
              <div key={s.t} className="land-step">
                <span className="land-num">{i + 1}</span>
                <h3>{s.t}</h3>
                <p className="small muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="land-sec land-alt">
        <div className="land-in">
          <h2>Tout pour les fêtes en famille</h2>
          <div className="land-feats">
            {FEATURES.map(f => (
              <div key={f.t} className="land-feat">
                <span className="land-ico"><Icon name={f.i} size={22} /></span>
                <div><h3>{f.t}</h3><p className="small muted">{f.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="land-sec">
        <div className="land-in land-narrow">
          <h2>Questions fréquentes</h2>
          {FAQ.map(f => (
            <details key={f.q} className="land-faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="land-cta">
        <div className="land-in center">
          <h2>Prêt pour les prochaines fêtes ?</h2>
          <p>Votre liste est prête en deux minutes.</p>
          <Link className="btn btn-lg land-cta-btn" to="/login?mode=up">Créer ma liste gratuitement</Link>
        </div>
      </section>

      <footer className="footer">
        Certains liens vers des magasins sont des liens partenaires : le prix ne change pas pour vous, mais ils peuvent rapporter une petite commission au site.
      </footer>
    </div>
  )
}
