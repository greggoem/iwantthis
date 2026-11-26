// Extraction du titre, de l'image et du prix depuis le HTML d'une fiche produit.
// Fichier volontairement sans API Deno : il est testé sous Node.

export interface Preview {
  found: boolean
  title?: string
  image?: string
  /** autres photos du produit trouvées sur la page (la première est « image ») */
  images?: string[]
  price?: number
  currency?: string
  site?: string
  reason?: string
  /** lien complet et nettoyé, quand il diffère du lien envoyé (lien court résolu, pistage retiré) */
  url?: string
}

/** Raccourcisseurs de liens des magasins (le vrai lien est obtenu en suivant la redirection) */
export const SHORT_HOSTS = ['amzn.eu', 'amzn.to', 'a.co', 'amzn.asia',
  // partage depuis l'appli Google / Google Lens / Chrome sur mobile
  'share.google', 'search.app', 'goo.gl', 'g.co']

export function isShortLink(u: URL): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, '')
  return SHORT_HOSTS.includes(h) || googleRedirectTarget(u) !== undefined ||
    // page d'attente de Google quand share.google est ouvert depuis un serveur
    (/^(www\.)?google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/share.google')
}

/** Lien de redirection Google (google.xx/url?q=…, /aclk?…&adurl=…, /imgres?imgrefurl=…) → adresse de destination */
export function googleRedirectTarget(u: URL): string | undefined {
  if (!/^(www\.)?google\.[a-z.]+$/i.test(u.hostname) || !/^\/(url|aclk|imgres)$/.test(u.pathname)) return undefined
  // /imgres : résultat de recherche d'images → page d'origine de l'image
  const dest = u.searchParams.get('imgrefurl') || u.searchParams.get('q') || u.searchParams.get('url') || u.searchParams.get('adurl')
  return dest && /^https?:\/\//i.test(dest) ? dest : undefined
}

/** Image inutilisable : pixel de suivi publicitaire (Amazon « fls-… /uedata »), image 1×1, espaceur… */
export function isJunkImage(url: string | null | undefined): boolean {
  if (!url) return false
  return /(^|\.)fls-[a-z]+\.amazon\.|\/uedata|\/batch\/\d+\/OP\/|[\/_.-](1x1|spacer|pixel|transparent)\.(gif|png)\b|^data:/i.test(url)
}

/** Fiche Amazon → https://www.amazon.xx/dp/ASIN (retire ref=, tag= d'autrui, suivi…). Autres liens : inchangés. */
export function cleanProductUrl(raw: string): string {
  let u: URL
  try { u = new URL(raw) } catch { return raw }
  const host = u.hostname.toLowerCase().replace(/^(www|smile|m)\./, '')
  if (!/^amazon\.(com|co\.uk|com\.be|fr|nl|de|it|es|se|pl|com\.tr|ca|co\.jp)$/.test(host)) return raw
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i)
  return m ? `https://www.${host}/dp/${m[1].toUpperCase()}` : raw
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', rsquo: '’', lsquo: '‘', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç' }

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}
function safeChar(n: number): string {
  try { return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '' } catch { return '' }
}

/** « 1.299,00 », « 1,299.00 », « 89,90 € », « 89.90 » → nombre */
export function parsePrice(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'number') return raw > 0 && raw < 1e6 ? Math.round(raw * 100) / 100 : undefined
  // « 21€89 » (affichage d'Amazon.fr) : le symbole tient lieu de virgule
  let s = String(raw).replace(/[\s\u00a0\u202f]/g, '').replace(/(\d)(?:€|EUR|\$|£)(\d{2})(?!\d)/gi, '$1,$2').replace(/[^\d.,]/g, '')
  if (!s || !/\d/.test(s)) return undefined
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot)
    const intPart = s.slice(0, dec).replace(/[.,]/g, '')
    s = intPart + '.' + s.slice(dec + 1)
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const count = s.split(sep).length - 1
    const after = s.length - s.lastIndexOf(sep) - 1
    if (count > 1 || after === 3) s = s.split(sep).join('')   // séparateur de milliers
    else s = s.replace(sep, '.')
  }
  const n = parseFloat(s)
  return isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) / 100 : undefined
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

function metaMap(html: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /<meta\s[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const a = attrs(m[0])
    const key = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (key && a.content && !(key in map)) map[key] = a.content
  }
  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, visit: (o: any) => void, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, depth + 1); return }
  visit(node)
  for (const k of Object.keys(node)) walk(node[k], visit, depth + 1)
}

function jsonLd(html: string): { price?: number; currency?: string; image?: string; images: string[]; name?: string } {
  const res: { price?: number; currency?: string; image?: string; images: string[]; name?: string } = { images: [] }
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let data: unknown
    try { data = JSON.parse(m[1].trim()) } catch { continue }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walk(data, (o: any) => {
      const type = ([] as string[]).concat(o['@type'] ?? []).map(String)
      if (type.includes('Product')) {
        if (!res.name && typeof o.name === 'string') res.name = o.name
        for (const im of ([] as unknown[]).concat(o.image ?? [])) {
          // deno-lint-ignore no-explicit-any
          const u = typeof im === 'string' ? im : (im as any)?.url ?? (im as any)?.contentUrl
          if (typeof u === 'string') { if (!res.image) res.image = u; res.images.push(u) }
        }
      }
      if (type.includes('Offer') || type.includes('AggregateOffer') || 'priceCurrency' in o) {
        if (res.price === undefined) {
          const p = parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price)
          if (p !== undefined) {
            res.price = p
            const c = o.priceCurrency ?? o.priceSpecification?.priceCurrency
            if (typeof c === 'string') res.currency = c.toUpperCase()
          }
        }
      }
    })
  }
  return res
}

