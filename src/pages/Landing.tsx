import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/supabase'

const STEPS = [
  { n: '1', t: 'Créez votre liste', d: 'Collez le lien d\'un produit : l\'image et le prix sont récupérés pour vous. Ajoutez la taille, la couleur… ou écrivez simplement une idée.' },
  { n: '2', t: 'Partagez un lien', d: 'Envoyez-le par WhatsApp ou e-mail. Vos proches se connectent et découvrent vos envies, sur ordinateur comme sur téléphone.' },
  { n: '3', t: 'Ils achètent, sans doublon', d: 'Chacun coche « J\'ai acheté ce cadeau ». Les autres invités le voient aussitôt : plus jamais deux fois le même pull.' },
  { n: '4', t: 'La surprise reste entière', d: 'Vous, vous ne voyez rien de ce qui est acheté jusqu\'à la date de remise. Ce jour-là, tout s\'affiche.' },
]

const FEATURES = [
  { i: '🖼️', t: 'Image et prix automatiques', d: 'À partir du lien, nous lisons la fiche du magasin quand il le permet. Sinon, vous saisissez le prix à la main.' },
  { i: '🎄', t: 'Événements', d: 'Noël, anniversaire, crémaillère… Créez un événement avec une date et invitez la famille ou les amis par un lien.' },
  { i: '🎲', t: 'Tirage au sort', d: 'Un « Secret Santa » en un clic. Excluez des duos (un couple, par exemple) : personne ne tire sa moitié, et personne ne voit le tirage des autres.' },
  { i: '🔒', t: 'Surprise garantie', d: 'Le secret est protégé par le serveur, pas seulement caché à l\'écran : le propriétaire de la liste ne peut pas lire les achats avant la date.' },
]

const FAQ = [
  { q: 'Est-ce gratuit ?', a: 'Oui. Créer un compte, une liste, des événements et un tirage au sort ne coûte rien.' },
  { q: 'Mes proches doivent-ils créer un compte ?', a: 'Oui, c\'est rapide et gratuit. C\'est ce qui permet de savoir qui a acheté quoi, tout en le cachant au propriétaire de la liste.' },
  { q: 'Je vois ma propre liste : puis-je savoir ce qu\'on m\'offre ?', a: 'Non, volontairement. Les achats ne deviennent visibles pour vous qu\'à la date de remise du cadeau, choisie par la personne qui achète (par exemple la date de l\'événement).' },
  { q: 'Comment fonctionne le tirage au sort ?', a: 'L\'organisateur de l\'événement ajoute d\'éventuelles exclusions, puis lance le tirage. Chacun découvre uniquement la personne à qui il doit offrir un cadeau, y compris l\'organisateur.' },
  { q: 'Pourquoi des liens « partenaires » ?', a: 'Certains liens vers des magasins peuvent rapporter une petite commission au site. Le prix pour vous ne change pas.' },
]

export default function Landing() {
  return (
    <div className="land">
      <header className="land-top">
        <div className="land-in row between">
          <span className="brand">🎁 {APP_NAME}</span>
          <Link className="btn btn-sm" to="/login">Connexion</Link>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-in land-hero-grid">
          <div>
            <p className="land-kicker">Listes de cadeaux partagées · gratuit</p>
            <h1>Offrez ce qui fait vraiment plaisir. <span>Sans doublons, sans mauvaise surprise.</span></h1>
            <p className="land-sub">
              Chacun crée sa liste d'envies et la partage en un lien. Ses proches indiquent ce qu'ils achètent, pour que personne n'offre deux fois la même chose,
              et que le propriétaire de la liste garde la surprise.
            </p>
            <div className="row wrap gap">
              <Link className="btn btn-primary btn-lg" to="/login?mode=up">Créer ma liste</Link>
              <Link className="btn btn-lg" to="/login">J'ai déjà un compte</Link>
            </div>
          </div>

          <div className="land-mock" aria-hidden>
            <div className="mock-bar">Liste de Julie <span>vue par ses proches</span></div>
            <div className="mock-row"><div className="mock-th">🧣</div><div><strong>Écharpe en laine</strong><small>Rouge</small></div><b>35,00 €</b><i className="mock-todo">À offrir</i></div>
            <div className="mock-row mock-done"><div className="mock-th">🕯️</div><div><strong>Bougie parfumée</strong><small>Odeur vanille</small></div><b>15,00 €</b><i className="mock-ok">✓ Acheté par Louis</i></div>
            <div className="mock-row"><div className="mock-th">📚</div><div><strong>Livre de cuisine</strong><small>Édition illustrée</small></div><b>29,90 €</b><i className="mock-todo">À offrir</i></div>
            <div className="mock-note">🤫 Julie, elle, ne voit pas « Acheté par Louis » avant le 25 décembre.</div>
          </div>
        </div>
      </section>

      <section className="land-sec">
        <div className="land-in">
          <h2>Comment ça marche</h2>
          <div className="land-steps">
            {STEPS.map(s => (
              <div key={s.n} className="land-step card">
                <span className="land-num">{s.n}</span>
                <h3>{s.t}</h3>
                <p className="small">{s.d}</p>
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
                <span className="land-ico" aria-hidden>{f.i}</span>
                <div><h3>{f.t}</h3><p className="small">{f.d}</p></div>
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
        Certains liens vers des magasins sont des liens partenaires (parrainage) : le prix ne change pas pour vous, mais ils peuvent rapporter une petite commission au site.
      </footer>
    </div>
  )
}
