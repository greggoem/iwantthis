// Edge Function « link-preview » : lit une fiche produit et renvoie titre, image et prix.
// - réservée aux utilisateurs connectés (évite qu'elle serve de proxy ouvert)
// - bloque les adresses internes (protection SSRF) et limite la taille / la durée
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseProductPage, type Preview } from './parse.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MAX_BYTES = 2_000_000
const MAX_REDIRECTS = 4

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateIp(mapped[1]) : false
  }
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Adresse non autorisée')
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Port non autorisé')
  if (u.username || u.password) throw new Error('Adresse non autorisée')
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new Error('Adresse non autorisée')
  }
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) {
    if (isPrivateIp(host.replace(/^\[|\]$/g, ''))) throw new Error('Adresse non autorisée')
    return
  }
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ])
  const all = [...a, ...aaaa]
  if (all.length === 0) throw new Error('Site introuvable')
  if (all.some(isPrivateIp)) throw new Error('Adresse non autorisée')
}

async function fetchHtml(start: URL): Promise<{ html: string; finalUrl: string }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-BE,fr;q=0.9,en;q=0.6' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url)
      continue
    }
    if (res.status >= 400) throw new Error(`Le site refuse la lecture automatique (code ${res.status})`)
    const type = res.headers.get('content-type') ?? ''
    if (!/html|xml/i.test(type)) throw new Error('Ce lien ne mène pas à une page web')

    // lecture plafonnée
    const reader = res.body?.getReader()
    if (!reader) throw new Error('Page vide')
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})
    const buf = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    const charset = type.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase()
    let html: string
    try { html = new TextDecoder(charset && charset !== 'utf-8' ? charset : 'utf-8').decode(buf) }
    catch { html = new TextDecoder('utf-8').decode(buf) }
    return { html, finalUrl: url.toString() }
  }
  throw new Error('Trop de redirections')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  // l'appelant doit être un utilisateur connecté
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Non connecté' }, 401)

  let raw: string
  try { raw = String((await req.json()).url ?? '').trim() } catch { return json({ error: 'Requête invalide' }, 400) }
  if (!raw || raw.length > 2000) return json({ found: false, reason: 'Lien manquant' } satisfies Preview)

  try {
    const start = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
    const { html, finalUrl } = await fetchHtml(start)
    const preview = parseProductPage(html, finalUrl)
    if (!preview.found && !preview.reason) preview.reason = 'Aucune information produit lisible sur cette page'
    return json(preview)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lecture impossible'
    return json({ found: false, reason: msg.includes('abort') || msg.includes('timed out') ? 'Le site met trop de temps à répondre' : msg } satisfies Preview)
  }
})
