// Edge Function « link-preview » : lit une fiche produit et renvoie titre, image et prix.
// - réservée aux utilisateurs connectés (évite qu'elle serve de proxy ouvert)
// - bloque les adresses internes (protection SSRF) et limite la taille / la durée
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { Preview } from './parse.ts'
import { computePreview } from './core.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

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
  return json(await computePreview(raw))
})
