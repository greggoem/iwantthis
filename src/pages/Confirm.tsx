import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase, errMsg, APP_NAME } from '../lib/supabase'
import Logo from '../components/Logo'
import { Notice, Spinner } from '../components/ui'

/**
 * Page ouverte depuis le lien des e-mails (confirmation d'inscription, mot de passe oublié).
 * Le lien pointe directement vers CE site (et non vers supabase.co) : on valide le jeton ici.
 */
export default function Confirm() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true // le jeton ne sert qu'une fois (évite le double appel de React en dev)
    const token_hash = params.get('token_hash')
    const type = params.get('type') as EmailOtpType | null
    if (!token_hash || !type) { setErr('Lien incomplet. Rouvrez le lien reçu par e-mail.'); return }
    supabase.auth.verifyOtp({ token_hash, type }).then(({ error }) => {
      if (error) setErr(errMsg(error) + ' Le lien a peut-être expiré : recommencez depuis la page de connexion.')
      else if (type === 'signup' || type === 'email') {
        supabase.auth.getUser().then(({ data }) => { try { if (data.user) localStorage.setItem('iwt.welcomed.' + data.user.id, '1') } catch { /* ignore */ } })
        nav('/bienvenue', { replace: true })
      }
      else if (type !== 'recovery') nav('/', { replace: true })
      // type = recovery : le formulaire « Nouveau mot de passe » s'affiche tout seul
    })
  }, [params, nav])

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Logo name={APP_NAME} size={32} />
        {err ? (
          <>
            <Notice>{err}</Notice>
            <Link className="btn" to="/login">Retour à la connexion</Link>
          </>
        ) : <Spinner label="Validation en cours…" />}
      </div>
    </div>
  )
}
