// Captures d'écran de la page d'aide (/aide), faites sur le vrai site avec des données de démonstration.
//
//   1. VITE_SUPABASE_URL=http://mock.local VITE_SUPABASE_ANON_KEY=x npx vite build --outDir /tmp/aide-dist --emptyOutDir
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
const user = { id: ME, aud: 'authenticated', email: 'lea@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' }
const session = { access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user }
const MINE = { id: 'L1', owner_id: ME, title: "Ma liste d'envies", share_token: '11111111-1111-1111-1111-111111111111', child_name: null, in_events: true }
const TOM = { id: 'K1', owner_id: ME, title: "Ma liste d'envies", share_token: '22222222-2222-2222-2222-222222222222', child_name: 'Tom', child_age: '7', child_color: 'bleu', in_events: true }
const it = (id, list, title, price, image, details = null, url = 'https://www.example.com/p') => ({ id, list_id: list, title, url, details, price, image_url: img(image), parent_id: null, is_group: false, pick_one: false, is_favorite: false, created_at: '2026-11-0' + id.slice(-1) })
const ITEMS = {
  L1: [it('i1', 'L1', 'Pull col rond en maille', 39.95, 'pull', 'Taille M, rouille'), it('i2', 'L1', 'Baskets en toile', 69, 'baskets', 'Pointure 39'), it('i3', 'L1', 'Casque sans fil', 129, 'casque')],
  K1: [it('i4', 'K1', 'Caserne de pompiers en briques', 59.99, 'lego', 'À partir de 6 ans'), it('i5', 'K1', 'Trottinette 3 roues', 34.99, 'trottinette'), it('i6', 'K1', 'Livre « Les dinosaures »', 12.5, 'livre')],
}

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

async function shoot(name, url, steps, { kids = true } = {}, marks = []) {
  MARKS[name] = {}
  for (const [fmt, sz] of Object.entries(SIZES)) {
    const ctx = await (await browser).newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: sz.scale })
    await ctx.addInitScript((s) => { localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)); localStorage.setItem('iwt.theme', 'classique') }, session)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('ERREUR', name, e.message))
    await page.route('http://mock.local/**', (route) => mock(route, kids))
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

async function mock(route, kids) {
  const req = route.request(), u = new URL(req.url()), p = u.pathname, q = u.searchParams
  const ok = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (p.endsWith('/auth/v1/user')) return ok(user)
  if (p.endsWith('/rpc/ensure_my_list')) return ok(MINE)
  if (p.endsWith('/profiles')) return ok(q.get('id')?.startsWith('eq.') ? { id: ME, display_name: 'Léa' } : [{ id: ME, display_name: 'Léa' }, { id: MARC, display_name: 'Marc' }])
  if (p.endsWith('/functions/v1/link-preview')) {
    await new Promise((r) => setTimeout(r, 400))
    const lego = (req.postData() ?? '').includes('caserne')
    return ok(lego ? { found: true, title: 'Caserne de pompiers en briques', image: img('lego'), price: 59.99, currency: 'EUR', site: 'example.com' }
      : { found: true, title: 'Pull col rond en maille', image: img('pull'), price: 39.95, currency: 'EUR', site: 'example.com' })
  }
  if (p.endsWith('/wishlists')) return ok(q.get('child_name') === 'not.is.null' && kids ? [TOM] : [])
  if (p.endsWith('/items')) { const l = (q.get('list_id') ?? '').replace('eq.', ''); return ok(q.get('is_group') ? [] : ITEMS[l] ?? []) }
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

fs.writeFileSync(path.join(here, '..', 'src', 'help-marks.json'), JSON.stringify(MARKS) + '\n')
await (await browser).close()
server.close()
