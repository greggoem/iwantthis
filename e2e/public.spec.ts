import { test, expect, capture, checkA11y, expectNoBrokenImages, expectNoHorizontalOverflow, useTheme } from './helpers'

// Pages visibles sans compte

test.describe('Accueil (visiteur)', () => {
  for (const theme of ['classique', 'fete', 'doodle', 'menthe', 'nuit']) {
    test(`accueil — thème ${theme}`, async ({ page, problems }, info) => {
      await useTheme(page, theme)
      await page.goto('./')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Offrez ce qui fait vraiment plaisir/)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expectNoBrokenImages(page)
      await expectNoHorizontalOverflow(page)
      await capture(page, info, `accueil-${theme}`)
      if (theme === 'classique') await checkA11y(page, info, 'accueil')
      void problems
    })
  }

  test('balises de base (titre, description, partage, PWA)', async ({ page, problems }) => {
    await page.goto('./')
    await expect(page).toHaveTitle(/I Want This/i)
    for (const sel of ['meta[name="description"]', 'meta[property="og:image"]', 'link[rel="manifest"]', 'link[rel="apple-touch-icon"]', 'meta[name="viewport"]'])
      await expect(page.locator(sel), `${sel} manquant`).toHaveCount(1)
    void problems
  })

  test('les boutons « Créer ma liste » et « Connexion » mènent à la connexion', async ({ page, problems }) => {
    await page.goto('./')
    await page.getByRole('link', { name: /Créer ma liste/ }).first().click()
    await expect(page.getByRole('button', { name: /Recevoir un code par e-mail/ })).toBeVisible()
    await page.goto('./')
    await page.getByRole('link', { name: 'Connexion' }).click()
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible()
    void problems
  })
})

test.describe('Connexion', () => {
  test('page de connexion et onglets', async ({ page, problems }, info) => {
    await page.goto('#/login')
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible()
    await capture(page, info, 'connexion')
    await expect(page.getByRole('button', { name: /Recevoir un code par e-mail/ })).toBeVisible()
    await page.getByRole('button', { name: 'Se connecter avec un mot de passe' }).click()
    await expect(page.getByRole('heading', { name: 'Connexion avec mot de passe' })).toBeVisible()
    await capture(page, info, 'connexion-mot-de-passe')
    await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click()
    await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await checkA11y(page, info, 'connexion')
    void problems
  })

  test('mauvais mot de passe : message clair', async ({ page }) => {
    // pas de fixture « problems » ici : la réponse 400 de Supabase est attendue
    await page.goto('#/login')
    await page.getByRole('button', { name: 'Se connecter avec un mot de passe' }).click()
    await page.getByLabel('Votre adresse e-mail').fill('iwt-test-a@iwantthis.gift')
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible()
  })

  test('une page protégée renvoie vers la connexion', async ({ page, problems }) => {
    await page.goto('#/reglages')
    await expect(page).toHaveURL(/#\/login/)
    void problems
  })

  test('un lien de partage sans compte propose de créer un compte', async ({ page, problems }) => {
    await page.goto('./?l=00000000-0000-0000-0000-000000000000')
    await expect(page.getByText(/On vous a partagé une liste d'envies/)).toBeVisible()
    void problems
  })
})

test.describe('Fichiers statiques', () => {
  test('confidentialité', async ({ page, problems }, info) => {
    const r = await page.goto('privacy.html')
    expect(r?.status()).toBe(200)
    await expect(page.locator('body')).toContainText(/confidentialit/i)
    await expectNoHorizontalOverflow(page)
    await capture(page, info, 'confidentialite')
    void problems
  })

  test('confidentialité de l\'extension', async ({ page, problems }) => {
    const r = await page.goto('extension/privacy.html')
    expect(r?.status()).toBe(200)
    void problems
  })

  test('manifeste PWA et icônes', async ({ request }) => {
    const r = await request.get('manifest.webmanifest')
    expect(r.ok()).toBeTruthy()
    const m = await r.json()
    expect(m.name).toBeTruthy()
    expect(m.display).toBe('standalone')
    for (const icon of m.icons as { src: string }[]) {
      const ir = await request.get(icon.src.replace(/^\//, ''))
      expect(ir.ok(), `icône ${icon.src}`).toBeTruthy()
    }
    for (const f of ['apple-touch-icon.png', 'favicon.svg', 'og.png', 'extension/iwt-extension.zip', 'extension/iwt-extension-firefox.zip'])
      expect((await request.get(f)).ok(), f).toBeTruthy()
  })
})

test.describe('Référencement', () => {
  test('robots.txt et sitemap.xml', async ({ request }) => {
    const robots = await request.get('robots.txt')
    expect(robots.ok()).toBeTruthy()
    expect(await robots.text()).toContain('Sitemap: https://iwantthis.gift/sitemap.xml')
    const sitemap = await request.get('sitemap.xml')
    expect(sitemap.ok()).toBeTruthy()
    expect(await sitemap.text()).toContain('<loc>https://iwantthis.gift/tirage-au-sort/</loc>')
  })

  test("l'accueil est lisible sans JavaScript (robots des IA)", async ({ request }) => {
    const html = await (await request.get('./')).text()
    expect(html).toContain('<h1>Offrez ce qui fait vraiment plaisir.</h1>')
    expect(html).toContain('application/ld+json')
  })

  for (const slug of ['comment-ca-marche', 'tirage-au-sort', 'listes-enfants', 'liste-de-noel', 'liste-anniversaire', 'secret-santa-bureau']) {
    test(`page publique /${slug}/`, async ({ page, problems }, info) => {
      const r = await page.goto(`${slug}/`)
      expect(r?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://iwantthis.gift/${slug}/`)
      await expectNoHorizontalOverflow(page)
      await checkA11y(page, info, slug)
      void problems
    })
  }
})
