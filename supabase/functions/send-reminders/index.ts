// Relances par e-mail : automatiquement chaque jour ({ auto: true }, appel de pg_cron), ou à la main depuis l'administration ({ kind }). En automatique, aussi les rappels 7 et 2 jours avant une remise.
// Chaque personne reçoit chaque relance une seule fois (table reminder_log) ; l'envoi automatique tourne au plus une fois par heure.
// Secrets : BREVO_API_KEY ou RESEND_API_KEY, MAIL_FROM, SITE_URL (facultatif), APP_NAME (facultatif)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildReminder, buildGiftReminder, providerRequest, type ReminderKind, type ReminderRow, type GiftReminderRow, type Provider } from './mail.ts'

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

  let body: { kind?: string; auto?: boolean }
  try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }
  const auto = body.auto === true
  const kind = body.kind as ReminderKind
  if (!auto && kind !== 'activation' && kind !== 'first_wish') return json({ error: 'Requête invalide' }, 400)

  const brevo = Deno.env.get('BREVO_API_KEY'), resend = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM')
  const provider: Provider | null = brevo ? 'brevo' : resend ? 'resend' : null
  const key = brevo ?? resend
  if (!provider || !key || !from) return json({ sent: 0, reason: 'not_configured' })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let uid: string | null = null
  if (auto) {
    // envoi automatique : n'envoie que les relances dues, au plus une fois par heure
    const { data: ok } = await admin.rpc('claim_auto_reminders')
    if (!ok) return json({ skipped: true })
  } else {
    const user = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } }).auth.getUser()
    uid = user.data.user?.id ?? null
    if (!uid) return json({ error: 'Non connecté' }, 401)
  }

  const site = Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/', app = Deno.env.get('APP_NAME') ?? 'I Want This'
  let sent = 0, total = 0
  for (const k of auto ? (['activation', 'first_wish'] as ReminderKind[]) : [kind]) {
    const { data, error } = await admin.rpc('request_reminder_emails', { p_kind: k, p_admin: uid })
    if (error) { if (!auto) return json({ sent: 0, reason: 'refused', error: error.message }); console.error('relances', k, error.message); continue }
    const rows = (data ?? []) as ReminderRow[]
    total += rows.length
    for (const r of rows) {
      const mail = buildReminder(k, r, site, app)
      const { url: u, init } = providerRequest(provider, key, from, { email: r.email, name: r.display_name ?? '' }, mail)
      try {
        const resp = await fetch(u, init)
        if (resp.ok) sent++; else console.error('envoi refusé', provider, resp.status, (await resp.text()).slice(0, 200))
      } catch (e) { console.error('envoi impossible', e) }
    }
  }
  if (auto) {
    // rappels 7 et 2 jours avant une remise (la notification est créée par la base, ici l'e-mail)
    const { data, error } = await admin.rpc('request_gift_reminders')
    if (error) console.error('rappels cadeaux', error.message)
    for (const r of (data ?? []) as GiftReminderRow[]) {
      total++
      const mail = buildGiftReminder(r, site, app)
      const { url: u, init } = providerRequest(provider, key, from, { email: r.email, name: r.display_name ?? '' }, mail)
      try {
        const resp = await fetch(u, init)
        if (resp.ok) sent++; else console.error('envoi refusé', provider, resp.status, (await resp.text()).slice(0, 200))
      } catch (e) { console.error('envoi impossible', e) }
    }
    console.log('relances automatiques', sent, '/', total)
  }
  return json({ sent, total })
})
