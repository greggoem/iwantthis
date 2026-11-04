export type Theme = 'fete' | 'classique' | 'doodle'
const KEY = 'iwt.theme'
const COLORS: Record<Theme, string> = { fete: '#fffaf0', classique: '#fafaf9', doodle: '#fff5da' }

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === 'fete' || v === 'doodle' ? v : 'classique' } catch { return 'classique' }
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
