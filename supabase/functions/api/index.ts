// Fonction Edge « api » : API REST (/v1) + serveur MCP (/mcp) des listes de cadeaux.
//
// Authentification : jeton personnel « ncg_… » (créé dans Mon profil du site).
// Le jeton est vérifié côté base (empreinte SHA-256), puis une vraie session Supabase est ouverte
// au nom de l'utilisateur : toutes les requêtes passent par la sécurité par ligne (RLS),
// comme sur le site. La clé « service » ne sert qu'à vérifier le jeton et ouvrir cette session.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleRequest } from './router.ts'
import { ApiError, type Ctx } from './ops.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://iwantthis.gift/'
const PUBLIC_BASE = `${SUPABASE_URL}/functions/v1/api`

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(SUPABASE_URL, SERVICE_KEY, noSession)
const anon = createClient(SUPABASE_URL, ANON_KEY, noSession)

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// session ouverte au nom de l'utilisateur, réutilisée tant qu'elle est valable (évite 2 appels par requête)
const sessions = new Map<string, { jwt: string; exp: number; uid: string }>()

async function authenticate(token: string): Promise<Ctx> {
  if (!/^ncg_[0-9a-f]{64}$/.test(token)) throw new ApiError(401, 'Jeton invalide')
  const hash = await sha256hex(token)

  // vérifié à CHAQUE requête : une révocation est immédiate
  const { data: uid, error } = await admin.rpc('verify_api_token', { p_hash: hash })
  if (error) { console.error('verify_api_token', error.message); throw new ApiError(500, 'Vérification du jeton impossible') }
  if (!uid) throw new ApiError(401, 'Jeton invalide, expiré ou révoqué')

  let s = sessions.get(hash)
  if (!s || s.uid !== uid || s.exp - Date.now() < 5 * 60_000) {
    const { data: u, error: ue } = await admin.auth.admin.getUserById(uid)
    const email = u?.user?.email
    if (ue || !email) throw new ApiError(500, 'Compte sans adresse e-mail : session impossible')
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = link?.properties?.hashed_token
    if (le || !th) { console.error('generateLink', le?.message); throw new ApiError(500, 'Ouverture de session impossible') }
    const { data: ses, error: ve } = await anon.auth.verifyOtp({ token_hash: th, type: 'magiclink' })
    if (ve || !ses.session) { console.error('verifyOtp', ve?.message); throw new ApiError(500, 'Ouverture de session impossible') }
    s = { jwt: ses.session.access_token, exp: (ses.session.expires_at ?? 0) * 1000, uid }
    if (sessions.size > 200) sessions.clear()
    sessions.set(hash, s)
  }

  const sb = createClient(SUPABASE_URL, ANON_KEY, { ...noSession, global: { headers: { Authorization: `Bearer ${s.jwt}` } } })
  return { sb, uid: s.uid, jwt: s.jwt, siteUrl: SITE_URL, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY }
}

Deno.serve((req) => handleRequest(req, authenticate, PUBLIC_BASE))
