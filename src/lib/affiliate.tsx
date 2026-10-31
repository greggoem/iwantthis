import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { AffiliateProgram } from './types'

/** Ne garde que les liens http(s) — bloque javascript:, data:, etc. */
export function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

const normHost = (h: string) => h.toLowerCase().replace(/^www\./, '')

function findProgram(u: URL, programs: AffiliateProgram[]): AffiliateProgram | undefined {
  const host = normHost(u.hostname)
  return programs.find(p => {
    const d = normHost(p.domain)
    return host === d || host.endsWith('.' + d)
  })
}

/** Renvoie le lien à ouvrir (avec parrainage si le site en propose un) */
export function buildLink(raw: string | null | undefined, programs: AffiliateProgram[]): { href: string; affiliated: boolean; host: string } | null {
  const u = safeUrl(raw)
  if (!u) return null
  const host = normHost(u.hostname)
  const prog = findProgram(u, programs)
  if (!prog) return { href: u.toString(), affiliated: false, host }

  if (prog.kind === 'param' && prog.param_name && prog.param_value) {
    const out = new URL(u.toString())
    out.searchParams.set(prog.param_name, prog.param_value)
    return { href: out.toString(), affiliated: true, host }
  }
  if (prog.kind === 'template' && prog.template) {
    const href = prog.template
      .split('{url}').join(encodeURIComponent(u.toString()))
      .split('{raw_url}').join(u.toString())
    // sécurité : le résultat doit rester un lien http(s)
    return safeUrl(href) ? { href, affiliated: true, host } : { href: u.toString(), affiliated: false, host }
  }
  return { href: u.toString(), affiliated: false, host }
}

const Ctx = createContext<AffiliateProgram[]>([])
export const useAffiliates = () => useContext(Ctx)

export function AffiliateProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [programs, setPrograms] = useState<AffiliateProgram[]>([])

  useEffect(() => {
    if (!session) { setPrograms([]); return }
    supabase.from('affiliate_programs').select('id,label,domain,kind,param_name,param_value,template')
      .then(({ data }) => setPrograms((data as AffiliateProgram[]) ?? []))
  }, [session])

  return <Ctx.Provider value={programs}>{children}</Ctx.Provider>
}
