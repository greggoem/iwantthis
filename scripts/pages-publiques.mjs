// Génère les pages publiques indexables (référencement Google / Bing / IA) dans public/.
// Pages en HTML statique, lisibles sans JavaScript. Lancer : node scripts/pages-publiques.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const SITE = 'https://iwantthis.gift'
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS = `:root{--ink:#0f0f10;--muted:#57534e;--line:#e7e3dd;--bg:#fafaf9;--accent:#ff5a36;--kick:#c2381a}
*{box-sizing:border-box}
body{margin:0;font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--ink)}
.wrap{max-width:760px;margin:0 auto;padding:0 1.25rem}
header{padding:1rem 0;border-bottom:1px solid var(--line);background:#fff}
header .wrap{display:flex;justify-content:space-between;align-items:center;gap:1rem;max-width:1040px}
.brand{font-weight:700;text-decoration:none;font-size:1.1rem}
.top-cta{display:inline-flex;padding:.55rem 1rem;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-weight:600;font-size:.95rem}
.hero{padding:3rem 0 1.5rem}
.kicker{color:var(--kick);font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:.8rem;margin:0 0 .6rem}
h1{font-size:clamp(2rem,5vw,2.9rem);line-height:1.08;letter-spacing:-.03em;margin:0 0 1rem}
.lead{font-size:1.2rem;color:var(--muted);margin:0}
section{padding:1.6rem 0;border-top:1px solid var(--line)}
h2{font-size:1.45rem;letter-spacing:-.02em;margin:0 0 .8rem;line-height:1.2}
h3{font-size:1.08rem;margin:1.1rem 0 .3rem}
p{margin:.5rem 0}
ol.steps{padding-left:1.3rem}ol.steps li{margin:.5rem 0}
.faq dt{font-weight:650;margin-top:1rem}.faq dd{margin:.25rem 0 0;color:#3f3c38}
.cta{background:var(--ink);color:#fff;border-radius:20px;padding:1.8rem;margin:2rem 0;text-align:center}
.cta h2{color:#fff}.cta p{color:#c9c6c1}
.cta a{display:inline-block;margin-top:.6rem;padding:.75rem 1.3rem;border-radius:999px;background:#fff;color:var(--ink);text-decoration:none;font-weight:700}
figure{margin:1.2rem 0}
figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:14px;background:#fff}
figcaption{font-size:.88rem;color:var(--muted);margin-top:.45rem;text-align:center}
@media (max-width:600px){figure img{max-width:300px;margin:0 auto}}
.related ul{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
.related a{display:block;padding:.7rem 1rem;border:1px solid var(--line);border-radius:12px;background:#fff;text-decoration:none;font-weight:600}
.related small{display:block;font-weight:400;color:var(--muted)}
footer{padding:1.5rem 0 3rem;color:var(--muted);font-size:.9rem;border-top:1px solid var(--line)}
footer a{color:var(--muted)}`

const NAV = [
  ['/', 'Accueil'], ['/comment-ca-marche/', 'Comment ça marche'], ['/liste-de-noel/', 'Liste de Noël'],
  ['/liste-anniversaire/', "Liste d'anniversaire"], ['/tirage-au-sort/', 'Tirage au sort'],
  ['/secret-santa-bureau/', 'Secret Santa au bureau'], ['/listes-enfants/', "Listes d'enfants"],
  ['/presse.html', 'Presse'], ['/privacy.html', 'Confidentialité'],
]

// Capture d'écran du site (public/aide/) : version ordinateur, version téléphone sur petit écran
const shot = (name, alt, caption = '') => `<figure><picture>
<source media="(max-width:600px)" srcset="/aide/${name}-phone.webp" width="780" height="1688">
<img src="/aide/${name}-desktop.webp" width="1536" height="1020" alt="${esc(alt)}" loading="lazy" decoding="async">
</picture>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`

