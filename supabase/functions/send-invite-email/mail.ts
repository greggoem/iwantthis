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
