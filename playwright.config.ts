import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout de I Want This.
 * - BASE_URL absent : on construit le dépôt et on teste la version locale (vite preview).
 * - BASE_URL=https://iwantthis.gift : on teste le site en ligne.
 * Les tests « connectés » utilisent les comptes iwt-test-a / iwt-test-b et ont besoin de IWT_TEST_PASSWORD.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,               // mêmes comptes de test partout : pas de tests en parallèle
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-BE',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.PW_CHROME_PATH ? 'off' : 'retain-on-failure',
    // pour lancer en local avec un Chrome déjà installé : PW_CHROME_PATH=/usr/bin/google-chrome
    ...(process.env.PW_CHROME_PATH ? { launchOptions: { executablePath: process.env.PW_CHROME_PATH } } : {}),
  },
  projects: [
    { name: 'ordinateur-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'ordinateur-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'iphone-safari', use: { ...devices['iPhone 14'] } },
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
