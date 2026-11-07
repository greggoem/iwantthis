#!/usr/bin/env python3
"""
Génère les guides d'idées cadeaux (pages HTML statiques, lisibles par Google) à partir des fichiers JSON de ce dossier.

    python3 guides/build.py

Sorties (dans public/, copié tel quel par Vite) :
  - public/idees/<slug>/index.html  : un guide par fichier JSON
  - public/idees/index.html         : la liste des guides
  - public/sitemap.xml, public/robots.txt

Liens partenaires : les mêmes identifiants que la table Supabase `affiliate_programs` (programmes actifs uniquement).
Le bouton « Ajouter à ma liste » envoie le lien SANS identifiant partenaire : le site l'ajoute lui-même à l'affichage.
"""
import html
import json
import pathlib
from urllib.parse import quote, urlencode, urlsplit, urlunsplit, parse_qsl

SITE = "https://iwantthis.gift"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "idees"

# Programmes actifs (cf. table affiliate_programs) : domaine → (type, valeur)
AFFILIATES = {
    "amazon.com.be": ("param", "tag", "iwantthis016-21"),
    "amazon.fr": ("param", "tag", "iwantthis0e2-21"),
    "amazon.nl": ("param", "tag", "iwantthis05-21"),
    "coolblue.be": ("template", "https://www.awin1.com/cread.php?awinmid=85165&awinaffid=3144286&ued={url}"),
}

UMAMI = '<script defer src="https://cloud.umami.is/script.js" data-website-id="a914a95b-e74b-434e-905b-614f507be211" data-domains="iwantthis.gift"></script>'

e = lambda s: html.escape(str(s), quote=True)


def host(url: str) -> str:
    h = urlsplit(url).hostname or ""
    return h[4:] if h.startswith("www.") else h


def affiliate(url: str) -> str:
    rule = AFFILIATES.get(host(url))
    if not rule:
        return url
    if rule[0] == "param":
        p = urlsplit(url)
        q = [kv for kv in parse_qsl(p.query) if kv[0] != rule[1]] + [(rule[1], rule[2])]
        return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), ""))
    return rule[1].replace("{url}", quote(url, safe=""))


def add_link(url: str, name: str) -> str:
    return f"{SITE}/#/?add=1&u={quote(url, safe='')}&t={quote(name, safe='')}"


def page(title, description, canonical, body, jsonld=None):
    ld = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in (jsonld or []))
    return f"""<!doctype html>
<html lang="fr-BE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(canonical)}">
<meta name="theme-color" content="#fafaf9">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="I Want This">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/idees/guides.css">
{UMAMI}
{ld}
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28">I Want This</a>
  <nav><a href="/idees/">Idées cadeaux</a><a href="/">Créer ma liste</a></nav>
</header>
{body}
<footer>
  <p><strong>Liens partenaires.</strong> Certains liens de cette page sont des liens partenaires : le prix ne change pas pour vous, mais I Want This peut toucher une petite commission si vous achetez. En tant que Partenaire Amazon, I Want This réalise un bénéfice sur les achats remplissant les conditions requises.</p>
  <p>Les prix et la disponibilité changent souvent : seuls ceux affichés sur le site du magasin font foi.</p>
  <p><a href="/">I Want This</a> · <a href="/idees/">Idées cadeaux</a> · <a href="/privacy.html">Confidentialité</a></p>
</footer>
</div>
</body>
</html>
"""


