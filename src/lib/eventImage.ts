import { supabase } from './supabase'

const BUCKET = 'event-images'

/** Réduit une photo (≈ 1600 px, JPEG) avant l'envoi : rapide et léger, orientation respectée */
export async function resizeImage(file: File, max = 1600, quality = 0.86): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n\'est pas une image.')
  if (file.size > 25 * 1024 * 1024) throw new Error('Image trop lourde (25 Mo maximum).')
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('Impossible de lire cette image. Essayez un JPEG, PNG ou WebP.') }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)       // fond blanc pour les PNG transparents
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Conversion impossible.')), 'image/jpeg', quality))
}

/** Chemin du fichier dans le bucket, d'après son adresse publique */
function pathOf(url: string | null): string | null {
  if (!url) return null
  const i = url.indexOf(`/${BUCKET}/`)
  return i < 0 ? null : decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0])
}

/** Envoie une image pour l'événement, la mémorise et supprime l'ancienne. Renvoie un message d'erreur ou null. */
export async function setEventImage(eventId: string, file: File, oldUrl: string | null): Promise<string | null> {
  let blob: Blob
  try { blob = await resizeImage(file) } catch (e) { return (e as Error).message }
  const path = `${eventId}/${crypto.randomUUID()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (up.error) return up.error.message
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { error } = await supabase.from('events').update({ image_url: url }).eq('id', eventId)
  if (error) { await supabase.storage.from(BUCKET).remove([path]); return error.message }
  const old = pathOf(oldUrl)
  if (old) await supabase.storage.from(BUCKET).remove([old])
  return null
}

export async function removeEventImage(eventId: string, oldUrl: string | null): Promise<string | null> {
  const { error } = await supabase.from('events').update({ image_url: null }).eq('id', eventId)
  if (error) return error.message
  const old = pathOf(oldUrl)
  if (old) await supabase.storage.from(BUCKET).remove([old])
  return null
}
