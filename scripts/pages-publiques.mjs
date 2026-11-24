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
footer{padding:1.5rem 0 3rem;color:var(--muted);font-size:.9rem;border-top:1px solid var(--line)}
footer a{color:var(--muted)}`

const NAV = [
  ['/', 'Accueil'], ['/comment-ca-marche/', 'Comment ça marche'], ['/tirage-au-sort/', 'Tirage au sort'],
  ['/listes-enfants/', "Listes d'enfants"], ['/presse.html', 'Presse'], ['/privacy.html', 'Confidentialité'],
]

function page({ slug, title, description, kicker, h1, lead, body, faq = [] }) {
  const url = `${SITE}/${slug}/`
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url, description, inLanguage: 'fr',
      isPartOf: { '@type': 'WebSite', name: 'I Want This', url: SITE + '/' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'I Want This', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: h1, item: url },
    ] },
  ]
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
<meta property="og:image" content="${SITE}/og.png">
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
    title: "Comment ça marche — liste d'envies à partager en famille | I Want This",
    description: "Créez votre liste d'envies en collant un lien, partagez-la en un clic, vos proches indiquent ce qu'ils achètent : pas de cadeau en double et la surprise reste entière. Gratuit.",
    kicker: 'Guide',
    h1: "Comment ça marche : une liste d'envies à partager, sans doublon",
    lead: "I Want This est un site gratuit de listes de cadeaux. Chacun crée sa liste d'envies, la partage par un lien, et ses proches indiquent ce qu'ils achètent. Les autres le voient tout de suite, mais le propriétaire de la liste ne découvre rien avant la date de remise.",
    body: `<section>
<h2>1. Créez votre liste d'envies</h2>
<p>Collez le lien d'un produit copié depuis le site du magasin : le nom, l'image et le prix sont récupérés pour vous. Précisez la taille ou la couleur, ou ajoutez une simple idée sans lien.</p>
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
</section>
<section>
<h2>3. Vos proches achètent, sans doublon</h2>
<p>Sur votre liste, un proche indique « Acheté » après son achat et choisit l'occasion. Les autres invités le voient aussitôt : plus jamais deux fois le même cadeau. La page « À offrir » rassemble tout ce qu'il a acheté, pour qui et pour quelle date.</p>
</section>
<section>
<h2>4. La surprise reste entière</h2>
<p>Vous ne voyez jamais ce qu'on vous offre avant le jour J. Ce n'est pas seulement caché à l'écran : c'est protégé par le serveur. Le lendemain de la date de remise, un bandeau vous permet de voir qui vous a offert quoi, puis les cadeaux reçus sont rangés dans vos archives.</p>
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
    title: 'Tirage au sort de Noël (Secret Santa) avec exclusions et listes d’envies | I Want This',
    description: "Organisez un tirage au sort Secret Santa en famille ou entre amis : exclusions (couples, frères et sœurs), plusieurs tirages par événement, résultat secret et accès direct à la liste d'envies de la personne tirée. Gratuit.",
    kicker: 'Secret Santa',
    h1: 'Tirage au sort de Noël en famille, avec exclusions',
    lead: "Avec un tirage au sort (« Secret Santa » ou « Père Noël secret »), chacun offre un cadeau à une seule personne. Sur I Want This, le tirage se fait dans un événement : chacun découvre qui il doit gâter et voit directement sa liste d'envies.",
    body: `<section>
<h2>Organiser un tirage au sort en 4 étapes</h2>
<ol class="steps">
<li><strong>Créez un événement</strong> (Noël, Saint-Nicolas, fête de fin d'année…) avec un nom et une date, puis invitez vos proches par un lien ou par e-mail.</li>
<li><strong>Ajoutez un tirage</strong> depuis la page de l'événement, donnez-lui un nom et cochez les participants : des invités, et aussi des listes d'enfants.</li>
<li><strong>Ajoutez des exclusions</strong> si besoin : un couple, un frère et une sœur… ces paires ne pourront pas se tirer l'une l'autre.</li>
<li><strong>Lancez le tirage.</strong> Chaque participant touche « Découvrir à qui j'offre » et accède à la liste d'envies de la personne tirée.</li>
</ol>
</section>
<section>
<h2>Un résultat vraiment secret</h2>
<p>Chacun ne voit que son propre résultat, organisateur compris : personne, même celui qui a lancé le tirage, ne connaît les autres paires. Pour une liste d'enfant, c'est le parent qui voit le résultat.</p>
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
      ['Peut-on empêcher deux personnes de se tirer ?', 'Oui : ajoutez une exclusion pour chaque paire à éviter (un couple, des frères et sœurs) avant de lancer le tirage.'],
      ['Les enfants peuvent-ils participer ?', "Oui. Les listes d'enfants tenues par un parent peuvent être cochées comme participants ; le parent voit alors le résultat à leur place."],
    ],
  },
  {
    slug: 'listes-enfants',
    title: "Liste de cadeaux pour un enfant, tenue par ses parents | I Want This",
    description: "Créez la liste d'envies de votre enfant depuis votre compte, sans e-mail pour lui. Vos proches la voient et indiquent ce qu'ils achètent ; vous pouvez la remplir avec lui sans rien dévoiler. Gratuit.",
    kicker: "Listes d'enfants",
    h1: "Une liste de cadeaux pour votre enfant, sans e-mail",
    lead: "Votre enfant n'a pas d'adresse e-mail ? Tenez sa liste d'envies depuis votre propre compte. Vos proches la voient comme les autres listes, et vous pouvez la remplir à côté de lui sans rien dévoiler de ce qui a déjà été acheté.",
    body: `<section>
<h2>Créer la liste de votre enfant</h2>
<ol class="steps">
<li>Dans « Ma liste », ouvrez le menu <strong>⋯</strong> puis <strong>Ajouter une liste d'enfant</strong>.</li>
<li>Indiquez son prénom (l'âge est facultatif) et choisissez la couleur de sa pastille.</li>
<li>Cochez <strong>Partager dans mes événements</strong> pour que vos invités voient sa liste.</li>
</ol>
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
