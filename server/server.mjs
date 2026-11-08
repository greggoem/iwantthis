// Serveur Node.js d'I Want This (sans dépendance, Node 18+).
// - Sert le site construit (dossier dist/) comme un hébergement classique.
// - Pour les liens partagés (?e=CODE, ?l=TOKEN), écrit dans la page des balises Open Graph
//   propres à l'événement ou à la liste : WhatsApp & co affichent le nom, la date, l'image.
// Démarrage : node server/server.mjs   (variables : PORT, HOST, STATIC_DIR, SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY)

import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(process.env.STATIC_DIR || path.join(HERE, '..', 'dist'))
const PORT = Number(process.env.PORT || 3000)
// HOST facultatif : « 172.17.0.1 » pour n'écouter que sur le pont Docker (derrière Caddy)
const HOST = process.env.HOST || undefined
const SITE = (process.env.SITE_URL || 'https://iwantthis.gift/').replace(/\/?$/, '/')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://enycxafzvcgprfsfkvvc.supabase.co'
// clé publique « anon » : la même que celle du site, visible par tous
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVueWN4YWZ6dmNncHJmc2ZrdnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjYyNzcsImV4cCI6MjEwOTA0MjI3N30.8xX21a9UEUeF2_S66zes0zZmQ9HLInJZCaCVxzfIzPU'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.zip': 'application/zip', '.map': 'application/json',
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function emoji(name) {
  const n = name.toLowerCase()
  if (/no[eë]l|christmas|kerst/.test(n)) return '🎄 '
  if (/anniv|birthday|verjaardag/.test(n)) return '🎂 '
  if (/mariage|wedding|huwelijk/.test(n)) return '💍 '
  if (/naissance|bébé|baby/.test(n)) return '🍼 '
  if (/saint[- ]nicolas|sinterklaas/.test(n)) return '🎅 '
  return '🎁 '
}

// petit cache mémoire (5 min) pour ne pas interroger Supabase à chaque aperçu
const cache = new Map()
async function preview(kind, code) {
  const key = kind + ':' + code, hit = cache.get(key)
  if (hit && hit.t > Date.now() - 300_000) return hit.v
  let v = null
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/share_preview`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_code: code }),
      signal: AbortSignal.timeout(3000),
    })
    if (r.ok) v = await r.json()
  } catch { /* Supabase injoignable : aperçu général */ }
  cache.set(key, { t: Date.now(), v })
  if (cache.size > 2000) cache.delete(cache.keys().next().value)
  return v
}

/** Balises Open Graph pour un lien partagé, ou null si ce n'en est pas un */
async function shareMeta(kind, code, pageUrl) {
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(code)) return null
  const data = await preview(kind, code)
  if (kind === 'e' && data?.name) {
    const d = data.date ? new Date(data.date + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
    return {
      title: `💌 Invitation : ${emoji(data.name)}${data.name}`,
      desc: `${d ? d.charAt(0).toUpperCase() + d.slice(1) + (data.time ? ` à ${data.time.replace(':', 'h')}` : '') + ' · ' : ''}Rejoins l'événement sur I Want This : chacun partage ses envies de cadeaux, sans doublon.`,
      image: data.image || SITE + 'og.png', url: pageUrl,
    }
  }
  if (kind === 'l' && data) {
    return {
      title: `🎁 ${data.owner ? `La liste d'envies de ${data.owner}` : "Une liste d'envies"}`,
      desc: 'Choisis un cadeau et indique « Acheté » : pas de doublon, et la surprise reste entière.',
      image: SITE + 'og.png', url: pageUrl,
    }
  }
  return null
}

function injectMeta(html, m) {
  const tags = {
    'og:title': m.title, 'og:description': m.desc, 'og:image': m.image, 'og:url': m.url,
  }
  for (const [p, v] of Object.entries(tags)) {
    const re = new RegExp(`<meta property="${p}" content="[^"]*"\\s*/?>`)
    const tag = `<meta property="${p}" content="${esc(v)}" />`
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
  }
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(m.desc)}" />`)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
  html = html.replace(/<meta property="og:image:width"[^>]*>\s*|<meta property="og:image:height"[^>]*>\s*/g, '')
  return html
}

let indexCache = null
async function indexHtml() {
  if (!indexCache || process.env.NODE_ENV === 'development') indexCache = await readFile(path.join(ROOT, 'index.html'), 'utf8')
  return indexCache
}

async function sendFile(res, file, method) {
  const ext = path.extname(file).toLowerCase()
  const body = await readFile(file)
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(method === 'HEAD' ? undefined : body)
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end() }
    const url = new URL(req.url, SITE)
    let p = decodeURIComponent(url.pathname)

    // Formes courtes /e/CODE et /l/TOKEN → ?e=… / ?l=… (le site s'en charge ensuite)
    const short = p.match(/^\/(e|l)\/([A-Za-z0-9_-]{4,100})\/?$/)
    const kind = short ? short[1] : url.searchParams.has('e') ? 'e' : url.searchParams.has('l') ? 'l' : null
    const code = short ? short[2] : kind ? url.searchParams.get(kind) : null
    if (short) p = '/'

    if (p === '/' || p === '/index.html') {
      let html = await indexHtml()
      if (kind && code) {
        const m = await shareMeta(kind, code, SITE + `?${kind}=${encodeURIComponent(code)}`)
        if (m) html = injectMeta(html, m)
        // forme courte /l/TOKEN : les fichiers du site sont en chemins relatifs (./assets/…) → <base href="/">
        if (short) html = html.replace('<head>', `<head>\n    <base href="/" />\n    <script>history.replaceState(null,'',${JSON.stringify(`/?${kind}=${code}`)})</script>`)
      }
      const body = Buffer.from(html)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
      return res.end(req.method === 'HEAD' ? undefined : body)
    }

    // Fichiers du site (protégé contre « ../ »)
    const file = path.resolve(ROOT, '.' + p)
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end() }
    let target = file
    const st = await stat(target).catch(() => null)
    if (st?.isDirectory()) target = path.join(target, 'index.html')
    if (st && (st.isFile() || (await stat(target).catch(() => null))?.isFile())) return await sendFile(res, target, req.method)

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Page introuvable')
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Erreur du serveur')
  }
})

server.listen(PORT, HOST, () => console.log(`I Want This : http://${HOST || 'localhost'}:${PORT}  (fichiers : ${ROOT})`))
