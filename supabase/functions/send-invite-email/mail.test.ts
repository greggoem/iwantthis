function assert(c: unknown, msg = 'assertion'): void { if (!c) throw new Error(msg) }
function assertEquals(a: unknown, b: unknown): void { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
function assertStringIncludes(a: string, b: string): void { if (!a.includes(b)) throw new Error(`« ${b} » absent de « ${a.slice(0, 80)}… »`) }
import { build, buildGroupGift, buildOffer, esc, parseFrom, providerRequest } from './mail.ts'

const m = { invite_name: 'Marie <b>', invite_email: 'marie@x.be', event_name: 'Noël en famille', event_date: '2026-12-25', invite_code: 'abc123', image_url: 'https://x.test/a.jpg', organizer: 'Greg' }

Deno.test('contenu : échappement, lien, image, date', () => {
  const r = build(m, 'https://site.test/app#/x', 'I Want This')
  assertEquals(r.link, 'https://site.test/app/#/e/abc123')
  assertStringIncludes(r.html, 'Marie &lt;b&gt;')
  assert(!r.html.includes('Marie <b>'))
  assertStringIncludes(r.html, '<img src="https://x.test/a.jpg"')
  assertStringIncludes(r.subject, '🎄')
  assertStringIncludes(r.text, 'vendredi 25 décembre 2026')
})
Deno.test('image non https ignorée', () => {
  assert(!build({ ...m, image_url: 'http://x.test/a.jpg' }, 'https://s.test/', 'A').html.includes('<img'))
  assert(!build({ ...m, image_url: null }, 'https://s.test/', 'A').html.includes('<img'))
})
Deno.test('expéditeur', () => {
  assertEquals(parseFrom('I Want This <inv@d.be>'), { name: 'I Want This', email: 'inv@d.be' })
  assertEquals(parseFrom('inv@d.be'), { email: 'inv@d.be' })
})
Deno.test('requêtes Brevo / Resend', () => {
  const mail = { subject: 's', html: 'h', text: 't' }
  const b = providerRequest('brevo', 'K', 'A <a@d.be>', { email: 'x@y.be', name: 'X' }, mail)
  assertEquals(b.url, 'https://api.brevo.com/v3/smtp/email')
  assertEquals((b.init.headers as Record<string, string>)['api-key'], 'K')
  assertEquals(JSON.parse(String(b.init.body)).sender, { name: 'A', email: 'a@d.be' })
  const r = providerRequest('resend', 'K', 'A <a@d.be>', { email: 'x@y.be', name: 'X' }, mail)
  assertEquals((r.init.headers as Record<string, string>).authorization, 'Bearer K')
  assertEquals(JSON.parse(String(r.init.body)).to, ['x@y.be'])
})
Deno.test('esc', () => assertEquals(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'))

Deno.test('propositions de liste', () => {
  const g = buildOffer({ to_email: 'leo@x.be', to_name: null, child_name: 'Léo', from_name: 'Greg et Julie', kind: 'give' }, 'https://s.test/', 'I Want This')
  assertEquals(g.link, 'https://s.test/#/login?email=leo%40x.be')
  assertStringIncludes(g.subject, 'vous confie')
  assertStringIncludes(g.text, 'Bonjour,')
  const m = buildOffer({ to_email: 'j@x.be', to_name: 'Julie <i>', child_name: 'Léo', from_name: 'Greg', kind: 'manage' }, 'https://s.test/', 'I Want This')
  assertStringIncludes(m.html, 'Julie &lt;i&gt;')
  assertStringIncludes(m.text, 'Greg vous propose de gérer')
})

Deno.test('cadeau commun : lien ?g= et montant fixe', () => {
  const m = buildGroupGift({ to_email: 'a@b.be', from_name: 'Greg', recipient_name: 'Mamy', title: 'Spa <luxe>', give_on: '2026-12-24', image_url: null,
    share_token: 'tok', price: 300, split: 'equal', fixed_share: 30, respond_by: null }, 'https://iwantthis.gift/', 'I Want This')
  assert(m.link === 'https://iwantthis.gift/?g=tok')
  assert(m.html.includes('30 €') && m.html.includes('Spa &lt;luxe&gt;'))
  assert(m.subject.includes('Mamy'))
})
