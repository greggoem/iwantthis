import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, siteUrl, errMsg, APP_NAME } from '../lib/supabase'
import Logo from '../components/Logo'
import { Notice } from '../components/ui'
import { getTheme } from '../lib/theme'

type Mode = 'in' | 'up' | 'forgot'

/** Passer à true une fois « Sign in with Apple » configuré dans Supabase (Authentication → Providers → Apple) */
const APPLE_ENABLED = false

/** Logo « G » de Google (quatre couleurs officielles) */
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

export default function Login() {
  const [params] = useSearchParams()
  const pending = sessionStorage.getItem('postLoginPath') ?? ''
  const invite = pending.startsWith('/l/') ? 'list' : pending.startsWith('/e/') ? 'event' : null
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'up' || invite ? 'up' : 'in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({
          email, password: pw,
          options: { data: { display_name: name.trim(), theme: getTheme() }, emailRedirectTo: siteUrl() },
        })
        if (error) throw error
        if (!data.session) setInfo('Compte créé ! Cliquez sur le lien de confirmation reçu par e-mail, puis connectez-vous.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })
        if (error) throw error
        setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d\'être envoyé. Pensez à regarder dans les indésirables (spam).')
      }
    } catch (x) {
      setErr(errMsg(x))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } })
    if (error) setErr(errMsg(error))
  }

  const apple = async () => {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: siteUrl() } })
    if (error) setErr(errMsg(error))
  }

  return (
    <div className="auth-wrap">
      <Link to="/" className="auth-back">← Accueil</Link>
      <form className="card auth-card" onSubmit={submit}>
        <Logo name={APP_NAME} size={32} />
        <p className="muted">Partagez vos envies, offrez sans doublon, tirez au sort en famille.</p>

        {mode !== 'forgot' && (
          <div className="tabs">
            <button type="button" className={mode === 'in' ? 'tab on' : 'tab'} onClick={() => setMode('in')}>Connexion</button>
            <button type="button" className={mode === 'up' ? 'tab on' : 'tab'} onClick={() => setMode('up')}>Créer un compte</button>
          </div>
        )}
        {mode === 'forgot' && <h2>Mot de passe oublié</h2>}

        {invite && (
          <Notice kind="info">
            {invite === 'list' ? 'On vous a partagé une liste de cadeaux. ' : 'On vous invite à un événement. '}
            Créez votre compte gratuit (ou connectez-vous) pour {invite === 'list' ? 'la voir' : 'le rejoindre'}.
          </Notice>
        )}
        <Notice>{err}</Notice>
        <Notice kind="ok">{info}</Notice>

        {mode === 'up' && (
          <label>Votre prénom (affiché aux autres)
            <input required value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
          </label>
        )}
        <label>E-mail
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label>Mot de passe
            <input type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </label>
        )}

        <button className="btn btn-primary" disabled={busy}>
          {mode === 'in' ? 'Se connecter' : mode === 'up' ? 'Créer mon compte' : 'Envoyer le lien'}
        </button>

        {mode === 'in' && (
          <button type="button" className="link small" onClick={() => { setMode('forgot'); setErr(''); setInfo('') }}>Mot de passe oublié ?</button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link small" onClick={() => { setMode('in'); setErr(''); setInfo('') }}>← Retour</button>
        )}

        {mode !== 'forgot' && (
          <>
            <div className="or"><span>ou</span></div>
            <button type="button" className="btn btn-social" onClick={google}><GoogleG /> Continuer avec Google</button>
            {APPLE_ENABLED && <button type="button" className="btn" onClick={apple}>Continuer avec Apple</button>}
          </>
        )}
      </form>
    </div>
  )
}
