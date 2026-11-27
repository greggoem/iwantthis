// Envoie l'e-mail d'invitation à un événement.
// Appelée par le site, avec la session de la personne qui invite (verify_jwt) : la base vérifie qu'elle en a le droit
// et limite à un envoi toutes les 2 minutes par invité (fonction SQL request_invite_email).
// Secrets à définir (Supabase → Edge Functions → Secrets) :
//   BREVO_API_KEY  ou  RESEND_API_KEY   (l'un des deux)
//   MAIL_FROM      ex. « I Want This <invitations@votre-domaine.be> » (adresse validée chez le service d'envoi)
//   SITE_URL       ex. https://iwantthis.gift/   (facultatif)
//   APP_NAME       facultatif
import { createClient } from 'npm:@supabase/supabase-js@2'
import { build, buildGroupGift, buildOffer, providerRequest, type GroupGiftMail, type InviteMail, type OfferMail, type Provider } from './mail.ts'

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

  // { event_id, email } ou { invite_id } (invitation d'un proche : le site ne connaît pas son adresse)
  // { list_invite_id } (gérer une liste d'enfant à deux) ou { transfer_id } (donner sa liste à l'enfant)
  // { group_invite_id } (invitation à un cadeau commun par adresse e-mail)
  let body: { event_id?: string; email?: string; invite_id?: string; list_invite_id?: string; transfer_id?: string; group_invite_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }
  const eventId = String(body.event_id ?? ''), email = String(body.email ?? ''), inviteId = String(body.invite_id ?? '')
  const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s)
  const listInviteId = String(body.list_invite_id ?? ''), transferId = String(body.transfer_id ?? '')
  const offer = isId(listInviteId) ? { kind: 'manage', id: listInviteId } : isId(transferId) ? { kind: 'give', id: transferId } : null
  const groupInviteId = String(body.group_invite_id ?? '')
  if (!offer && !isId(groupInviteId) && !isId(inviteId) && (!isId(eventId) || !email.includes('@'))) return json({ error: 'Requête invalide' }, 400)

  const brevo = Deno.env.get('BREVO_API_KEY'), resend = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM')
  const provider: Provider | null = brevo ? 'brevo' : resend ? 'resend' : null
  const key = brevo ?? resend
  if (!provider || !key || !from) return json({ sent: false, reason: 'not_configured' })   // pas encore branché : le site propose l'envoi manuel

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  if (isId(groupInviteId)) {
    const { data, error } = await supabase.rpc('request_group_gift_email', { p_invite: groupInviteId })
    if (error) return json({ sent: false, reason: 'refused', error: error.message }, 200)
    const row = (Array.isArray(data) ? data[0] : data) as GroupGiftMail | undefined
    if (!row) return json({ sent: false, reason: 'refused', error: 'Invitation introuvable' }, 200)
    const mail = buildGroupGift(row, Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/', Deno.env.get('APP_NAME') ?? 'I Want This')
    const { url, init } = providerRequest(provider, key, from, { email: row.to_email, name: '' }, mail)
    try {
      const r = await fetch(url, init)
      if (!r.ok) return json({ sent: false, reason: 'provider_error', status: r.status, error: (await r.text()).slice(0, 300) })
      return json({ sent: true, provider })
    } catch (e) {
      return json({ sent: false, reason: 'network', error: String(e) })
    }
  }
  if (offer) {
    const { data, error } = await supabase.rpc('request_list_offer_email', { p_kind: offer.kind, p_id: offer.id })
    if (error) return json({ sent: false, reason: 'refused', error: error.message }, 200)
    const row = (Array.isArray(data) ? data[0] : data) as OfferMail | undefined
    if (!row) return json({ sent: false, reason: 'refused', error: 'Proposition introuvable' }, 200)
    const mail = buildOffer(row, Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/', Deno.env.get('APP_NAME') ?? 'I Want This')
    const { url, init } = providerRequest(provider, key, from, { email: row.to_email, name: row.to_name ?? '' }, mail)
    try {
      const r = await fetch(url, init)
      if (!r.ok) return json({ sent: false, reason: 'provider_error', status: r.status, error: (await r.text()).slice(0, 300) })
      return json({ sent: true, provider })
    } catch (e) {
      return json({ sent: false, reason: 'network', error: String(e) })
    }
  }
  const { data, error } = isId(inviteId)
    ? await supabase.rpc('request_invite_email_by_id', { p_invite: inviteId })
    : await supabase.rpc('request_invite_email', { p_event: eventId, p_email: email })
  if (error) return json({ sent: false, reason: 'refused', error: error.message }, 200)
  const row = (Array.isArray(data) ? data[0] : data) as InviteMail | undefined
  if (!row) return json({ sent: false, reason: 'refused', error: 'Invitation introuvable' }, 200)

  const mail = build(row, Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/', Deno.env.get('APP_NAME') ?? 'I Want This')
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
