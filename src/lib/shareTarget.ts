/**
 * « Partager » depuis une autre application (Android, application installée) : le système ouvre le site avec
 * ?title=…&text=…&url=… . On en tire l'adresse du produit et on ouvre le formulaire d'ajout déjà rempli.
 * Doit s'exécuter avant le routeur (qui lit la partie après le #).
 */
export function consumeShareTarget(): void {
  try {
    const q = new URLSearchParams(window.location.search)
    const text = q.get('text') ?? '', url = q.get('url') ?? '', title = q.get('title') ?? ''
    if (!url && !text && !title) return
    // beaucoup d'applications (Amazon…) glissent l'adresse dans le texte : « Regarde ça https://… »
    const find = (s: string) => s.match(/https?:\/\/[^\s<>"']+/i)?.[0]
    const link = find(url) ?? find(text) ?? find(title)
    const base = window.location.pathname
    if (!link) { window.history.replaceState(null, '', base); return }
    const label = [title, text].map(s => s.replace(/https?:\/\/\S+/gi, '').trim()).find(s => s.length > 2) ?? ''
    const hash = `#/?add=1&u=${encodeURIComponent(link.replace(/[).,;]+$/, ''))}&t=${encodeURIComponent(label.slice(0, 200))}`
    window.history.replaceState(null, '', base + hash)
  } catch { /* on laisse le site s'ouvrir normalement */ }
}
