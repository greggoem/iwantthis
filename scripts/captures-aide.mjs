// Captures d'écran de la page d'aide (/aide), faites sur le vrai site avec des données de démonstration.
//
//   1. VITE_SUPABASE_URL=http://mock.local VITE_SUPABASE_ANON_KEY=x VITE_SHARE_BASE=https://iwantthis.gift/ npx vite build --outDir /tmp/aide-dist --emptyOutDir
//   2. node scripts/captures-aide.mjs /tmp/aide-dist
//
// Aucune vraie donnée : toutes les réponses de Supabase sont simulées ci-dessous (Léa, son fils Tom…).
// Les images sont écrites dans public/aide/ (WebP, format téléphone et ordinateur), et la position
// des repères numérotés dans src/help-marks.json (calculée sur les vrais boutons : toujours juste).
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
const OUT = path.join(here, '..', 'public', 'aide')
const DEMO = path.join(here, 'aide-demo')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 4190, BASE = `http://localhost:${PORT}`
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
const SIZES = { phone: { w: 390, h: 844, scale: 2 }, desktop: { w: 1024, h: 680, scale: 1.5 } }
const MARKS = {}

/** at : tl / tr = coin haut gauche / droit, l / r = milieu du bord gauche / droit */
async function markOf(page, m, vw, vh) {
  const box = await page.locator(m.sel).first().boundingBox()
  if (!box) { console.log('  repère introuvable :', m.sel); return null }
  const x = m.at === 'tr' || m.at === 'r' ? box.x + box.width : box.x
  const y = m.at === 'l' || m.at === 'r' ? box.y + box.height / 2 : box.y
  return { n: m.n, x: Math.round(x / vw * 1000) / 10, y: Math.round(y / vh * 1000) / 10 }
}

const ONLY = process.argv[3]?.split(',')
async function shoot(name, url, steps, opts = {}, marks = []) {
  if (ONLY && !ONLY.some((x) => name.startsWith(x))) return
  const o = { kids: true, ...opts }
  MARKS[name] = {}
  for (const [fmt, sz] of Object.entries(SIZES)) {
    const ctx = await (await browser).newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: sz.scale })
    await ctx.addInitScript((s) => { localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)); localStorage.setItem('iwt.theme', 'classique') }, session)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('ERREUR', name, e.message))
    await page.route('http://mock.local/**', (route) => mock(route, o))
    await page.goto(`${BASE}/${url}`)
    await page.waitForTimeout(1200)
    for (const st of steps) { await st(page); await page.waitForTimeout(450) }
    await page.waitForTimeout(300)
    MARKS[name][fmt] = (await Promise.all(marks.map((m) => markOf(page, m, sz.w, sz.h)))).filter(Boolean)
    const png = path.join('/tmp', `${name}-${fmt}.png`)
    await page.screenshot({ path: png })
    execFileSync('python3', ['-c', `from PIL import Image; Image.open('${png}').convert('RGB').save('${path.join(OUT, `${name}-${fmt}`)}.webp', 'WEBP', quality=82)`])
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

const browser = chromium.launch()
const click = (sel) => (p) => p.click(sel)
const fill = (sel, v) => (p) => p.fill(sel, v)

const MENU = 'button[aria-label="Plus d\'options pour la liste"]'
// 1 · Créer sa liste
await shoot('liste-1-lien', '#/', [click('.page-actions .btn-primary'), fill('.add-step input[type=url]', 'https://www.example.com/pull-col-rond')], { kids: false },
  [{ n: 1, sel: '.add-step input[type=url]', at: 'r' }, { n: 2, sel: 'button:has-text("Coller le lien")', at: 'tl' }, { n: 3, sel: 'button:has-text("Continuer")', at: 'tl' }])
await shoot('liste-2-formulaire', '#/', [click('.page-actions .btn-primary'), fill('.add-step input[type=url]', 'https://www.example.com/pull-col-rond'), click('button:has-text("Continuer")'), (p) => p.waitForTimeout(900), fill('textarea', 'Taille M, couleur rouille')], { kids: false },
  [{ n: 1, sel: '.imgbox', at: 'tl' }, { n: 2, sel: 'textarea', at: 'tl' }, { n: 3, sel: '.modal-foot .btn-primary', at: 'tl' }])
await shoot('liste-3-liste', '#/', [], { kids: false },
  [{ n: 1, sel: '.page-actions button:has-text("Partager")', at: 'tl' }, { n: 2, sel: '.page-actions .btn-primary', at: 'tl' }, { n: 3, sel: 'button[aria-label^="Actions pour"]', at: 'l' }])
// 10 · Ajouter un enfant
await shoot('enfant-1-menu', '#/', [click(MENU)], { kids: false },
  [{ n: 1, sel: MENU, at: 'tr' }, { n: 2, sel: 'text=Ajouter une liste d\'enfant', at: 'l' }])
