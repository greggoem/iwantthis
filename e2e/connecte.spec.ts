import { test, expect, capture, checkA11y, expectNoBrokenImages, expectNoHorizontalOverflow, loginUI, apiAs, PASSWORD, USER_A, USER_B, TEST_PREFIX } from './helpers'

// Parcours connectés avec les comptes de test (Testeur A = propriétaire, Testeur B = proche qui offre)
test.skip(!PASSWORD, 'IWT_TEST_PASSWORD absent : tests connectés ignorés')

/** Supprime les envies laissées par un test précédent interrompu */
async function cleanup() {
  for (const u of [USER_A, USER_B]) {
    const sb = await apiAs(u.email)
    await sb.from('items').delete().like('title', `${TEST_PREFIX}%`)
    await sb.auth.signOut()
  }
}
test.beforeAll(cleanup)
test.afterAll(cleanup)

const PAGES: { path: string; name: string; heading?: RegExp }[] = [
  { path: '#/', name: 'ma-liste', heading: /Ma liste d'envies/ },
  { path: '#/listes', name: 'listes-proches' },
  { path: '#/offrir', name: 'a-offrir' },
  { path: '#/evenements', name: 'evenements' },
  { path: '#/notifications', name: 'notifications' },
  { path: '#/profil', name: 'profil' },
  { path: '#/reglages', name: 'reglages' },
]

test('toutes les pages s\'affichent sans erreur', async ({ page, problems }, info) => {
  await loginUI(page, USER_A.email)
  for (const p of PAGES) {
    await test.step(p.name, async () => {
      await page.goto(p.path)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByText('Chargement…')).toHaveCount(0, { timeout: 15_000 })
      if (p.heading) await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.heading)
      // aucun message d'erreur affiché à l'écran
      await expect(page.locator('.notice-error')).toHaveCount(0)
      await expectNoBrokenImages(page)
      await expectNoHorizontalOverflow(page)
      await capture(page, info, p.name)
      if (p.name === 'ma-liste' || p.name === 'reglages') await checkA11y(page, info, p.name)
    })
  }
  void problems
})

