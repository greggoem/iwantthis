// Envoie l'e-mail d'invitation à un événement.
// Appelée par le site, avec la session de l'organisateur (verify_jwt) : la base vérifie qu'il est bien organisateur
// et limite à un envoi toutes les 2 minutes par invité (fonction SQL request_invite_email).
// Secrets à définir (Supabase → Edge Functions → Secrets) :
//   BREVO_API_KEY  ou  RESEND_API_KEY   (l'un des deux)
//   MAIL_FROM      ex. « I Want This <invitations@votre-domaine.be> » (adresse validée chez le service d'envoi)
//   SITE_URL       ex. https://greggoem.github.io/liste-cadeaux/   (facultatif)
//   APP_NAME       facultatif
import { createClient } from 'npm:@supabase/supabase-js@2'
import { build, providerRequest, type InviteMail, type Provider } from './mail.ts'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Non connecté' }, 401)

  let body: { event_id?: string; email?: string }
  try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }
  const eventId = String(body.event_id ?? ''), email = String(body.email ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !email.includes('@')) return json({ error: 'Requête invalide' }, 400)

  const brevo = Deno.env.get('BREVO_API_KEY'), resend = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM')
  const provider: Provider | null = brevo ? 'brevo' : resend ? 'resend' : null
  const key = brevo ?? resend
  if (!provider || !key || !from) return json({ sent: false, reason: 'not_configured' })   // pas encore branché : le site propose l'envoi manuel

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data, error } = await supabase.rpc('request_invite_email', { p_event: eventId, p_email: email })
  if (error) return json({ sent: false, reason: 'refused', error: error.message }, 200)
  const row = (Array.isArray(data) ? data[0] : data) as InviteMail | undefined
  if (!row) return json({ sent: false, reason: 'refused', error: 'Invitation introuvable' }, 200)

  const mail = build(row, Deno.env.get('SITE_URL') ?? 'https://greggoem.github.io/liste-cadeaux/', Deno.env.get('APP_NAME') ?? 'I Want This')
  const { url, init } = providerRequest(provider, key, from, { email: row.invite_email, name: row.invite_name }, mail)
  try {
    const r = await fetch(url, init)
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300)
      console.error('envoi refusé', provider, r.status, t)
      return json({ sent: false, reason: 'provider_error', status: r.status, error: t })
    }
    return json({ sent: true, provider })
  } catch (e) {
    console.error('envoi impossible', e)
    return json({ sent: false, reason: 'network', error: String(e) })
  }
})
