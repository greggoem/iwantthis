import { useCallback, useState } from 'react'
import type { Item } from './types'

export type ViewMode = 'list' | 'gallery'
export type SortKey = 'title' | 'price' | 'store' | 'status'
export type SortDir = 'asc' | 'desc'
export interface ViewPrefs { view: ViewMode; key: SortKey | null; dir: SortDir }

const STORE = 'iwt.view'
const KEYS: SortKey[] = ['title', 'price', 'store', 'status']

function read(): ViewPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) ?? '{}')
    return {
      view: p.view === 'gallery' ? 'gallery' : 'list',
      key: KEYS.includes(p.key) ? p.key : null,
      dir: p.dir === 'desc' ? 'desc' : 'asc',
    }
  } catch { return { view: 'list', key: null, dir: 'asc' } }
}

/** Mode d'affichage (liste / galerie) et tri, mémorisés sur cet appareil */
export function useViewPrefs(): [ViewPrefs, (patch: Partial<ViewPrefs>) => void, (key: SortKey) => void] {
  const [prefs, setPrefs] = useState<ViewPrefs>(read)
  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(STORE, JSON.stringify(next)) } catch { /* stockage indisponible : on garde en mémoire */ }
      return next
    })
  }, [])
  /** Clic sur un titre de colonne : croissant → décroissant → ordre d'ajout */
  const cycle = useCallback((key: SortKey) => {
    setPrefs(prev => {
      const next: ViewPrefs = prev.key !== key ? { ...prev, key, dir: 'asc' }
        : prev.dir === 'asc' ? { ...prev, dir: 'desc' } : { ...prev, key: null, dir: 'asc' }
      try { localStorage.setItem(STORE, JSON.stringify(next)) } catch { /* idem */ }
      return next
    })
  }, [])
  return [prefs, update, cycle]
}

export function hostOf(url: string | null): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/**
 * Trie une série d'envies. Les valeurs absentes (pas de prix, pas de lien) restent toujours en bas.
 * `statusOf` donne un nombre par envie (0 = à offrir … 1 = pris) ; un groupe est valorisé par ses éléments.
 */
export function sortItems(list: Item[], prefs: ViewPrefs, kidsOf: (g: Item) => Item[], statusOf: (it: Item) => number): Item[] {
  if (!prefs.key) return list
  const sign = prefs.dir === 'asc' ? 1 : -1
  const val = (it: Item): string | number | null => {
    const ks = it.is_group ? kidsOf(it) : []
    switch (prefs.key) {
      case 'title': return it.title
      case 'price': {
        const p = it.is_group ? ks.map(k => k.price).filter((x): x is number => x !== null) : (it.price !== null ? [it.price] : [])
        return p.length ? Math.min(...p) : null
      }
      case 'store': {
        const h = it.is_group ? (ks.map(k => hostOf(k.url)).find(Boolean) ?? '') : hostOf(it.url)
        return h || null
      }
      case 'status': return statusOf(it)
      default: return null
    }
  }
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
    return c * sign
  })
}

export const SORT_LABEL: Record<SortKey, string> = { title: 'Nom', price: 'Prix', store: 'Magasin', status: 'Statut' }
