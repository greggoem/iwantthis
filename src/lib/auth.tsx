import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'
import { isTheme, setTheme } from './theme'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  recovery: boolean
  endRecovery: () => void
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null, profile: null, loading: true, recovery: false,
  endRecovery: () => {}, refreshProfile: async () => {},
})
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshProfile = async () => {
    if (!session) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('id,display_name').eq('id', session.user.id).maybeSingle()
    setProfile(data as Profile | null)
  }

  // le thème choisi est enregistré dans le compte : on le retrouve sur tous les appareils
  useEffect(() => {
    const t = session?.user.user_metadata?.theme
    if (isTheme(t)) setTheme(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    // crée la liste de la personne dès sa première connexion, puis charge son profil
    supabase.rpc('ensure_my_list').then(() => refreshProfile())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  return (
    <Ctx.Provider value={{ session, profile, loading, recovery, endRecovery: () => setRecovery(false), refreshProfile }}>
      {children}
    </Ctx.Provider>
  )
}
