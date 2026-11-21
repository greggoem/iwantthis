// Contenu des e-mails et appels aux services d'envoi (Brevo ou Resend)

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function dateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
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

export interface ChangeMail { email: string; display_name: string; event_name: string; event_date: string; event_time: string | null; location: string | null; organizer: string }

/** E-mail « l'événement a changé » : nouvelle date, heure ou lieu */
export function buildChange(m: ChangeMail, site: string, appName: string, eventId: string): { subject: string; html: string; text: string } {
  const base = site.replace(/#.*$/, '').replace(/\/?$/, '/')
  const link = `${base}#/evenements/${encodeURIComponent(eventId)}`
  const when = dateLong(m.event_date) + (m.event_time ? ` à ${m.event_time.slice(0, 5).replace(':', 'h')}` : '')
  const subject = `📅 « ${m.event_name} » : nouvelles infos`
  const placeHtml = m.location ? `<br>📍 ${esc(m.location)}` : ''
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fffaf1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2150">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <h1 style="font-size:24px;line-height:1.2;margin:0 0 14px">📅 ${esc(m.event_name)}</h1>
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px">Bonjour ${esc(m.display_name)},</p>
  <p style="font-size:16px;line-height:1.55;margin:0 0 14px"><strong>${esc(m.organizer)}</strong> a modifié l'événement. Voici les nouvelles informations :</p>
  <p style="font-size:17px;line-height:1.6;margin:0 0 18px;padding:14px 16px;background:#fff;border-radius:14px;border:1px solid #eee"><strong>🗓️ ${esc(when)}</strong>${placeHtml}</p>
  <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#ff4d8d;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:14px">Voir l'événement</a></p>
  <p style="font-size:12px;color:#9a90bf;margin:14px 0 0">Si le bouton ne marche pas : ${esc(link)} · ${esc(appName)}</p>
</div></body></html>`
  const text = `📅 ${m.event_name}\n\nBonjour ${m.display_name},\n\n${m.organizer} a modifié l'événement. Nouvelles informations :\n${when}${m.location ? `\n${m.location}` : ''}\n\nVoir l'événement : ${link}\n`
  return { subject, html, text }
}
