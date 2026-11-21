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

export type ReminderKind = 'activation' | 'first_wish'
export interface ReminderRow { email: string; display_name: string | null }

const STORES = {
  chrome: 'https://chromewebstore.google.com/detail/flieedooclbbhihafmimamgphhilgedb',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/i-want-this/ieimbhjicpkcgahghhdhjhafbnifdpmj',
  firefox: 'https://addons.mozilla.org/addon/i-want-this/',
}
const btn = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:#ff4d8d;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:14px">${esc(label)}</a></p>`
const P = (html: string) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${html}</p>`

/** Relance « compte créé mais pas encore utilisé » ou « liste sans envie » */
export function buildReminder(kind: ReminderKind, r: ReminderRow, site: string, appName: string): { subject: string; html: string; text: string } {
  const base = site.replace(/#.*$/, '').replace(/\/?$/, '/')
  const hello = r.display_name ? `Bonjour ${r.display_name},` : 'Bonjour,'
  const foot = `<p style="font-size:12px;color:#9a90bf;margin:22px 0 0">Vous recevez ce message une seule fois, parce que vous avez créé un compte sur ${esc(appName)}.</p>`
  let subject: string, body: string, text: string
  if (kind === 'activation') {
    const link = `${base}#/login?email=${encodeURIComponent(r.email)}`
    subject = `🎁 Votre liste d'envies vous attend sur ${appName}`
    body = P(esc(hello)) +
      P(`Vous avez créé un compte sur <strong>${esc(appName)}</strong>, mais votre liste d'envies est encore vide. Il suffit d'une minute pour la commencer :`) +
      `<ol style="font-size:16px;line-height:1.6;margin:0 0 14px;padding-left:22px">
        <li>Connectez-vous : <strong>pas de mot de passe</strong>, un code reçu par e-mail ou votre compte Google.</li>
        <li>Ajoutez vos envies en collant le lien d'un produit : l'image et le prix se remplissent tout seuls.</li>
        <li>Partagez votre liste : vos proches voient ce qui vous fait plaisir, et les achats restent une surprise.</li>
      </ol>` + btn(link, 'Commencer ma liste')
    text = `${hello}\n\nVous avez créé un compte sur ${appName}, mais votre liste d'envies est encore vide. Il suffit d'une minute :\n1. Connectez-vous (pas de mot de passe : un code par e-mail ou Google).\n2. Ajoutez vos envies en collant le lien d'un produit.\n3. Partagez votre liste avec vos proches.\n\nCommencer ma liste : ${link}\n`
  } else {
    const link = `${base}#/`
    const help = `${base}#/aide`
    subject = `✨ Ajoutez votre première envie en un clic`
    body = P(esc(hello)) +
      P(`Votre liste sur <strong>${esc(appName)}</strong> est prête, il ne manque plus que vos envies ! Le plus simple :`) +
      `<p style="font-size:16px;line-height:1.55;margin:0 0 8px"><strong>💻 Sur ordinateur</strong> : installez le bouton ${esc(appName)}. Sur la page d'un produit, un clic suffit pour l'ajouter avec son image et son prix.</p>
       <p style="font-size:15px;line-height:1.8;margin:0 0 14px">
         <a href="${STORES.chrome}" style="color:#2a2150">Chrome</a> · <a href="${STORES.edge}" style="color:#2a2150">Edge</a> · <a href="${STORES.firefox}" style="color:#2a2150">Firefox</a>
       </p>
       <p style="font-size:16px;line-height:1.55;margin:0 0 14px"><strong>📱 Sur téléphone</strong> : depuis l'appli ou le site d'un magasin, touchez <em>Partager</em> puis <strong>${esc(appName)}</strong> (sur iPhone, le raccourci s'installe en deux touches : <a href="${esc(help)}" style="color:#2a2150">voir comment</a>).</p>` +
      P('Vous pouvez aussi simplement coller le lien d\'un produit dans votre liste.') + btn(link, 'Ajouter ma première envie')
    text = `${hello}\n\nVotre liste sur ${appName} est prête, il ne manque plus que vos envies !\n\nSur ordinateur, installez le bouton ${appName} :\nChrome : ${STORES.chrome}\nEdge : ${STORES.edge}\nFirefox : ${STORES.firefox}\n\nSur téléphone : depuis un magasin, touchez Partager puis ${appName}. Comment faire : ${help}\n\nAjouter ma première envie : ${link}\n`
  }
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fffaf1;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#2a2150">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <h1 style="font-size:22px;line-height:1.2;margin:0 0 16px">${esc(appName)}</h1>
  ${body}
  ${foot}
</div></body></html>`
  return { subject, html, text: text + `\nVous recevez ce message une seule fois, parce que vous avez créé un compte sur ${appName}.\n` }
}
