// Relances par e-mail, déclenchées depuis l'administration du site (Inscrits → Relances).
// Réservée aux administrateurs ; chaque personne reçoit chaque relance une seule fois (table reminder_log).
// Secrets : BREVO_API_KEY ou RESEND_API_KEY, MAIL_FROM, SITE_URL (facultatif), APP_NAME (facultatif)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildReminder, providerRequest, type ReminderKind, type ReminderRow, type Provider } from './mail.ts'

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

  let body: { kind?: string }
  try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }
  const kind = body.kind as ReminderKind
  if (kind !== 'activation' && kind !== 'first_wish') return json({ error: 'Requête invalide' }, 400)

  const brevo = Deno.env.get('BREVO_API_KEY'), resend = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM')
  const provider: Provider | null = brevo ? 'brevo' : resend ? 'resend' : null
  const key = brevo ?? resend
  if (!provider || !key || !from) return json({ sent: 0, reason: 'not_configured' })

  const url = Deno.env.get('SUPABASE_URL')!
  const user = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } }).auth.getUser()
  const uid = user.data.user?.id
  if (!uid) return json({ error: 'Non connecté' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('request_reminder_emails', { p_kind: kind, p_admin: uid })
  if (error) return json({ sent: 0, reason: 'refused', error: error.message })
  const rows = (data ?? []) as ReminderRow[]

  const site = Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/', app = Deno.env.get('APP_NAME') ?? 'I Want This'
  let sent = 0
  for (const r of rows) {
    const mail = buildReminder(kind, r, site, app)
    const { url: u, init } = providerRequest(provider, key, from, { email: r.email, name: r.display_name ?? '' }, mail)
    try {
      const resp = await fetch(u, init)
      if (resp.ok) sent++; else console.error('envoi refusé', provider, resp.status, (await resp.text()).slice(0, 200))
    } catch (e) { console.error('envoi impossible', e) }
  }
  return json({ sent, total: rows.length })
})
