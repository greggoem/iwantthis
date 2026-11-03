// I Want This : au clic sur l'icône, lit le produit de la page affichée (titre, image, prix)
// et ouvre votre site avec le formulaire d'ajout déjà rempli. Aucun identifiant n'est manipulé ici :
// la connexion se fait sur le site, comme d'habitude.
const api = globalThis.browser ?? globalThis.chrome
const DEFAULT_SITE = 'https://iwantthis.gift/'

// Exécutée DANS la page (doit rester autonome)
function readProduct() {
  var q = function (s) { return document.querySelector(s) }
  var m = function (n) { var e = q('meta[property="' + n + '"],meta[name="' + n + '"],meta[itemprop="' + n + '"]'); return (e && e.content) || '' }
  var P, C, L = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) { try { L.push(JSON.parse(s.textContent)) } catch (e) { /* JSON invalide : ignoré */ } })
  ;(function w(o, d) {
    if (!o || typeof o !== 'object' || d > 8) return
    if (Array.isArray(o)) { o.forEach(function (x) { w(x, d + 1) }); return }
    if (P === undefined && (o.price !== undefined || o.lowPrice !== undefined) && (o.priceCurrency || /Offer/.test(String(o['@type'] || '')))) {
      P = o.price !== undefined ? o.price : o.lowPrice; C = o.priceCurrency
    }
    for (var k in o) w(o[k], d + 1)
  })(L, 0)
  P = P || m('product:price:amount') || m('og:price:amount')
  C = C || m('product:price:currency')
  if (!P) { var a = q('.a-price .a-offscreen,#priceblock_ourprice'); if (a) P = a.textContent }
  var i = m('og:image') || (q('#landingImage') || {}).src || m('twitter:image') || ''
  var t = m('og:title') || (q('#productTitle') || {}).textContent || document.title
  return { u: location.href, t: (t || '').trim().slice(0, 200), i: i, p: String(P || ''), c: C || '' }
}

async function siteBase() {
  let site = DEFAULT_SITE
  try { const s = await api.storage.sync.get('site'); if (s && s.site) site = s.site } catch (e) { /* stockage indisponible */ }
  site = String(site).trim()
  if (!/^https?:\/\//i.test(site)) site = DEFAULT_SITE
  return site.replace(/#.*$/, '').replace(/\/?$/, '/')
}

api.action.onClicked.addListener(async function (tab) {
  const base = await siteBase()
  let data = null
  if (tab && tab.id !== undefined && /^https?:/i.test(tab.url || '')) {
    try {
      const res = await api.scripting.executeScript({ target: { tabId: tab.id }, func: readProduct })
      data = res && res[0] && res[0].result
    } catch (e) { data = { u: tab.url, t: tab.title || '', i: '', p: '', c: '' } }   // page protégée : on garde au moins l'adresse
  }
  const e = encodeURIComponent
  const url = data
    ? base + '#/?add=1&u=' + e(data.u) + '&t=' + e(data.t) + '&i=' + e(data.i) + '&p=' + e(data.p) + '&c=' + e(data.c)
    : base
  api.tabs.create({ url: url, index: tab && typeof tab.index === 'number' ? tab.index + 1 : undefined })
})
