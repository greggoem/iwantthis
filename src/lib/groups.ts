import type { Item } from './types'

/** Sépare les envies de premier niveau (cadeaux et groupes) et les éléments de chaque groupe */
export function groupTree(items: Item[]): { tops: Item[]; kids: Record<string, Item[]> } {
  const kids: Record<string, Item[]> = {}
  const tops: Item[] = []
  for (const it of items) {
    if (it.parent_id) (kids[it.parent_id] ??= []).push(it)
    else tops.push(it)
  }
  return { tops, kids }
}

/** « Frank Lloyd Wright – Amazon.com.be : Livres » → « Frank Lloyd Wright » */
export function cleanTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim()
  t = t.replace(/^(Amazon\.[a-z.]+\s*:\s*)/i, '')
  t = t.split(' | ')[0]
  t = t.replace(/\s*[:\-–—|]\s*(Amazon|Bol|Fnac|Zalando|Coolblue|Livres|Books)[^]*$/i, '')
  return t.trim().slice(0, 200)
}

/** Nom de secours tiré de l'adresse : …/frank-lloyd-wright-45th-ed/dp/123 → « Frank lloyd wright 45th ed » */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p))
    const good = parts.filter(p => /[a-z]{3,}/i.test(p) && !/^(dp|gp|p|product|products|produit|fr|nl|en|be|ref|collections|a\d+)$/i.test(p))
    const seg = (good.sort((a, b) => b.length - a.length)[0] ?? '').replace(/\.[a-z]{2,5}$/i, '')
    const name = seg.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (name.length >= 3) return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 120)
    return u.hostname.replace(/^www\./, '')
  } catch { return 'Cadeau' }
}

export interface ParsedLink { url: string; label: string }

/** Lit des lignes comme « Koolhaas https://… », « [Mies](https://…) » ou un simple lien */
export function parseLinks(text: string): ParsedLink[] {
  const out: ParsedLink[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    let url: string | undefined, label = ''
    const md = line.match(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/i)
    if (md) { url = md[2]; label = md[1] }
    else {
      url = line.match(/https?:\/\/\S+/i)?.[0]
      if (url) label = line.replace(url, '')
    }
    if (!url) continue
    url = url.replace(/[),.;]+$/, '')
    label = label.replace(/^[\s\-–—•*·:|()[\]]+|[\s\-–—•*·:|()[\]]+$/g, '').trim()
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, label })
  }
  return out
}
