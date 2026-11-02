import { supabase } from './supabase'
import { resizeImage } from './eventImage'

const BUCKET = 'item-images'

/** Envoie une image choisie par la personne (photo ou fichier). Renvoie l'adresse publique, ou un message d'erreur. */
export async function uploadItemImage(userId: string, file: File): Promise<{ url: string } | { error: string }> {
  let blob: Blob
  try { blob = await resizeImage(file, 1200) } catch (e) { return { error: (e as Error).message } }
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (up.error) return { error: up.error.message }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}

/** Supprime une image que j'avais envoyée (ignore toute autre adresse). */
export async function deleteItemImage(url: string | null): Promise<void> {
  if (!url) return
  const i = url.indexOf(`/${BUCKET}/`)
  if (i < 0) return
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0])])
}
