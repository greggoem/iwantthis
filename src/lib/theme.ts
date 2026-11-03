export type Theme = 'fete' | 'classique'
const KEY = 'iwt.theme'
const COLORS: Record<Theme, string> = { fete: '#fffaf0', classique: '#fafaf9' }

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'classique' ? 'classique' : 'fete' } catch { return 'fete' }
}

/** Applique le thème au document (attribut sur <html>) et à la couleur de la barre du navigateur */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[t])
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t) } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  applyTheme(t)
}
