// Edge Function « refresh-previews » : relit d'un coup les liens des envies sans image (ou en lien court Google)
// et complète lien, image et titre. Lancée par l'admin depuis la base (pg_net) avec une clé à usage interne.
// Ne remplace jamais une image existante ni un titre écrit par la personne.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { computePreview } from './core.ts'
import { isShortLink } from './parse.ts'

// empreinte SHA-256 de la clé (la clé elle-même n'est pas dans le code)
const KEY_SHA256 = 'bed371204f9155b739062cb45700073b0d2a7fb7ee19d1fed4489cd8ff8f2379'

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const looksLikeHost = (t: string) => /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t.trim())

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  if (await sha256(req.headers.get('x-refresh-key') ?? '') !== KEY_SHA256) return json({ error: 'Refusé' }, 403)
  let body: { limit?: number; after?: string; ids?: string[] } = {}
  try { body = await req.json() } catch { /* défauts */ }
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 15), after = String(body.after ?? '')

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rows, error } = await db.from('items').select('id,url,image_url,title')
    .or('is_group.is.null,is_group.eq.false').not('url', 'is', null).order('id').range(0, 2000)
  if (error) return json({ error: error.message }, 500)
  const todo = (rows ?? []).filter((r) => {
    try { return !r.image_url || isShortLink(new URL(r.url)) } catch { return false }
  })
  // par tranches, dans l'ordre des identifiants (« after » = dernier identifiant traité)
  const only = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null
  const batch = todo.filter((r) => (only ? only.has(r.id) : r.id > after)).slice(0, limit)

  const results: unknown[] = []
  let i = 0
  const worker = async () => {
    while (i < batch.length) {
      const it = batch[i++]
      const p = await computePreview(it.url)
      const patch: Record<string, string> = {}
      if (p.url && p.url !== it.url && /^https?:\/\//.test(p.url)) patch.url = p.url
      if (!it.image_url && p.found && p.image && /^https?:\/\//.test(p.image)) patch.image_url = p.image.replace(/^http:/, 'https:')
      if (p.title && looksLikeHost(it.title ?? '')) patch.title = p.title.slice(0, 200)
      if (Object.keys(patch).length) await db.from('items').update(patch).eq('id', it.id)
      results.push({ id: it.id, changed: Object.keys(patch), reason: Object.keys(patch).length ? undefined : p.reason })
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return json({ total: todo.length, done: batch.length, next: batch.at(-1)?.id ?? null, results })
})
