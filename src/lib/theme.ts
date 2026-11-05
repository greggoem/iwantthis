export type Theme = 'fete' | 'classique' | 'doodle' | 'couleur'
const KEY = 'iwt.theme'
const COLORS: Record<Theme, string> = { fete: '#fffaf0', classique: '#fafaf9', doodle: '#fff5da', couleur: '#fafaf9' }

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === 'fete' || v === 'doodle' || v === 'couleur' ? v : 'classique' } catch { return 'classique' }
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

export const isTheme = (v: unknown): v is Theme => v === 'fete' || v === 'classique' || v === 'doodle' || v === 'couleur'
