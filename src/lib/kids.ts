import type { Wishlist } from './types'

/** Couleurs des pastilles des enfants (fond, texte) */
export const KID_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  corail: { bg: '#ffd9cf', fg: '#8a2a12', label: 'Corail' },
  bleu: { bg: '#d6ecff', fg: '#0b4a80', label: 'Bleu' },
  vert: { bg: '#d8f3e2', fg: '#11592f', label: 'Vert' },
  jaune: { bg: '#fdf0c4', fg: '#6b4e00', label: 'Jaune' },
  violet: { bg: '#ece0fb', fg: '#4b2380', label: 'Violet' },
}
export const KID_COLOR_KEYS = Object.keys(KID_COLORS)

export const isKid = (w: Pick<Wishlist, 'child_name'> | null | undefined): boolean => !!w?.child_name

/** Nom affiché d'une liste : le prénom de l'enfant, sinon le nom du titulaire du compte */
export const listPerson = (w: Pick<Wishlist, 'child_name' | 'owner_id'>, names: Record<string, string>, fallback = 'Quelqu\'un'): string =>
  w.child_name || names[w.owner_id] || fallback

/** Visible dans tel événement ? (liste d'enfant : réglage de l'événement, sinon réglage par défaut) */
export function kidShownIn(w: Pick<Wishlist, 'id' | 'child_name' | 'in_events'>, eventId: string, overrides: { event_id: string; list_id: string; shown: boolean }[]): boolean {
  if (!w.child_name) return true
  const o = overrides.find(x => x.event_id === eventId && x.list_id === w.id)
  return o ? o.shown : w.in_events !== false
}

/** Dernière liste utilisée sur cet appareil pour ajouter une envie */
const LAST = 'iwt.lastList'
export const lastListId = (): string | null => { try { return localStorage.getItem(LAST) } catch { return null } }
export const rememberList = (id: string) => { try { localStorage.setItem(LAST, id) } catch { /* rien */ } }

/** « 14 » → « 14 ans », « 1 » → « 1 an » ; un texte libre (« 18 mois ») reste tel quel */
export const formatAge = (age: string | null | undefined): string => {
  const a = (age ?? '').trim()
  if (!a) return ''
  const n = a.match(/^(\d{1,3})(?:[.,]\d+)?$/)
  return n ? `${a} an${Number(n[1]) > 1 ? 's' : ''}` : a
}
