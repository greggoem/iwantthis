import { supabase } from './supabase'

export interface Preview {
  found: boolean
  title?: string
  image?: string
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
    return data as Preview
  } catch {
    return { found: false, reason: 'Service de lecture indisponible pour le moment' }
  }
}

/** Le prix n'est repris que s'il est en euros (ou sans devise indiquée) */
export function euroPrice(p: Preview): number | undefined {
  if (p.price === undefined) return undefined
  return !p.currency || p.currency === 'EUR' ? p.price : undefined
}