function page({ slug, title, description, kicker, h1, lead, body, faq = [], image }) {
  const url = `${SITE}/${slug}/`
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url, description, inLanguage: 'fr',
      isPartOf: { '@type': 'WebSite', name: 'I Want This', url: SITE + '/' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'I Want This', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: h1, item: url },
    ] },
  ]
  if (image) ld[0].primaryImageOfPage = { '@type': 'ImageObject', url: `${SITE}/aide/${image}-desktop.webp`, width: 1536, height: 1020 }
  if (faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({
    '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) })
  const related = PAGES.filter(p => p.slug !== slug)
  const relatedHtml = `<section class="related"><h2>À lire aussi</h2><ul>${related.map(p =>
    `<li><a href="/${p.slug}/">${p.short}<small>${p.teaser}</small></a></li>`).join('')}</ul></section>`
  const faqHtml = faq.length ? `<section><h2>Questions fréquentes</h2><dl class="faq">${faq.map(([q, a]) => `<dt>${q}</dt><dd>${a}</dd>`).join('')}</dl></section>` : ''
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="I Want This">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="fr_BE">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#fafaf9">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">I Want This</a><a class="top-cta" href="/#/login?mode=up">Créer ma liste</a></div></header>
<main class="wrap">
<div class="hero">
<p class="kicker">${kicker}</p>
<h1>${h1}</h1>
<p class="lead">${lead}</p>
</div>
${body}
${faqHtml}
${relatedHtml}
<div class="cta">
<h2>Prêt pour les prochaines fêtes ?</h2>
<p>Gratuit, sans application à installer. Votre liste est prête en deux minutes.</p>
<a href="/#/login?mode=up">Créer ma liste gratuitement</a>
</div>
</main>
<footer><div class="wrap">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join(' · ')}</div></footer>
</body>
</html>
`
}

const PAGES = [
  {
    slug: 'comment-ca-marche',
    short: 'Comment ça marche', teaser: "Créer, partager et offrir sans doublon, étape par étape.", image: 'offrir-2-liste',
    title: "Comment ça marche : liste d'envies à partager | I Want This",
    description: "Créez votre liste d'envies en collant un lien et partagez-la : vos proches indiquent ce qu'ils achètent, sans doublon, et la surprise reste entière. Gratuit.",
    kicker: 'Guide',
    h1: "Comment ça marche : une liste d'envies à partager, sans doublon",
    lead: "I Want This est un site gratuit de listes de cadeaux. Chacun crée sa liste d'envies, la partage par un lien, et ses proches indiquent ce qu'ils achètent. Les autres le voient tout de suite, mais le propriétaire de la liste ne découvre rien avant la date de remise.",
    body: `<section>
<h2>1. Créez votre liste d'envies</h2>
<p>Collez le lien d'un produit copié depuis le site du magasin : le nom, l'image et le prix sont récupérés pour vous. Précisez la taille ou la couleur, ou ajoutez une simple idée sans lien.</p>
${shot('liste-1-lien', "Fenêtre « Ajouter une envie » : on colle le lien du produit, le nom, l'image et le prix sont récupérés automatiquement", "Ajouter une envie : il suffit de coller le lien du produit.")}
<h3>Depuis l'ordinateur : l'extension</h3>
<p>Une extension existe pour Chrome, Edge, Brave, Opera et Firefox. Sur la fiche d'un produit, un clic sur l'icône I Want This ouvre l'envie déjà remplie, avec l'image et le prix, même sur les magasins qui bloquent la lecture automatique.</p>
<h3>Depuis le téléphone</h3>
<p>Sur Android, installez I Want This sur l'écran d'accueil : il apparaît alors dans le menu « Partager » des applis des marques. Sur iPhone, copiez le lien du produit puis collez-le dans I Want This. Le site s'utilise dans le navigateur, sans application à télécharger.</p>
<h3>Organisez vos envies</h3>
<p>Rassemblez plusieurs liens sous une même envie (plusieurs modèles au choix, une collection), mettez vos préférées en favori, triez et passez de la vue liste à la galerie.</p>
</section>
<section>
<h2>2. Partagez-la en un lien</h2>
<p>Envoyez le lien de votre liste par WhatsApp, par e-mail ou par message, avec un texte et une image prêts. Vos proches se connectent et voient vos envies, sur ordinateur comme sur téléphone. Votre liste apparaît ensuite dans leurs « Listes de mes proches ».</p>
${shot('partager-1', "Fenêtre « Partager ma liste » avec le lien à copier, l'aperçu de la carte « La liste d'envies de Léa » et le message prêt à envoyer", 'Le lien, la carte et le message sont prêts à envoyer.')}
</section>
<section>
<h2>3. Vos proches achètent, sans doublon</h2>
<p>Sur votre liste, un proche indique « Acheté » après son achat et choisit l'occasion. Les autres invités le voient aussitôt : plus jamais deux fois le même cadeau. La page « À offrir » rassemble tout ce qu'il a acheté, pour qui et pour quelle date.</p>
${shot('offrir-2-liste', "La liste d'envies de Marc vue par un proche : une envie marquée « Vous · Acheté », une autre « À offrir » avec le choix « Je vais l'acheter » ou « Déjà acheté »", "Chez un proche : chaque envie indique si elle est déjà prise.")}
</section>
<section>
<h2>4. La surprise reste entière</h2>
<p>Vous ne voyez jamais ce qu'on vous offre avant le jour J. Ce n'est pas seulement caché à l'écran : c'est protégé par le serveur. Le lendemain de la date de remise, un bandeau vous permet de voir qui vous a offert quoi, puis les cadeaux reçus sont rangés dans vos archives.</p>
${shot('surprise-1', "Ma liste d'envies vue par son propriétaire : chaque envie porte la mention « Surprise », aucun achat n'est visible", 'Le propriétaire ne voit que « Surprise » à côté de ses envies.')}
</section>
<section>
<h2>Événements : Noël, anniversaire, crémaillère…</h2>
<p>Un événement réunit des proches : chacun voit les listes des autres. Créez-le avec un nom et une date (et si vous voulez une heure, un lieu, une image), puis invitez par un lien ou par e-mail. Rien n'est partagé avant l'accord de chaque invité. Un événement peut aussi avoir un <a href="/tirage-au-sort/">tirage au sort</a>, et vous pouvez y ajouter les <a href="/listes-enfants/">listes de vos enfants</a>.</p>
</section>`,
    faq: [
      ['Est-ce gratuit ?', 'Oui. Créer un compte, une liste, des événements et un tirage au sort ne coûte rien.'],
      ['Mes proches doivent-ils créer un compte ?', "Oui, c'est rapide et gratuit. C'est ce qui permet de savoir qui a acheté quoi, tout en le cachant au propriétaire de la liste."],
      ["Puis-je savoir ce qu'on m'offre ?", "Non, volontairement. Les achats ne deviennent visibles pour vous que le lendemain de la date de remise du cadeau, choisie par la personne qui achète."],
      ['Avec quels magasins ça marche ?', "Avec n'importe quel site : on colle simplement le lien du produit. Quand le magasin bloque la lecture automatique, l'extension du navigateur ou la saisie à la main prennent le relais."],
      ['Pourquoi des liens « partenaires » ?', 'Certains liens vers des magasins peuvent rapporter une petite commission au site. Le prix pour vous ne change pas.'],
    ],
  },
  {
    slug: 'tirage-au-sort',
    short: 'Tirage au sort (Secret Santa)', teaser: 'Un tirage en famille avec exclusions, résultat secret.', image: 'tirage-2',
    title: 'Tirage au sort de Noël en ligne (Secret Santa) | I Want This',
    description: "Tirage au sort de Noël en ligne : exclusions (couples, frères et sœurs), résultat secret même pour l'organisateur, liste d'envies de la personne tirée. Gratuit.",
    kicker: 'Secret Santa',
    h1: 'Tirage au sort de Noël en famille, avec exclusions',
    lead: "Avec un tirage au sort (« Secret Santa » ou « Père Noël secret »), chacun offre un cadeau à une seule personne. Sur I Want This, le tirage se fait dans un événement : chacun découvre qui il doit gâter et voit directement sa liste d'envies.",
    body: `<section>
<h2>Organiser un tirage au sort en 4 étapes</h2>
<ol class="steps">
<li><strong>Créez un événement</strong> (Noël, Saint-Nicolas, fête de fin d'année…) avec un nom et une date, puis invitez vos proches par un lien ou par e-mail.</li>
<li><strong>Ajoutez un tirage</strong> depuis la page de l'événement, donnez-lui un nom et cochez les participants : des invités, et aussi des listes d'enfants.</li>
<li><strong>Ajoutez des exclusions</strong> si besoin : un couple ne pourra pas se tirer. Avec « Ajouter un groupe », excluez d'un coup plusieurs personnes entre elles, par exemple des frères et sœurs.</li>
<li><strong>Lancez le tirage.</strong> Chaque participant touche « Découvrir à qui j'offre » et accède à la liste d'envies de la personne tirée.</li>
</ol>
${shot('tirage-groupe', "Fenêtre « Modifier le tirage » : choix des participants, exclusion entre Marc et Julie, et groupe Marc et Paul exclus entre eux", 'Participants et exclusions, y compris par groupe.')}
</section>
<section>
<h2>Un résultat vraiment secret</h2>
<p>Chacun ne voit que son propre résultat, organisateur compris : personne, même celui qui a lancé le tirage, ne connaît les autres paires. Pour une liste d'enfant, c'est le parent qui voit le résultat.</p>
${shot('tirage-2', "Événement « Noël en famille » tiré le 10 novembre : encart « À qui allez-vous offrir ? C'est secret : vous seul le verrez » et 4 participants", 'Chaque participant découvre seul la personne à qui il offre.')}
</section>
<section>
<h2>Plusieurs tirages dans un même événement</h2>
<p>Idéal pour les grandes familles : un événement peut avoir plusieurs tirages, par exemple « Les parents » et « Les enfants ». Une même personne peut participer à plusieurs tirages.</p>
</section>
<section>
<h2>Le tirage et la liste d'envies, au même endroit</h2>
<p>Après le tirage, plus besoin de demander « qu'est-ce qui lui ferait plaisir ? » : la liste d'envies de la personne tirée est à un clic, avec les liens, les images et les prix. Les autres cadeaux restent visibles pour tous les invités, et chacun indique ce qu'il achète pour éviter les doublons. <a href="/comment-ca-marche/">Voir comment fonctionnent les listes</a>.</p>
</section>`,
    faq: [
      ['Le tirage au sort est-il gratuit ?', 'Oui, comme tout le site.'],
      ["L'organisateur voit-il qui a tiré qui ?", 'Non. Chacun, organisateur compris, ne voit que la personne à qui il doit offrir un cadeau.'],
      ['Peut-on empêcher deux personnes de se tirer ?', "Oui : ajoutez une exclusion pour chaque paire à éviter (un couple), ou un groupe de personnes qui ne doivent pas tomber les unes sur les autres (des frères et sœurs), avant de lancer le tirage."],
      ['Faut-il être tous au même endroit ?', 'Non. Le tirage se fait en ligne : chacun découvre son résultat sur son téléphone ou son ordinateur, quand il veut.'],
      ['Les enfants peuvent-ils participer ?', "Oui. Les listes d'enfants tenues par un parent peuvent être cochées comme participants ; le parent voit alors le résultat à leur place."],
    ],
  },
  {
    slug: 'listes-enfants',
    short: "Listes d'enfants", teaser: "La liste de votre enfant, tenue depuis votre compte.", image: 'enfant-3-liste',
    title: "Liste de cadeaux pour enfant, tenue par un parent | I Want This",
    description: "Créez la liste de cadeaux de votre enfant depuis votre compte, sans e-mail pour lui. Vos proches indiquent ce qu'ils achètent, sans doublon. Gratuit.",
    kicker: "Listes d'enfants",
    h1: "Une liste de cadeaux pour votre enfant, sans e-mail",
    lead: "Votre enfant n'a pas d'adresse e-mail ? Tenez sa liste d'envies depuis votre propre compte. Vos proches la voient comme les autres listes, et vous pouvez la remplir à côté de lui sans rien dévoiler de ce qui a déjà été acheté.",
    body: `<section>
<h2>Créer la liste de votre enfant</h2>
<ol class="steps">
<li>Dans « Ma liste », ouvrez le menu <strong>⋯</strong> puis <strong>Ajouter un enfant ou un proche sans compte</strong>.</li>
<li>Indiquez son prénom (l'âge est facultatif) et choisissez la couleur de sa pastille.</li>
<li>Cochez <strong>Partager dans mes événements</strong> pour que vos invités voient sa liste.</li>
</ol>
${shot('enfant-3-liste', "La liste d'envies de Tom, 7 ans, gérée par un parent : livre sur les dinosaures, trottinette 3 roues, caserne de pompiers en briques ; pastilles Moi et Tom en haut", "La liste de Tom, 7 ans, tenue par son parent.")}
</section>
<section>
<h2>Remplir la liste avec lui, sans gâcher la surprise</h2>
<p>Des pastilles en haut de la page passent de votre liste à celle de votre enfant. Sur sa liste, les achats sont toujours cachés : vous pouvez la remplir à côté de lui. Pour voir ce qui a été acheté, ou marquer vous-même un cadeau « Acheté », touchez « voir les achats ».</p>
<p>Quand vous ajoutez une envie (depuis le site, l'extension du navigateur ou le bouton Partager d'une appli), choisissez « Pour qui ? » : votre liste ou celle de votre enfant. Le site retient la dernière utilisée.</p>
</section>
<section>
<h2>Dans les événements et le tirage au sort</h2>
<p>La liste de votre enfant apparaît dans les événements de famille avec sa propre carte, « liste tenue par » vous. Elle peut aussi participer à un <a href="/tirage-au-sort/">tirage au sort</a> : c'est alors vous qui voyez à qui votre enfant offre un cadeau.</p>
</section>`,
    faq: [
      ["Mon enfant a-t-il besoin d'un compte ?", "Non. Sa liste est tenue depuis le compte d'un parent, sans e-mail pour l'enfant."],
      ['Combien de listes d’enfants puis-je créer ?', "Jusqu'à 10 listes d'enfants par compte."],
      ['Les proches voient-ils la liste de mon enfant ?', "Oui, dans les événements où vous l'avez partagée, comme n'importe quelle liste : ils indiquent ce qu'ils achètent et évitent les doublons."],
    ],
  },
  {
    slug: 'liste-de-noel',
    short: 'Liste de Noël', teaser: 'Votre liste de Noël et de Saint-Nicolas, partagée en famille.', image: 'event-2-detail',
    title: 'Liste de Noël en ligne à partager en famille | I Want This',
    description: "Faites votre liste de Noël et de Saint-Nicolas en ligne et partagez-la en un lien : vos proches indiquent ce qu'ils achètent, sans doublon. Gratuit.",
    kicker: 'Noël · Saint-Nicolas',
    h1: 'Votre liste de Noël en ligne, à partager en famille',
    lead: "Fini les listes envoyées par message que personne ne retrouve, et les deux mêmes boîtes de LEGO sous le sapin. Sur I Want This, chacun fait sa liste de Noël en ligne, la famille la consulte au même endroit et indique ce qu'elle achète.",
    body: `<section>
<h2>Pourquoi une liste de Noël en ligne ?</h2>
<p>Une liste sur papier ou dans un groupe WhatsApp ne dit pas qui a déjà acheté quoi. Résultat : des cadeaux en double, ou des coups de fil pour se mettre d'accord. Avec une liste partagée, chaque proche indique « Acheté » : les autres le voient tout de suite. Vous, vous ne voyez rien, et la surprise reste entière jusqu'au lendemain de Noël.</p>
</section>
<section>
<h2>Faire sa liste de Noël en 3 étapes</h2>
<ol class="steps">
<li><strong>Ajoutez vos envies</strong> en collant le lien du produit (l'image et le prix arrivent tout seuls), ou notez une simple idée : « un livre de cuisine italienne », « un pull taille M ».</li>
<li><strong>Créez l'événement « Noël en famille »</strong> avec la date, l'heure et le lieu du réveillon, puis invitez la famille par un lien ou par e-mail.</li>
<li><strong>Chacun voit les listes des autres</strong> dans l'événement, choisit un cadeau et le marque « Acheté » : plus de doublon.</li>
</ol>
${shot('event-2-detail', "Événement « Noël en famille » du jeudi 24 décembre 2026 à 19h00, chez Léa à Bruxelles, avec l'encadré « Mes listes dans cet événement »", "Un événement « Noël en famille » réunit les listes de tous les invités.")}
</section>
<section>
<h2>Saint-Nicolas et Noël, chacun sa date</h2>
<p>En Belgique, les enfants reçoivent souvent des cadeaux à la Saint-Nicolas, le 6 décembre, puis à Noël. Créez un événement pour chaque fête : quand un proche marque un cadeau acheté, il choisit l'occasion. La surprise est gardée jusqu'au lendemain de la bonne date.</p>
<p>Les plus petits n'ont pas d'adresse e-mail ? Tenez leur <a href="/listes-enfants/">liste d'enfant</a> depuis votre compte : vous pouvez la remplir à côté d'eux sans rien dévoiler.</p>
</section>
<section>
<h2>Un seul cadeau chacun ? Faites un tirage au sort</h2>
<p>Dans les grandes familles, on offre souvent un cadeau à une seule personne tirée au sort. Ajoutez un <a href="/tirage-au-sort/">tirage au sort</a> à votre événement de Noël, avec des exclusions pour les couples : chacun découvre en secret à qui il offre, et voit directement sa liste d'envies.</p>
</section>`,
    faq: [
      ['Quand faire sa liste de Noël ?', "Le plus tôt possible : début novembre, vos proches ont le temps de commander, et vous pouvez compléter la liste jusqu'au dernier moment."],
      ['Avec quels magasins ça marche ?', "Avec n'importe quel site : on colle le lien du produit. Une idée sans lien fonctionne aussi."],
      ['Ma famille doit-elle installer une application ?', "Non. I Want This s'utilise dans le navigateur, sur téléphone comme sur ordinateur. Chacun crée un compte gratuit pour indiquer ce qu'il achète."],
      ['Est-ce gratuit ?', 'Oui, la liste, les événements et le tirage au sort sont gratuits.'],
    ],
  },
  {
    slug: 'liste-anniversaire',
    short: "Liste d'anniversaire", teaser: "Une liste d'anniversaire en ligne, sans cadeau en double.", image: 'liste-3-liste',
    title: "Liste d'anniversaire en ligne, sans doublon | I Want This",
    description: "Créez votre liste d'anniversaire en ligne et invitez vos proches par un lien : ils indiquent ce qu'ils achètent, sans doublon, la surprise reste entière.",
    kicker: 'Anniversaire',
    h1: "Une liste d'anniversaire en ligne, sans cadeau en double",
    lead: "« Qu'est-ce qui te ferait plaisir ? » : avec une liste d'anniversaire en ligne, vos proches ont la réponse, avec les liens, les images et les prix. Et ils savent ce que les autres ont déjà pris.",
    body: `<section>
<h2>Créer votre liste d'anniversaire</h2>
<p>Ajoutez vos envies en collant le lien d'un produit, depuis n'importe quel magasin. Précisez la taille, la couleur ou le modèle. Votre liste sert pour tous les anniversaires suivants : il suffit de la tenir à jour.</p>
${shot('liste-3-liste', "Ma liste d'envies : casque sans fil à 129 €, baskets en toile pointure 39 à 69 €, pull col rond taille M à 39,95 €, chaque envie marquée « Surprise »", "Votre liste, avec les prix et les magasins.")}
</section>
<section>
<h2>Inviter à l'anniversaire en un lien</h2>
<p>Créez un événement « Anniversaire de… » avec la date, l'heure et le lieu, puis partagez le lien d'invitation par WhatsApp ou par e-mail. L'aperçu affiche le nom de la fête et sa date. Les invités rejoignent l'événement et voient votre liste.</p>
${shot('event-3-inviter', "Fenêtre « Inviter des proches » : lien d'invitation à copier ou partager, et invitation par nom et adresse e-mail", 'Invitez par un lien ou par e-mail.')}
</section>
<section>
<h2>Pas de doublon, et la surprise jusqu'au bout</h2>
<p>Chaque invité indique ce qu'il achète : les autres le voient aussitôt. Vous, vous ne voyez rien avant le lendemain de la date de remise, donc même si la fête a lieu le soir, rien n'est gâché.</p>
</section>
<section>
<h2>L'anniversaire d'un enfant</h2>
<p>Pour l'anniversaire de votre enfant, tenez sa <a href="/listes-enfants/">liste d'enfant</a> depuis votre compte et invitez la famille, ou les parents de ses copains, à l'événement. Fini les trois mêmes jeux de société à la fête.</p>
</section>`,
    faq: [
      ["Faut-il refaire une liste à chaque anniversaire ?", "Non. Votre liste d'envies reste la même toute l'année : vous la complétez au fil de vos idées, et les cadeaux reçus sont rangés dans vos archives."],
      ['Les invités doivent-ils créer un compte ?', "Oui, gratuitement. C'est ce qui permet d'indiquer « Acheté » tout en le cachant au propriétaire de la liste."],
      ["Puis-je voir qui m'a offert quoi ?", "Oui, le lendemain de la date de remise : un bandeau vous montre les cadeaux reçus et qui les a offerts."],
    ],
  },
  {
    slug: 'secret-santa-bureau',
    short: 'Secret Santa au bureau', teaser: "Un tirage au sort entre collègues, en ligne et sans papier.", image: 'event-4-rejoindre',
    title: 'Secret Santa au bureau : tirage au sort en ligne | I Want This',
    description: "Organisez le Secret Santa de votre équipe en ligne : un lien d'invitation, un tirage au sort secret et la liste d'envies de chaque collègue. Gratuit.",
    kicker: 'Entre collègues',
    h1: 'Organiser un Secret Santa au bureau, en ligne et gratuit',
    lead: "Plus besoin de petits papiers dans un bonnet, ni de réunir tout le monde dans la même pièce. Avec I Want This, chaque collègue rejoint l'événement par un lien, le tirage se fait en ligne, et chacun découvre en secret à qui il offre.",
    body: `<section>
<h2>Le Secret Santa d'équipe en 5 étapes</h2>
<ol class="steps">
<li><strong>Créez un événement</strong>, par exemple « Secret Santa de l'équipe · 20 € », avec la date de la remise des cadeaux. Indiquer le budget dans le nom le rend visible de tous.</li>
<li><strong>Partagez le lien d'invitation</strong> dans Teams, Slack ou par e-mail. Chaque collègue rejoint l'événement en un clic.</li>
<li><strong>Chacun ajoute quelques idées</strong> à sa liste d'envies : un livre, une tasse, un jeu… Fini les cadeaux « au hasard ».</li>
<li><strong>Ajoutez un tirage</strong> et cochez les participants, puis lancez-le.</li>
<li><strong>Chacun découvre à qui il offre</strong> et voit directement la liste d'envies de ce collègue.</li>
</ol>
${shot('event-4-rejoindre', "Page d'invitation « Léa vous invite » : événement avec date et lieu, boutons « Rejoindre l'événement » et « Non merci »", "Vos collègues rejoignent l'événement depuis le lien.")}
</section>
<section>
<h2>Un tirage vraiment secret, même pour l'organisateur</h2>
<p>Personne ne voit les paires des autres, pas même la personne qui a lancé le tirage. L'organisateur peut donc participer comme tout le monde. Rien n'est partagé avec un collègue avant qu'il accepte de rejoindre l'événement.</p>
</section>
<section>
<h2>Télétravail et équipes réparties</h2>
<p>Le tirage se fait en ligne : chacun découvre son résultat sur son téléphone ou son ordinateur, au bureau ou à la maison. Pour plusieurs équipes, créez plusieurs tirages dans le même événement.</p>
</section>`,
    faq: [
      ['Mes collègues doivent-ils créer un compte ?', 'Oui, un compte gratuit, créé en quelques instants avec une adresse e-mail ou un compte Google.'],
      ["L'organisateur connaît-il les résultats ?", "Non. Chacun ne voit que la personne à qui il offre, organisateur compris."],
      ['Peut-on fixer un budget ?', "Indiquez-le dans le nom de l'événement (par exemple « Secret Santa · 20 € ») : tout le monde le voit en rejoignant."],
      ['Est-ce gratuit ?', 'Oui, entièrement, sans publicité.'],
    ],
  },
]

for (const p of PAGES) {
  const dir = path.join(ROOT, p.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.html'), page(p))
}

const urls = ['/', ...PAGES.map(p => `/${p.slug}/`), '/presse.html', '/privacy.html']
const today = new Date().toISOString().slice(0, 10)
await writeFile(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`)
console.log('ok :', urls.join(' '))