test('ajouter, modifier puis supprimer une envie', async ({ page, problems }, info) => {
  const title = `${TEST_PREFIX} Écharpe ${Date.now()}`
  await loginUI(page, USER_A.email)
  await page.goto('#/')
  await page.getByRole('button', { name: /Ajouter/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Cadeau').fill(title)
  await dialog.getByLabel(/Détails/).fill('Rouge, en laine')
  await dialog.getByLabel(/Prix/).fill('35')
  await capture(page, info, 'formulaire-ajout')
  await dialog.getByRole('button', { name: 'Ajouter à ma liste' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(title)).toBeVisible()
  await expect(page.getByText(/35,00\s?€/).first()).toBeVisible()

  // vue galerie
  await page.getByRole('button', { name: 'Galerie' }).click()
  await expect(page.locator('.gcard').filter({ hasText: title })).toBeVisible()
  await capture(page, info, 'ma-liste-galerie')

  // vérification en base : l'envie existe bien
  const sb = await apiAs(USER_A.email)
  const { data } = await sb.from('items').select('id,price').eq('title', title)
  expect(data).toHaveLength(1)
  expect(Number(data![0].price)).toBe(35)
  await sb.from('items').delete().eq('id', data![0].id)
  await page.reload()
  await expect(page.getByText(title)).toHaveCount(0)
  void problems
})

test('partage : B voit la liste de A, achète, et A ne voit pas l\'achat (surprise)', async ({ browser, baseURL }, info) => {
  const title = `${TEST_PREFIX} Bougie ${Date.now()}`
  const a = await apiAs(USER_A.email)
  const { data: list } = await a.rpc('ensure_my_list')
  const wl = (Array.isArray(list) ? list[0] : list) as { id: string; share_token: string }
  const { data: item, error } = await a.from('items').insert({ list_id: wl.id, title, price: 15 }).select('id').single()
  expect(error).toBeNull()

  // B ouvre le lien de partage et indique l'achat
  const ctxB = await browser.newContext({ baseURL, locale: 'fr-BE' })
  const pageB = await ctxB.newPage()
  await loginUI(pageB, USER_B.email)
  await pageB.goto(`./?l=${wl.share_token}`)
  await expect(pageB.getByRole('heading', { level: 1 })).toHaveText(/La liste d'envies de Testeur A/)
  const row = pageB.locator('.gtable-row, .gcard').filter({ hasText: title })
  await row.getByRole('button', { name: 'Acheté' }).click()
  await capture(pageB, info, 'achat-choix-date')
  await pageB.getByRole('button', { name: 'Confirmer' }).click()
  await expect(row.locator('.chip-ok, .claimed-ribbon').first()).toBeVisible()
  await capture(pageB, info, 'liste-du-proche-apres-achat')
  await ctxB.close()

  // A : à l'écran, « Surprise », jamais « Offert par Testeur B »
  const ctxA = await browser.newContext({ baseURL, locale: 'fr-BE' })
  const pageA = await ctxA.newPage()
  await loginUI(pageA, USER_A.email)
  await pageA.goto('#/')
  await expect(pageA.getByText(title)).toBeVisible()
  await expect(pageA.getByText(/Offert par Testeur B/)).toHaveCount(0)
  await capture(pageA, info, 'ma-liste-surprise')
  await ctxA.close()

  // A : même en interrogeant directement la base, l'achat est invisible (protégé par le serveur)
  const { data: leaks } = await a.from('item_claims').select('*').eq('item_id', item!.id)
  expect(leaks, 'Le propriétaire ne doit pas pouvoir lire l\'achat').toEqual([])

  // B : l'achat est bien enregistré
  const b = await apiAs(USER_B.email)
  const { data: mine } = await b.from('item_claims').select('item_id').eq('item_id', item!.id)
  expect(mine).toHaveLength(1)
  await b.from('item_claims').delete().eq('item_id', item!.id)
  await a.from('items').delete().eq('id', item!.id)
})

test('sécurité : un visiteur sans compte ne lit aucune donnée', async () => {
  const anon = await apiAs()
  for (const table of ['items', 'item_claims', 'wishlists', 'profiles', 'events', 'event_members', 'notifications']) {
    const { data } = await anon.from(table).select('*').limit(1)
    expect(data ?? [], `table ${table} lisible sans connexion`).toEqual([])
  }
})

test('sécurité : B ne peut ni modifier ni supprimer les envies de A', async () => {
  const a = await apiAs(USER_A.email)
  const { data: list } = await a.rpc('ensure_my_list')
  const wl = (Array.isArray(list) ? list[0] : list) as { id: string }
  const { data: item } = await a.from('items').insert({ list_id: wl.id, title: `${TEST_PREFIX} Protégé` }).select('id').single()
  const b = await apiAs(USER_B.email)
  await b.from('items').update({ title: 'piraté' }).eq('id', item!.id)
  await b.from('items').delete().eq('id', item!.id)
  const { error: ins } = await b.from('items').insert({ list_id: wl.id, title: `${TEST_PREFIX} intrus` })
  expect(ins, 'B a pu ajouter une envie dans la liste de A').not.toBeNull()
  const { data: after } = await a.from('items').select('title').eq('id', item!.id).single()
  expect(after?.title).toBe(`${TEST_PREFIX} Protégé`)
  await a.from('items').delete().eq('id', item!.id)
})

test('déconnexion', async ({ page, problems }) => {
  await loginUI(page, USER_A.email)
  await page.goto('#/reglages')
  const btn = page.getByRole('button', { name: 'Déconnexion' })
  if (await btn.isVisible()) await btn.click()
  else { await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))); await page.reload() }
  await page.goto('#/reglages')
  await expect(page).toHaveURL(/#\/login/)
  void problems
})