function microdataPrice(html: string): number | undefined {
  const a = html.match(/itemprop=["']price["'][^>]*\scontent=["']([^"']+)["']/i)
  const b = html.match(/\scontent=["']([^"']+)["'][^>]*itemprop=["']price["']/i)
  return parsePrice((a ?? b)?.[1])
}

function absoluteHttp(u: string | undefined, base: string): string | undefined {
  if (!u) return undefined
  try {
    const url = new URL(decodeEntities(u).trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch { return undefined }
}

/** Pages Amazon : balises propres au site, utilisées seulement si les métadonnées standard manquent */
/** Toutes les photos Amazon de la galerie produit (« hiRes » puis « large ») */
function amazonGallery(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/"(?:hiRes|large)"\s*:\s*"(https:[^"]+)"/g)) out.push(m[1])
  return out
}

function amazonFallback(html: string, finalUrl: string): { title?: string; image?: string; price?: number; currency?: string } {
  if (!/(^|\.)amazon\./i.test(new URL(finalUrl).hostname)) return {}
  const rawTitle = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
  const title = rawTitle ? decodeEntities(rawTitle.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : undefined
  let image = html.match(/id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i)?.[1]
  if (!image) {
    const dyn = html.match(/data-a-dynamic-image=["']([^"']+)["']/i)?.[1]
    if (dyn) { try { image = Object.keys(JSON.parse(decodeEntities(dyn)))[0] } catch { /* ignoré */ } }
  }
  const priceText = [...html.matchAll(/class=["']a-offscreen["'][^>]*>\s*([^<]+?)\s*</gi)].map((m) => m[1]).find((t) => /\d/.test(t) && /[€$£]|EUR/.test(t))
  return { title, image, price: parsePrice(priceText), currency: priceText ? (/€|EUR/.test(priceText) ? 'EUR' : undefined) : undefined }
}

/** Page « êtes-vous un robot ? » renvoyée à la place de la fiche */
export function looksBlocked(html: string): boolean {
  return /captchacharacters|Type the characters you see|Saisissez les caract[eè]res|are you a robot|Access Denied|Just a moment\.\.\./i.test(html.slice(0, 60000))
}

export function parseProductPage(html: string, finalUrl: string): Preview {
  if (looksBlocked(html)) {
    return { found: false, site: new URL(finalUrl).hostname.replace(/^www\./, ''), reason: 'Le magasin bloque la lecture automatique (vérification anti-robot)' }
  }
  const meta = metaMap(html)
  const ld = jsonLd(html)
  const amz = amazonFallback(html, finalUrl)

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = (meta['og:title'] || ld.name || amz.title || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag) : '')).replace(/\s+/g, ' ').trim().slice(0, 200) || undefined

  const image = [meta['og:image:secure_url'], meta['og:image'], amz.image, meta['twitter:image'], meta['twitter:image:src'], ld.image]
    .map((c) => absoluteHttp(c, finalUrl)).find((c) => c && !isJunkImage(c))

  // autres photos proposées au choix : toutes les og:image, galerie JSON-LD, galerie Amazon
  const allOg = [...html.matchAll(/<meta\s[^>]*>/gi)].map((m) => attrs(m[0]))
    .filter((a) => /^(og:image(:secure_url|:url)?|twitter:image(:src)?)$/i.test(a.property || a.name || '')).map((a) => a.content)
  const amzAll = /(^|\.)amazon\./i.test(new URL(finalUrl).hostname) ? amazonGallery(html) : []
  const images = uniqueImages([image, ...allOg, ...ld.images, ...amzAll].map((c) => absoluteHttp(c, finalUrl)))

  let price = parsePrice(meta['product:price:amount'] ?? meta['og:price:amount'] ?? meta['price'])
  let currency: string | undefined = (meta['product:price:currency'] ?? meta['og:price:currency'] ?? meta['pricecurrency'])?.toUpperCase()
  if (price === undefined && ld.price !== undefined) { price = ld.price; currency = currency ?? ld.currency }
  if (price === undefined) price = microdataPrice(html)
  if (price === undefined && amz.price !== undefined) { price = amz.price; currency = currency ?? amz.currency }
  if (price !== undefined && !currency) currency = ld.currency

  const found = Boolean(image || price !== undefined || title)
  return { found, title, image, images: images.length > 1 ? images : undefined, price, currency, site: new URL(finalUrl).hostname.replace(/^www\./, '') }
}

/** Liste d'images sans doublons (même fichier en plusieurs tailles compris), sans pixels de suivi, au plus 12 */
export function uniqueImages(list: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of list) {
    if (!u || isJunkImage(u) || !/^https?:/i.test(u)) continue
    // Amazon : « …/I/71abc._AC_SX679_.jpg » et « …/I/71abc.jpg » sont la même photo
    const k = u.replace(/\._[A-Z0-9_,]+_\./i, '.').replace(/[?#].*$/, '').replace(/^http:/, 'https:')
    if (seen.has(k)) continue
    seen.add(k); out.push(u)
    if (out.length >= 12) break
  }
  return out
}
