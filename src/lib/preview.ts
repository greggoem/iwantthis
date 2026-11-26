import { supabase } from './supabase'

export interface Preview {
  found: boolean
  title?: string
  image?: string
  /** autres photos du produit trouvées sur la page, à proposer au choix */
  images?: string[]
  price?: number
  currency?: string
  site?: string
  reason?: string
  /** lien complet et nettoyé (lien court amzn.eu résolu, pistage retiré) */
  url?: string
}

/** Demande à la fonction « link-preview » de lire la fiche produit (titre, image, prix). Ne lève jamais d'erreur. */
export async function fetchPreview(url: string): Promise<Preview> {
  try {
    const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } })
    if (error || !data) return { found: false, reason: 'Service de lecture indisponible pour le moment' }
    const p = data as Preview
    if (isJunkImage(p.image)) { delete p.image; p.found = Boolean(p.title || p.price !== undefined) }
    p.images = (p.images ?? []).filter(u => typeof u === 'string' && /^https:\/\//i.test(u) && !isJunkImage(u))
    return p
  } catch {
    return { found: false, reason: 'Service de lecture indisponible pour le moment' }
  }
}

/** Image inutilisable : pixel de suivi publicitaire (Amazon « fls-… /uedata »), image 1×1, espaceur… */
export function isJunkImage(url: string | null | undefined): boolean {
  if (!url) return false
  return /(^|\.)fls-[a-z]+\.amazon\.|\/uedata|\/batch\/\d+\/OP\/|[\/_.-](1x1|spacer|pixel|transparent)\.(gif|png)\b|^data:/i.test(url)
}

/** Le prix n'est repris que s'il est en euros (ou sans devise indiquée) */
export function euroPrice(p: Preview): number | undefined {
  if (p.price === undefined) return undefined
  return !p.currency || p.currency === 'EUR' ? p.price : undefined
}
