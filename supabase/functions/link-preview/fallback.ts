// Solutions de secours quand la fiche produit ne donne pas d'image (site qui bloque la lecture, page sans og:image…).
// Partie pure (testée sous Node) + appels réseau injectés, pour garder les tests hors ligne.
import type { Preview } from './parse.ts'

export type JsonFetcher = (url: string, headers?: Record<string, string>) => Promise<unknown>
export type OkFetcher = (url: string) => Promise<boolean>

/** Lien qui pointe directement vers une image */
export function directImage(u: URL): string | undefined {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(u.pathname) ? u.toString() : undefined
}

/** Boutique Shopify : /products/<poignée> → /products/<poignée>.js (fiche JSON publique) */
export function shopifyJsonUrl(u: URL): string | undefined {
  const m = u.pathname.match(/\/products\/([^/?#.]+)\/?$/)
  return m ? `${u.origin}/products/${m[1]}.js` : undefined
}

/** Livre Amazon : l'ASIN d'un livre est son ISBN-10 → couverture Open Library */
export function isbnCoverUrl(u: URL): string | undefined {
  if (!/(^|\.)amazon\./i.test(u.hostname)) return undefined
  const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([0-9]{9}[0-9X])(?:[/?]|$)/i)?.[1]
  return asin ? `https://covers.openlibrary.org/b/isbn/${asin.toUpperCase()}-L.jpg?default=false` : undefined
}

const httpsUrl = (s: unknown): string | undefined => {
  if (typeof s !== 'string' || !s) return undefined
  const v = s.startsWith('//') ? `https:${s}` : s
  return /^https?:\/\//i.test(v) ? v.replace(/^http:\/\//i, 'https://') : undefined
}

export function fromShopify(json: unknown): Partial<Preview> {
  const p = json as { title?: string; featured_image?: string; images?: string[]; price?: number } | null
  if (!p || typeof p !== 'object') return {}
  return {
    title: typeof p.title === 'string' ? p.title.slice(0, 200) : undefined,
    image: httpsUrl(p.featured_image) ?? httpsUrl(p.images?.[0]),
    // prix en centimes ; la devise n'est pas donnée (celle de la boutique)
    price: typeof p.price === 'number' && p.price > 0 ? p.price / 100 : undefined,
  }
}

export function fromMicrolink(json: unknown): Partial<Preview> {
  const r = json as { status?: string; data?: { title?: string; image?: { url?: string }; publisher?: string } } | null
  if (!r || r.status !== 'success' || !r.data) return {}
  return { title: r.data.title?.slice(0, 200) || undefined, image: httpsUrl(r.data.image?.url) }
}

/** Complète l'aperçu (image surtout) avec les solutions de secours, de la moins coûteuse à la plus coûteuse */
export async function fillGaps(p: Preview, target: URL, net: { json: JsonFetcher; ok: OkFetcher; microlinkKey?: string }): Promise<Preview> {
  const out: Preview = { ...p, site: p.site ?? target.hostname.replace(/^www\./, '') }
  const merge = (x: Partial<Preview>) => {
    if (!out.image && x.image) out.image = x.image
    if (!out.title && x.title) out.title = x.title
    if (out.price === undefined && x.price !== undefined) out.price = x.price
  }
  if (!out.image) merge({ image: directImage(target) })

  const shop = !out.image ? shopifyJsonUrl(target) : undefined
  if (shop) { try { merge(fromShopify(await net.json(shop))) } catch { /* pas une boutique Shopify, ou bloquée */ } }

  const cover = !out.image ? isbnCoverUrl(target) : undefined
  if (cover) { try { if (await net.ok(cover)) merge({ image: cover }) } catch { /* pas de couverture */ } }

  if (!out.image) {
    try {
      const api = net.microlinkKey ? 'https://pro.microlink.io/' : 'https://api.microlink.io/'
      merge(fromMicrolink(await net.json(`${api}?url=${encodeURIComponent(target.toString())}`, net.microlinkKey ? { 'x-api-key': net.microlinkKey } : undefined)))
    } catch { /* service de secours indisponible ou quota atteint */ }
  }

  out.found = Boolean(out.image || out.title || out.price !== undefined)
  if (out.found && out.image) delete out.reason
  return out
}
