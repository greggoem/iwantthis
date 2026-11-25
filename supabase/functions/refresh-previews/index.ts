// Edge Function « refresh-previews » : relit les liens des envies incomplètes (sans image, sans prix, sans titre,
// ou en lien court Google) et complète ce qui manque. Lancée chaque nuit par la base (pg_cron → pg_net)
// avec une clé à usage interne. Ne remplace jamais une image, un prix ou un titre déjà renseignés.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { computePreview } from './core.ts'
import { isShortLink, isJunkImage } from './parse.ts'

// empreinte SHA-256 de la clé (la clé elle-même n'est pas dans le code)
const KEY_SHA256 = 'bed371204f9155b739062cb45700073b0d2a7fb7ee19d1fed4489cd8ff8f2379'

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const looksLikeHost = (t: string) => /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t.trim())

type Row = { id: string; url: string; image_url: string | null; title: string | null; price: number | null; preview_checked_at: string | null }

const RETRY_DAYS = 7          // une envie qui reste incomplète est retentée une fois par semaine
const MAX_ITEMS = 30          // par passage (le service d'aperçu gratuit est limité à 50 lectures par jour)
const TIME_BUDGET_MS = 110_000

const missing = (r: Row) => {
  const m: string[] = []
  if (!r.image_url || isJunkImage(r.image_url)) m.push('image')
  if (r.price === null) m.push('price')
  if (!r.title?.trim() || looksLikeHost(r.title)) m.push('title')
  try { if (isShortLink(new URL(r.url))) m.push('url') } catch { return [] }
  return m
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  if (await sha256(req.headers.get('x-refresh-key') ?? '') !== KEY_SHA256) return json({ error: 'Refusé' }, 403)
  let body: { limit?: number; ids?: string[]; force?: boolean } = {}
  try { body = await req.json() } catch { /* défauts */ }
  const limit = Math.min(Math.max(Number(body.limit) || MAX_ITEMS, 1), 60)
  const t0 = Date.now()

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows, error } = await db.from('items').select('id,url,image_url,title,price,preview_checked_at')
    .or('is_group.is.null,is_group.eq.false').not('url', 'is', null).range(0, 5000)
  if (error) return json({ error: error.message }, 500)
  const since = Date.now() - RETRY_DAYS * 86_400_000
  const only = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null
  const todo = ((rows ?? []) as Row[])
    .filter((r) => missing(r).length > 0)
    .filter((r) => only ? only.has(r.id) : body.force || !r.preview_checked_at || Date.parse(r.preview_checked_at) < since)
    // jamais essayées d'abord, puis les plus anciennes
    .sort((a, b) => (a.preview_checked_at ?? '').localeCompare(b.preview_checked_at ?? ''))
  const batch = todo.slice(0, limit)

  const results: { id: string; changed: string[]; reason?: string }[] = []
  let i = 0
  const worker = async () => {
    while (i < batch.length && Date.now() - t0 < TIME_BUDGET_MS) {
      const it = batch[i++]
      const want = missing(it)
      const p = await computePreview(it.url)
      const patch: Record<string, string | number> = { preview_checked_at: new Date().toISOString() }
      if (p.url && p.url !== it.url && /^https?:\/\//.test(p.url)) patch.url = p.url
      if (want.includes('image') && p.found && p.image && /^https?:\/\//.test(p.image) && !isJunkImage(p.image)) patch.image_url = p.image.replace(/^http:/, 'https:')
      if (want.includes('price') && p.price !== undefined && (!p.currency || p.currency === 'EUR')) patch.price = p.price
      if (want.includes('title') && p.title && !looksLikeHost(p.title)) patch.title = p.title.slice(0, 200)
      await db.from('items').update(patch).eq('id', it.id)
      const changed = Object.keys(patch).filter((k) => k !== 'preview_checked_at')
      results.push({ id: it.id, changed, reason: changed.length ? undefined : p.reason })
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const fixed = results.filter((r) => r.changed.length).length
  return json({ candidates: todo.length, tried: results.length, fixed, results })
})
