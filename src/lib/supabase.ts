import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// PKCE : le retour de Google / des e-mails arrive avec ?code=… (compatible avec le routage par #)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
})

export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'I Want This'

/** Adresse du site sans le #, ex. https://greg.github.io/cadeaux/ */
export function siteUrl(): string {
  return window.location.origin + window.location.pathname
}

/** Base de l'API REST / du serveur MCP (fonction Edge « api ») */
export const apiBase = () => `${url ?? ''}/functions/v1/api`

/** Adresse à partager : toujours le domaine officiel (jamais l'ancienne adresse github.io) */
// VITE_SHARE_BASE : forcé pour les captures de la page d'aide (scripts/captures-aide.mjs)
const shareBase = () => import.meta.env.VITE_SHARE_BASE || (/\.github\.io$/.test(window.location.hostname) ? 'https://iwantthis.gift/' : siteUrl())
// Pas de « # » dans les liens partagés : WhatsApp (wa.me) coupe tout ce qui suit le « # ».
// ?l= / ?e= sont convertis en #/l/… / #/e/… au chargement (voir main.tsx).
export const listShareUrl = (token: string) => `${shareBase()}?l=${token}`
export const eventInviteUrl = (code: string) => `${shareBase()}?e=${code}`

export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  const map: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
    'User already registered': 'Un compte existe déjà avec cet e-mail.',
    'Email not confirmed': 'Confirmez d\'abord votre e-mail (lien reçu par courrier).',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
    'For security purposes': 'Un e-mail vient d\'être envoyé. Patientez une minute avant d\'en redemander un.',
    'email rate limit exceeded': 'Trop d\'e-mails envoyés pour le moment. Réessayez dans une heure, ou continuez avec Google.',
  }
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k]
  return m
}
