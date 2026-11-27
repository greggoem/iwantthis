// Contenu de l'e-mail d'invitation et appels aux services d'envoi (Brevo ou Resend)

export interface InviteMail {
  invite_name: string
  invite_email: string
  event_name: string
  event_date: string          // AAAA-MM-JJ
  invite_code: string
  image_url: string | null
  organizer: string
}

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function emoji(name: string): string {
  const n = name.toLowerCase()
  if (/no[eë]l|christmas|r[eé]veillon/.test(n)) return '🎄'
  if (/anniv|birthday/.test(n)) return '🎂'
  if (/mariage|wedding/.test(n)) return '💍'
  if (/naissance|b[eé]b[eé]|baby/.test(n)) return '👶'
  return '🎁'
}

export function dateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function build(m: InviteMail, site: string, appName: string): { subject: string; html: string; text: string; link: string } {
  const base = site.replace(/#.*$/, '').replace(/\/?$/, '/')
  const link = `${base}#/e/${encodeURIComponent(m.invite_code)}`
  const when = dateLong(m.event_date)
  const subject = `${emoji(m.event_name)} ${m.organizer} vous invite à « ${m.event_name} »`
  const img = m.image_url && /^https:\/\//.test(m.image_url)
    ? `<img src="${esc(m.image_url)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:14px;margin:0 0 18px">` : ''
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fffaf1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2150">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  ${img}
  <h1 style="font-size:24px;line-height:1.2;margin:0 0 10px">${emoji(m.event_name)} ${esc(m.event_name)}</h1>
  <p style="margin:0 0 18px;color:#6b5f9a">${esc(when)}</p>
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px">Bonjour ${esc(m.invite_name)},</p>
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px"><strong>${esc(m.organizer)}</strong> vous invite à rejoindre cet événement sur ${esc(appName)} : chacun y met ses envies de cadeaux, on voit les listes des uns et des autres, et on évite les doublons 😉</p>
  <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#ff4d8d;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:14px">Rejoindre l'événement</a></p>
  <p style="font-size:13px;line-height:1.5;color:#6b5f9a;margin:0 0 6px">Connectez-vous ou créez votre compte avec cette adresse e-mail (${esc(m.invite_email)}). Vos listes ne sont visibles des autres invités qu'après avoir rejoint l'événement : vous restez libre de refuser.</p>
  <p style="font-size:12px;color:#9a90bf;margin:14px 0 0">Si le bouton ne marche pas : ${esc(link)}</p>
</div></body></html>`
  const text = `${emoji(m.event_name)} ${m.event_name} — ${when}\n\nBonjour ${m.invite_name},\n\n${m.organizer} vous invite à rejoindre cet événement sur ${appName} : chacun y met ses envies de cadeaux, on voit les listes des uns et des autres, et on évite les doublons.\n\nRejoindre l'événement : ${link}\n\nConnectez-vous ou créez votre compte avec cette adresse e-mail (${m.invite_email}). Vos listes ne sont visibles des autres invités qu'après avoir rejoint l'événement : vous restez libre de refuser.\n`
  return { subject, html, text, link }
}

/** Proposition liée à une liste d'enfant : la gérer à deux (manage) ou la récupérer (give) */
export interface OfferMail { to_email: string; to_name: string | null; child_name: string; from_name: string; kind: 'manage' | 'give' }

export function buildOffer(m: OfferMail, site: string, appName: string): { subject: string; html: string; text: string; link: string } {
  const base = site.replace(/#.*$/, '').replace(/\/?$/, '/')
  const link = `${base}#/login?email=${encodeURIComponent(m.to_email)}`
  const hello = m.to_name ? `Bonjour ${m.to_name},` : 'Bonjour,'
  const manage = m.kind === 'manage'
  const subject = manage
    ? `👪 ${m.from_name} vous propose de gérer avec lui la liste de ${m.child_name}`
    : `🎁 ${m.from_name} vous confie votre liste d'envies`
  const lines = manage
    ? [`<strong>${esc(m.from_name)}</strong> vous propose de gérer avec lui la liste d'envies de <strong>${esc(m.child_name)}</strong> sur ${esc(appName)}.`,
       `Vous pourrez ajouter ses envies et voir ce qui a été acheté pour lui. Vos événements restent les vôtres : ${esc(m.from_name)} ne les voit pas, et vous ne voyez pas les siens.`]
    : [`<strong>${esc(m.from_name)}</strong> tenait votre liste d'envies sur ${esc(appName)}. C'est maintenant à vous de la gérer : vous y retrouvez toutes vos envies.`,
       `Ce que vos proches achètent pour vous reste une surprise jusqu'au jour J.`]
  const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const cta = manage ? 'Voir la proposition' : 'Récupérer ma liste'
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fffaf1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2150">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(hello)}</p>
  ${lines.map(l => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${l}</p>`).join('\n  ')}
  <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#ff4d8d;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:14px">${cta}</a></p>
  <p style="font-size:13px;line-height:1.5;color:#6b5f9a;margin:0 0 6px">Connectez-vous ou créez votre compte avec cette adresse e-mail (${esc(m.to_email)}) : la proposition vous attend dans « Ma liste ». Vous restez libre de refuser.</p>
  <p style="font-size:12px;color:#9a90bf;margin:14px 0 0">Si le bouton ne marche pas : ${esc(link)}</p>
</div></body></html>`
  const text = `${hello}\n\n${lines.map(plain).join('\n\n')}\n\n${cta} : ${link}\n\nConnectez-vous ou créez votre compte avec cette adresse e-mail (${m.to_email}) : la proposition vous attend dans « Ma liste ». Vous restez libre de refuser.\n`
  return { subject, html, text, link }
}

/** Invitation à un cadeau commun */
export interface GroupGiftMail {
  to_email: string; from_name: string | null; recipient_name: string; title: string; give_on: string
  image_url: string | null; share_token: string; price: number; split: 'equal' | 'free'; fixed_share: number | null; respond_by: string | null
}

const euro = (n: number) => `${Number(n).toLocaleString('fr-BE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`

export function buildGroupGift(m: GroupGiftMail, site: string, appName: string): { subject: string; html: string; text: string; link: string } {
  const base = site.replace(/#.*$/, '').replace(/\/?$/, '/')
  const link = `${base}?g=${encodeURIComponent(m.share_token)}`
  const who = m.from_name || 'Un proche'
  const subject = `🎁 ${who} vous propose un cadeau commun pour ${m.recipient_name}`
  const howMuch = m.split === 'free' ? 'Chacun participe à hauteur de ce qu\'il veut.'
    : m.fixed_share ? `La participation demandée est de ${euro(m.fixed_share)} par personne.`
    : `Le prix (${euro(m.price)}) est divisé entre les participants.`
  const lines = [
    `<strong>${esc(who)}</strong> organise un cadeau commun pour <strong>${esc(m.recipient_name)}</strong> : « ${esc(m.title)} », à offrir le ${esc(dateLong(m.give_on))}.`,
    `${esc(howMuch)} Dites simplement si vous participez${m.respond_by ? `, avant le ${esc(dateLong(m.respond_by))}` : ''}.`,
  ]
  const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const img = m.image_url && /^https:\/\//.test(m.image_url)
    ? `<img src="${esc(m.image_url)}" alt="" width="240" style="display:block;width:240px;max-width:100%;height:auto;border-radius:14px;margin:0 0 18px;background:#fff">` : ''
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fffaf1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2150">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  ${img}
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px">Bonjour,</p>
  ${lines.map(l => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${l}</p>`).join('\n  ')}
  <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#ff4d8d;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:14px">Je réponds</a></p>
  <p style="font-size:13px;line-height:1.5;color:#6b5f9a;margin:0 0 6px">Connectez-vous ou créez votre compte gratuit sur ${esc(appName)}. ${esc(m.recipient_name)} ne voit rien de ce cadeau commun : chut 🤫</p>
  <p style="font-size:12px;color:#9a90bf;margin:14px 0 0">Si le bouton ne marche pas : ${esc(link)}</p>
</div></body></html>`
  const text = `Bonjour,\n\n${lines.map(plain).join('\n\n')}\n\nJe réponds : ${link}\n\nConnectez-vous ou créez votre compte gratuit sur ${appName}. ${m.recipient_name} ne voit rien de ce cadeau commun.\n`
  return { subject, html, text, link }
}

/** « Nom <adresse@domaine> » ou « adresse@domaine » */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/)
  return m ? { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2] } : { email: from.trim() }
}

export type Provider = 'brevo' | 'resend'

export function providerRequest(provider: Provider, key: string, from: string, to: { email: string; name: string }, mail: { subject: string; html: string; text: string }): { url: string; init: RequestInit } {
  if (provider === 'brevo') {
    const f = parseFrom(from)
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      init: {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: f, to: [{ email: to.email, name: to.name }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text }),
      },
    }
  }
  return {
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to.email], subject: mail.subject, html: mail.html, text: mail.text }),
    },
  }
}
