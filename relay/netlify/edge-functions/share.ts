// Aperçu des liens partagés : renvoie des balises Open Graph propres à l'événement ou à la liste,
// puis redirige aussitôt la personne vers le site.
//   /e/CODE  → invitation à un événement   →  https://iwantthis.gift/?e=CODE
//   /l/TOKEN → liste d'envies               →  https://iwantthis.gift/?l=TOKEN

const SITE = 'https://iwantthis.gift/'
const SUPABASE_URL = Netlify.env.get('SUPABASE_URL') ?? 'https://enycxafzvcgprfsfkvvc.supabase.co'
// clé publique « anon » (la même que celle du site, visible par tous)
const ANON = Netlify.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVueWN4YWZ6dmNncHJmc2ZrdnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjYyNzcsImV4cCI6MjEwOTA0MjI3N30.8xX21a9UEUeF2_S66zes0zZmQ9HLInJZCaCVxzfIzPU'
const DEFAULT_IMG = SITE + 'og.png'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function emoji(name: string): string {
  const n = name.toLowerCase()
  if (/no[eë]l|christmas|kerst/.test(n)) return '🎄 '
  if (/anniv|birthday|verjaardag/.test(n)) return '🎂 '
  if (/mariage|wedding|huwelijk/.test(n)) return '💍 '
  if (/naissance|bébé|baby/.test(n)) return '🍼 '
  if (/saint[- ]nicolas|sinterklaas/.test(n)) return '🎅 '
  return '🎁 '
}

async function preview(kind: string, code: string): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/share_preview`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_code: code }),
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

function page(o: { title: string; desc: string; image: string; target: string; url: string }): Response {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="I Want This">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(o.image)}">
<meta property="og:url" content="${esc(o.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(o.target)}">
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#444}</style>
</head><body><p>Ouverture de <a href="${esc(o.target)}">I Want This</a>…</p>
<script>location.replace(${JSON.stringify(o.target)})</script></body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } })
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const m = url.pathname.match(/^\/(e|l)\/([A-Za-z0-9_-]{4,100})\/?$/)
  if (!m) return Response.redirect(SITE, 302)
  const [, kind, code] = m
  const target = `${SITE}?${kind}=${encodeURIComponent(code)}`
  const data = await preview(kind, code)

  if (kind === 'e' && data?.name) {
    const date = data.date ? new Date(data.date + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''
    return page({
      title: `💌 Invitation : ${emoji(data.name)}${data.name}`,
      desc: `${date ? date.charAt(0).toUpperCase() + date.slice(1) + ' · ' : ''}Rejoins l'événement sur I Want This : chacun partage ses envies de cadeaux, sans doublon.`,
      image: data.image || DEFAULT_IMG, target, url: url.toString(),
    })
  }
  if (kind === 'l' && data) {
    const who = data.owner ? `La liste d'envies de ${data.owner}` : "Une liste d'envies"
    return page({
      title: `🎁 ${who}`,
      desc: "Choisis un cadeau et indique « Acheté » : pas de doublon, et la surprise reste entière.",
      image: DEFAULT_IMG, target, url: url.toString(),
    })
  }
  return page({ title: "I Want This · Listes d'envies à partager", desc: 'Partagez vos envies, offrez sans doublon, tirez au sort en famille.', image: DEFAULT_IMG, target, url: url.toString() })
}

export const config = { path: '/*', excludedPath: ['/index.html'] }