await shoot('enfant-2-formulaire', '#/', [click(MENU), click('text=Ajouter une liste d\'enfant'), fill('.kid-fields input[required]', 'Tom'), fill('.kid-fields input:not([required])', '7'), click('button[aria-label="Bleu"]')], { kids: false },
  [{ n: 1, sel: '.kid-fields input[required]', at: 'tl' }, { n: 2, sel: '.kid-color', at: 'l' }, { n: 3, sel: 'button:has-text("Créer la liste")', at: 'tl' }])
await shoot('enfant-3-liste', '#/?liste=K1', [], {},
  [{ n: 1, sel: '.lpill.on', at: 'tr' }, { n: 2, sel: '.title-sub a', at: 'r' }])
await shoot('enfant-4-pour-qui', '#/?liste=K1', [click('.page-actions .btn-primary'), fill('.add-step input[type=url]', 'https://www.example.com/caserne'), click('button:has-text("Continuer")'), (p) => p.waitForTimeout(900)], {},
  [{ n: 1, sel: '.for-who .lpill.on', at: 'tr' }])

const scrollTo = (sel) => (p) => p.locator(sel).first().scrollIntoViewIfNeeded()
// 2 · Depuis un site
await shoot('site-1-extension', '#/reglages?s=extension', [scrollTo('.extlist')], { kids: false },
  [{ n: 1, sel: '.extlist .btn-primary', at: 'tl' }])
await shoot('site-2-bouton', '#/', [click('.page-actions .btn-primary'), (p) => p.locator('details.bm').evaluate((d) => { d.open = true }), scrollTo('details.bm a.btn')], { kids: false },
  [{ n: 1, sel: 'details.bm a.btn', at: 'tl' }])
// 3 · Depuis une appli
await shoot('appli-1-guide', '#/reglages?s=extension', [scrollTo('.mob-guide')], { kids: false },
  [{ n: 1, sel: '.mob-cols article', at: 'tl' }])
await shoot('appli-2-partage', '#/?add=1&u=' + encodeURIComponent('https://www.example.com/pull-col-rond') + '&t=Pull', [(p) => p.waitForTimeout(1200)], { kids: false },
  [{ n: 1, sel: '.imgbox', at: 'tl' }])
// 4 · Organiser
await shoot('orga-1-groupe', '#/', [click(MENU)], { kids: false, orga: true },
  [{ n: 1, sel: 'text=Nouveau groupe', at: 'l' }])
await shoot('orga-2-liste', '#/', [], { kids: false, orga: true },
  [{ n: 1, sel: 'text=Livres à lire', at: 'l' }, { n: 2, sel: '.viewbar-right', at: 'tl' }])
// 5 · Partager
await shoot('partager-1', '#/', [click('.page-actions button:has-text("Partager")')], { kids: false },
  [{ n: 1, sel: '.modal input[readonly], .copyfield input', at: 'tl' }])
// 6 · Offrir
await shoot('offrir-1-proches', '#/listes', [], {},
  [{ n: 1, sel: '.pcard', at: 'tl' }])
await shoot('offrir-2-liste', '#/listes/L2', [click('button:has-text("Acheté")')], {},
  [{ n: 1, sel: '.claimbox', at: 'tl' }, { n: 2, sel: '.claimbox .btn-primary', at: 'tl' }])
await shoot('offrir-3-a-offrir', '#/offrir', [], {}, [])
// 7 · La surprise
await shoot('surprise-1', '#/', [], { kids: false }, [{ n: 1, sel: '.chip-quiet', at: 'tl' }])
await shoot('surprise-2', '#/', [], { kids: false, revealed: true }, [{ n: 1, sel: '.gifts-banner .btn-primary', at: 'tl' }])
// 8 · Événements
await shoot('event-1-liste', '#/evenements', [], {}, [{ n: 1, sel: '.page-head .btn-primary', at: 'tl' }])
await shoot('event-2-detail', '#/evenements/E1', [], {}, [{ n: 1, sel: '.ev-btns .btn-primary', at: 'tl' }])
await shoot('event-3-inviter', '#/evenements/E1', [click('.ev-btns .btn-primary')], {}, [{ n: 1, sel: '.modal button:has-text("Partager")', at: 'tl' }])
await shoot('event-4-rejoindre', '#/e/noel24', [], {}, [{ n: 1, sel: 'button:has-text("Rejoindre")', at: 'tl' }])
// 9 · Tirage
await shoot('tirage-1', '#/evenements/E1', [scrollTo('#tirage')], { drawOn: true }, [{ n: 1, sel: '#tirage', at: 'l' }])
await shoot('tirage-2', '#/evenements/E1', [], { draw: true }, [{ n: 1, sel: 'button:has-text("Découvrir")', at: 'tl' }])
// 11 · Réglages
await shoot('reglages-1-menu', '#/', [click('button[aria-label="Menu du compte"]')], { kids: false }, [])
await shoot('reglages-2-apparence', '#/reglages?s=apparence', [], { kids: false }, [])

const marksFile = path.join(here, '..', 'src', 'help-marks.json')
const old = ONLY && fs.existsSync(marksFile) ? JSON.parse(fs.readFileSync(marksFile, 'utf8')) : {}
fs.writeFileSync(marksFile, JSON.stringify({ ...old, ...MARKS }) + '\n')
await (await browser).close()
server.close()
