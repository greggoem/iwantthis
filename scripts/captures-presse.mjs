// Captures d'écran pour la page presse (/presse.html) : le vrai site, avec des données de démonstration.
// Même principe et mêmes données simulées que scripts/captures-aide.mjs.
//
//   1. VITE_SUPABASE_URL=http://mock.local VITE_SUPABASE_ANON_KEY=x VITE_SHARE_BASE=https://iwantthis.gift/ npx vite build --outDir /tmp/aide-dist --emptyOutDir
//   2. node scripts/captures-presse.mjs /tmp/aide-dist
//
// Aucune vraie donnée : toutes les réponses de Supabase sont simulées ci-dessous (Léa, son fils Tom…).
// Les images sont écrites dans public/presse/ (JPEG haute définition, téléphone et ordinateur).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = await import(process.env.PLAYWRIGHT ?? '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')) }

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = process.argv[2] ?? '/tmp/aide-dist'
const OUT = path.join(here, '..', 'public', 'presse')
const DEMO = path.join(here, 'aide-demo')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 4191, BASE = `http://localhost:${PORT}`
const img = (n) => `${BASE}/demo/${n}.png`

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  const f = p.startsWith('/demo/') ? path.join(DEMO, p.slice(6)) : path.join(DIST, p === '/' ? 'index.html' : p)
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
}).listen(PORT)

// ---------- données de démonstration ----------
const ME = '00000000-0000-0000-0000-0000000000aa', MARC = '00000000-0000-0000-0000-0000000000bb'
const JULIE = '00000000-0000-0000-0000-0000000000cc', PAUL = '00000000-0000-0000-0000-0000000000dd'
const NAMES = { [ME]: 'Léa', [MARC]: 'Marc', [JULIE]: 'Julie', [PAUL]: 'Paul' }
const user = { id: ME, aud: 'authenticated', email: 'lea@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' }
const session = { access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user }
const wl = (id, owner, extra = {}) => ({ id, owner_id: owner, title: "Ma liste d'envies", share_token: `7f3a9c2e-4b1d-4e8a-9c3f-${id.toLowerCase().padStart(12, '0')}`, child_name: null, child_age: null, child_color: null, in_events: true, ...extra })
const MINE = wl('L1', ME), TOM = wl('K1', ME, { child_name: 'Tom', child_age: '7', child_color: 'bleu' })
const MARCL = wl('L2', MARC), JULIEL = wl('L3', JULIE), PAULL = wl('L4', PAUL)
const LISTS = [MINE, TOM, MARCL, JULIEL, PAULL]
const it = (id, list, title, price, image, details = null, extra = {}) => ({ id, list_id: list, title, url: 'https://www.example.com/p', details, price, image_url: image ? img(image) : null, parent_id: null, is_group: false, pick_one: false, is_favorite: false, created_at: '2026-11-0' + id.slice(-1), ...extra })
const ITEMS = {
  L1: [it('i1', 'L1', 'Pull col rond en maille', 39.95, 'pull', 'Taille M, rouille'), it('i2', 'L1', 'Baskets en toile', 69, 'baskets', 'Pointure 39'), it('i3', 'L1', 'Casque sans fil', 129, 'casque')],
  K1: [it('i4', 'K1', 'Caserne de pompiers en briques', 59.99, 'lego', 'À partir de 6 ans'), it('i5', 'K1', 'Trottinette 3 roues', 34.99, 'trottinette'), it('i6', 'K1', 'Livre « Les dinosaures »', 12.5, 'livre')],
  L2: [it('j1', 'L2', 'Casque sans fil', 129, 'casque'), it('j2', 'L2', 'Livre de cuisine italienne', 29.9, 'livre'), it('j3', 'L2', 'Baskets de course', 89, 'baskets', 'Pointure 43')],
  L3: [it('k1', 'L3', 'Pull en laine', 59, 'pull', 'Taille S'), it('k2', 'L3', 'Roman policier', 21.5, 'livre')],
  L4: [],
}
// groupe et favori (étape « Organiser »)
const ORGA = [
  { ...ITEMS.L1[0], is_favorite: true },
  it('g1', 'L1', 'Livres à lire', null, null, 'Un seul suffit', { is_group: true, pick_one: true }),
  it('g2', 'L1', 'Roman policier', 21.5, 'livre', null, { parent_id: 'g1' }),
  it('g3', 'L1', 'Livre de cuisine', 29.9, 'livre', null, { parent_id: 'g1' }),
  ITEMS.L1[1], ITEMS.L1[2],
]
const EV = { id: 'E1', name: 'Noël en famille', event_date: '2026-12-24', event_time: '19:00:00', location: 'Chez Léa, Bruxelles', created_by: ME, invite_code: 'noel24', draw_enabled: false, draw_done_at: null, draw_count: 0, image_url: null, created_at: '2026-11-01' }
const EV2 = { ...EV, id: 'E2', name: 'Anniversaire de Marc', event_date: '2027-02-14', event_time: null, location: null, created_by: MARC, invite_code: 'marc40' }
const MEMBERS = [ME, MARC, JULIE, PAUL]
const past = '2026-11-01'
// achats : Paul a pris le pull de Julie ; Léa a pris le roman de Julie
const CLAIMS = [
  { item_id: 'k1', claimed_by: PAUL, claimed_by_name: 'Paul', event_id: 'E1', reveal_on: '2026-12-24', owner_seen_at: null, discreet: false },
  { item_id: 'k2', claimed_by: ME, claimed_by_name: 'Léa', event_id: 'E1', reveal_on: '2026-12-24', owner_seen_at: null, discreet: false },
]
const REVEALED = [{ item_id: 'i2', claimed_by: MARC, claimed_by_name: 'Marc', event_id: null, reveal_on: past, owner_seen_at: null, discreet: false }]
const SIZES = { phone: { w: 390, h: 844, scale: 3 }, desktop: { w: 1100, h: 760, scale: 2 } }

