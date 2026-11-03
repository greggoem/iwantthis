function assert(c: unknown, msg = 'assertion'): void { if (!c) throw new Error(msg) }
function assertEquals(a: unknown, b: unknown): void { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
function assertStringIncludes(a: string, b: string): void { if (!a.includes(b)) throw new Error(`« ${b} » absent de « ${a.slice(0, 80)}… »`) }
import { build, esc, parseFrom, providerRequest } from './mail.ts'

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
