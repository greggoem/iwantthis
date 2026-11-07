import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// URL et clé « anon » : publiques par conception (mêmes valeurs que deploy.yml)
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://enycxafzvcgprfsfkvvc.supabase.co'
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVueWN4YWZ6dmNncHJmc2ZrdnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjYyNzcsImV4cCI6MjEwOTA0MjI3N30.8xX21a9UEUeF2_S66zes0zZmQ9HLInJZCaCVxzfIzPU'

export const PASSWORD = process.env.IWT_TEST_PASSWORD ?? ''
export const USER_A = { email: 'iwt-test-a@iwantthis.gift', name: 'Testeur A' }
export const USER_B = { email: 'iwt-test-b@iwantthis.gift', name: 'Testeur B' }
/** Préfixe des envies créées par les tests (nettoyées à la fin) */
export const TEST_PREFIX = '[test auto]'

/** Bruit de scripts tiers (mesure d'audience, affiliation) : ne fait pas échouer les tests */
const IGNORED = /skimresources|skimlinks|umami|ERR_FAILED|ResizeObserver loop|Download the React DevTools/i

type Fixtures = { problems: string[] }

/**
 * `page` surveillé : erreurs JavaScript, erreurs de console et requêtes du site en échec (4xx/5xx)
 * sont collectées puis vérifiées à la fin de chaque test.
 */
export const test = base.extend<Fixtures>({
  problems: async ({ page, baseURL }, use) => {
    const problems: string[] = []
    const origin = new URL(baseURL!).origin
    // PW_OFFLINE=1 : vérifier les tests sans réseau (Supabase simulé par des réponses vides, scripts tiers bloqués)
    if (process.env.PW_OFFLINE) {
      await page.route(u => !u.href.startsWith(origin), r => r.request().url().startsWith(SUPABASE_URL)
        ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort())
    }
    page.on('pageerror', e => problems.push(`Erreur JavaScript : ${e.message}`))
    page.on('console', m => { if (m.type() === 'error' && !IGNORED.test(m.text())) problems.push(`Console : ${m.text()}`) })
    page.on('response', r => {
      const u = r.url()
      if (r.status() >= 400 && (u.startsWith(origin) || u.startsWith(SUPABASE_URL)) && !IGNORED.test(u))
        problems.push(`HTTP ${r.status()} : ${u.replace(/apikey=[^&]+/, 'apikey=…')}`)
    })
    await use(problems)
    expect(problems, 'Erreurs relevées pendant le test').toEqual([])
  },
})
export { expect }

/** Capture d'écran pleine page jointe au rapport (relue ensuite par l'agent visuel) */
export async function capture(page: Page, info: TestInfo, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts?.ready)
  const body = await page.screenshot({ fullPage: true, animations: 'disabled' })
  await info.attach(`capture-${name}`, { body, contentType: 'image/png' })
}

/** Pas de défilement horizontal parasite (souvent le signe d'un élément qui déborde sur mobile) */
export async function expectNoHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth
    const out: string[] = []
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width > 0 && r.right > w + 2 && s.position !== 'fixed' && !el.closest('[data-allow-overflow], .table-scroll, pre'))
        out.push(`${el.tagName.toLowerCase()}.${(el.className?.toString() || '').split(' ').join('.')} (${Math.round(r.right)}px > ${w}px)`)
    })
    return { scroll: document.documentElement.scrollWidth > w + 2, out: out.slice(0, 5) }
  })
  expect(over.scroll ? over.out : [], 'Éléments qui débordent à droite').toEqual([])
}

/** Images cassées (chargées mais sans dimensions) */
export async function expectNoBrokenImages(page: Page) {
  const broken = await page.evaluate(async () => {
    const imgs = [...document.images].filter(i => i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight)
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))
    return imgs.filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src)
  })
  expect(broken, 'Images qui ne se chargent pas').toEqual([])
}

/** Accessibilité (axe-core) : bloque sur les problèmes « critiques », joint le reste au rapport */
export async function checkA11y(page: Page, info: TestInfo, name: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const summary = res.violations.map(v => `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} élément(s))`)
  if (summary.length) await info.attach(`accessibilite-${name}`, { body: summary.join('\n'), contentType: 'text/plain' })
  expect(res.violations.filter(v => v.impact === 'critical').map(v => `${v.id} — ${v.help}`), 'Problèmes d\'accessibilité critiques').toEqual([])
}

/** Thème appliqué avant le chargement de la page */
export async function useTheme(page: Page, theme: string) {
  await page.addInitScript(t => { try { localStorage.setItem('iwt.theme', t) } catch { /* ignore */ } }, theme)
}

export async function loginUI(page: Page, email: string) {
  await page.goto('#/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).or(page.getByRole('navigation', { name: 'Navigation mobile' }))).toBeVisible()
}

/** Client Supabase côté test (même droits qu'un visiteur connecté : passe par les règles RLS) */
export async function apiAs(email?: string): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  if (email) {
    const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
    if (error) throw new Error(`Connexion API ${email} : ${error.message}`)
  }
  return sb
}