async function shoot(name, url, steps, opts = {}) {
  const o = { kids: true, ...opts }
  for (const [fmt, sz] of Object.entries(SIZES)) {
    if (o.only && o.only !== fmt) continue
    const ctx = await (await browser).newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: sz.scale })
    await ctx.addInitScript(([s, theme, view, auth]) => {
      if (auth) localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
      localStorage.setItem('iwt.theme', theme)
      localStorage.setItem('iwt.view', JSON.stringify({ view, zoom: 1 }))
    }, [session, o.theme ?? 'classique', o.view ?? 'list', o.auth !== false])
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('ERREUR', name, e.message))
    await page.route('http://mock.local/**', (route) => mock(route, o))
    await page.goto(`${BASE}/${url}`)
    await page.waitForTimeout(1500)
    for (const st of steps) { await st(page); await page.waitForTimeout(450) }
    await page.waitForTimeout(400)
    const png = path.join('/tmp', `presse-${name}-${fmt}.png`)
    await page.screenshot({ path: png })
    execFileSync('python3', ['-c', `from PIL import Image; Image.open('${png}').convert('RGB').save('${path.join(OUT, `${name}-${fmt}`)}.jpg', 'JPEG', quality=88)`])
    await ctx.close()
  }
  console.log('✓', name)
}