def build_guide(g):
    canonical = f"{SITE}/idees/{g['slug']}/"
    parts = [f"""<p class="crumbs"><a href="/">Accueil</a> › <a href="/idees/">Idées cadeaux</a> › {e(g['title'])}</p>
<section class="hero">
  <span class="kicker">{e(g['kicker'])}</span>
  <h1>{e(g['title'])}</h1>
  {''.join(f'<p class="lede">{e(p)}</p>' if i == 0 else f'<p>{e(p)}</p>' for i, p in enumerate(g['intro']))}
  <p class="meta">Mis à jour le {e(g['updated_label'])} · {sum(len(s['items']) for s in g['sections'])} idées</p>
</section>
<aside class="box note">
  <h2>{e(g['tips_title'])}</h2>
  <ul>{''.join(f'<li>{t}</li>' for t in g['tips'])}</ul>
</aside>
<p class="meta">Budget : {e(g['budget_legend'])}</p>"""]
    items_ld = []
    n = 0
    for s in g["sections"]:
        cards = []
        for it in s["items"]:
            n += 1
            items_ld.append({"@type": "ListItem", "position": n, "name": it["name"], "url": it["url"]})
            cards.append(f"""<article class="card">
  <h3>{e(it['name'])}</h3>
  <ul class="tags"><li>{e(it['age'])}</li><li class="budget" title="Ordre de prix">{e(it['budget'])}</li><li>{e(host(it['url']))}</li></ul>
  <p>{e(it['text'])}</p>
  <div class="actions">
    <a class="btn btn-primary" href="{e(affiliate(it['url']))}" target="_blank" rel="sponsored nofollow noopener">Voir le prix</a>
    <a class="btn" href="{e(add_link(it['url'], it['name']))}">+ Ajouter à ma liste</a>
  </div>
</article>""")
        parts.append(f"""<section>
  <h2>{e(s['title'])}</h2>
  <p class="sub">{e(s['sub'])}</p>
  <div class="cards">{''.join(cards)}</div>
</section>""")
    parts.append("""<section class="cta">
  <h2>Faites la liste de votre enfant</h2>
  <p>Ajoutez ses envies en un clic, partagez la liste avec la famille : chacun indique ce qu'il offre, sans doublon et sans gâcher la surprise.</p>
  <a class="btn btn-accent" href="/">Créer ma liste gratuitement</a>
</section>""")
    if g.get("faq"):
        parts.append("<section><h2>Questions fréquentes</h2>" + "".join(
            f"<details><summary>{e(f['q'])}</summary><p>{e(f['a'])}</p></details>" for f in g["faq"]) + "</section>")
    jsonld = [
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "Idées cadeaux", "item": f"{SITE}/idees/"},
            {"@type": "ListItem", "position": 3, "name": g["title"], "item": canonical}]},
        {"@context": "https://schema.org", "@type": "ItemList", "name": g["title"], "itemListElement": items_ld},
    ]
    if g.get("faq"):
        jsonld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in g["faq"]]})
    out = OUT / g["slug"] / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page(g["seo_title"], g["description"], canonical, "\n".join(parts), jsonld), encoding="utf-8")
    return out


def build_index(guides):
    cards = "".join(f"""<a class="guide" href="/idees/{e(g['slug'])}/"><span class="kicker">{e(g['kicker'])}</span><strong>{e(g['title'])}</strong><span>{e(g['summary'])}</span></a>""" for g in guides)
    body = f"""<section class="hero">
  <span class="kicker">Guides</span>
  <h1>Idées cadeaux</h1>
  <p class="lede">Des sélections courtes et vérifiées, par occasion et par âge, pour trouver le bon cadeau ou remplir sa liste d'envies. D'autres guides arrivent bientôt.</p>
</section>
<div class="guides">{cards}</div>
<section class="cta">
  <h2>Une liste d'envies à partager ?</h2>
  <p>Créez votre liste, partagez-la avec vos proches : chacun indique ce qu'il offre, sans doublon et sans gâcher la surprise.</p>
  <a class="btn btn-accent" href="/">Créer ma liste gratuitement</a>
</section>"""
    (OUT / "index.html").write_text(page("Idées cadeaux par occasion et par âge · I Want This",
        "Guides d'idées cadeaux par occasion et par âge : Saint-Nicolas, Noël, anniversaires. Sélections vérifiées, disponibles en Belgique.",
        f"{SITE}/idees/", body), encoding="utf-8")


def build_sitemap(guides):
    urls = [(f"{SITE}/", None), (f"{SITE}/idees/", max(g["updated"] for g in guides))] + [(f"{SITE}/idees/{g['slug']}/", g["updated"]) for g in guides]
    xml = "".join(f"<url><loc>{u}</loc>{f'<lastmod>{d}</lastmod>' if d else ''}</url>" for u, d in urls)
    (ROOT / "public" / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{xml}</urlset>\n', encoding="utf-8")
    (ROOT / "public" / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")


if __name__ == "__main__":
    guides = sorted((json.loads(p.read_text(encoding="utf-8")) for p in pathlib.Path(__file__).parent.glob("*.json")), key=lambda g: g["updated"], reverse=True)
    for g in guides:
        print("guide :", build_guide(g).relative_to(ROOT))
    build_index(guides)
    build_sitemap(guides)
    print("index, sitemap.xml et robots.txt générés")