async function mock(route, o) {
  const req = route.request(), u = new URL(req.url()), p = u.pathname, q = u.searchParams, sel = q.get('select') ?? ''
  const ok = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' }, body: JSON.stringify(b) })
  const eqv = (k) => (q.get(k) ?? '').replace(/^eq\./, '')
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (req.method() !== 'GET' && !p.includes('/rpc/') && !p.includes('/functions/')) return ok([])
  if (p.endsWith('/auth/v1/user')) return ok(user)
  if (p.endsWith('/rpc/ensure_my_list')) return ok(MINE)
  if (p.endsWith('/rpc/event_invite_info')) return ok({ id: null, name: EV.name, date: EV.event_date, time: '19:00:00', location: EV.location, image: null, by: 'Léa', members: 4 })
  if (p.endsWith('/rpc/is_admin')) return ok(false)
  if (p.includes('/rpc/')) return ok([])
  if (p.endsWith('/functions/v1/link-preview')) {
    await new Promise((r) => setTimeout(r, 400))
    const lego = (req.postData() ?? '').includes('caserne')
    return ok(lego ? { found: true, title: 'Caserne de pompiers en briques', image: img('lego'), price: 59.99, currency: 'EUR', site: 'example.com' }
      : { found: true, title: 'Pull col rond en maille', image: img('pull'), price: 39.95, currency: 'EUR', site: 'example.com' })
  }
  if (p.endsWith('/profiles')) {
    if (q.get('id')?.startsWith('eq.')) { const id = eqv('id'); return ok({ id, display_name: NAMES[id] }) }
    return ok(Object.entries(NAMES).map(([id, display_name]) => ({ id, display_name })))
  }
  const count = (l) => ({ ...l, items: [{ count: (ITEMS[l.id] ?? []).length }] })
  if (p.endsWith('/wishlists')) {
    if (q.get('child_name') === 'not.is.null') return ok(o.kids ? [TOM] : [])
    if (q.get('id')) return ok(LISTS.find((l) => l.id === eqv('id')))
    if (q.get('or')) return ok([MARCL, JULIEL, PAULL, ...(o.kids ? [TOM] : [])].map(count))
    if (q.get('owner_id')?.startsWith('in.')) return ok([MINE, MARCL, JULIEL, PAULL, ...(o.kids ? [TOM] : [])].map(count))
    return ok([])
  }
  if (p.endsWith('/items')) {
    const l = eqv('list_id')
    if (q.get('is_group')) return ok([])
    return ok(o.orga && l === 'L1' ? ORGA : ITEMS[l] ?? [])
  }
  if (p.endsWith('/item_claims')) {
    if (sel.includes('items(')) {
      const all = Object.values(ITEMS).flat()
      return ok(CLAIMS.filter((c) => c.claimed_by === ME).map((c) => {
        const i = all.find((x) => x.id === c.item_id)
        return { ...c, items: { ...i, wishlists: { owner_id: LISTS.find((l) => l.id === i.list_id).owner_id, child_name: null } }, events: { name: EV.name } }
      }))
    }
    return ok(o.revealed ? REVEALED : CLAIMS)
  }
  const evRow = (e) => ({ ...e, ...(o.drawOn ? { draw_enabled: true } : {}), ...(o.draw ? { draw_enabled: true, draw_done_at: '2026-11-10T10:00:00Z', draw_count: 4 } : {}) })
  if (p.endsWith('/events')) {
    if (q.get('id')) return ok(evRow(EV))
    if (sel.includes('event_members(count)')) return ok([EV, EV2].map((e) => ({ ...evRow(e), event_members: [{ count: e.id === 'E1' ? 4 : 3 }] })))
    return ok([evRow(EV), EV2].map((e) => ({ ...e, event_members: MEMBERS.map((m) => ({ user_id: m })) })))
  }
  if (p.endsWith('/event_members')) return ok(MEMBERS.map((m) => ({ event_id: 'E1', user_id: m, in_draw: true, profiles: { display_name: NAMES[m] } })))
  if (p.endsWith('/draw_assignments')) return ok(o.draw ? { receiver_id: JULIE } : null)
  return ok([])
}


const browser = chromium.launch(process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {})
const click = (sel) => (p) => p.click(sel)
const scrollTo = (sel) => (p) => p.locator(sel).first().scrollIntoViewIfNeeded()

// Accueil (visiteur)
await shoot('1-accueil', '', [], { auth: false })
// Ma liste d'envies, en galerie
await shoot('2-ma-liste', '#/', [], { kids: false, view: 'gallery' })
// La liste d'un proche : ce qui est déjà acheté se voit (pas par le destinataire)
await shoot('3-liste-proche', '#/listes/L3', [], {})
// Indiquer un achat
await shoot('4-achat', '#/listes/L2', [click('button:has-text("Acheté")')], {})
// La liste d'un enfant
await shoot('5-liste-enfant', '#/?liste=K1', [], { view: 'gallery' })
// Événement + tirage au sort
await shoot('6-evenement', '#/evenements/E1', [], { draw: true })
// Thème « fête »
await shoot('7-theme-fete', '#/', [], { kids: false, view: 'gallery', theme: 'fete' })

await (await browser).close()
server.close()
