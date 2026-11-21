import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, siteUrl, errMsg, APP_NAME } from '../lib/supabase'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import { Notice } from '../components/ui'
import { getTheme } from '../lib/theme'

/** start : Google ou code par e-mail · code : saisie du code · pw : mot de passe · forgot : mot de passe oublié */
type Mode = 'start' | 'code' | 'pw' | 'forgot'

/** Passer à true une fois « Sign in with Apple » configuré dans Supabase (Authentication → Providers → Apple) */
const APPLE_ENABLED = false
/** Longueur du code envoyé par e-mail (Supabase → Authentication → Email → « Email OTP Length ») */
export const OTP_LENGTH = 8

/** Logo « G » de Google (quatre couleurs officielles) */
const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

/**
 * Connexion et inscription, sans mot de passe : Google, ou un code reçu par e-mail.
 * Même chemin pour un membre (il retrouve son compte grâce à son adresse) et pour un nouveau (le compte est créé).
 */
export default function Login() {
  const pending = sessionStorage.getItem('postLoginPath') ?? ''
  const invite = pending.startsWith('/l/') ? 'list' : pending.startsWith('/e/') ? 'event' : null
  const [mode, setMode] = useState<Mode>('start')
  // lien des e-mails de relance : #/login?email=… préremplit l'adresse
  const [email, setEmail] = useState(() => {
    const fromLink = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('email')
    if (fromLink && fromLink.includes('@')) return fromLink.slice(0, 200)
    try { return localStorage.getItem('iwt.lastEmail') ?? '' } catch { return '' }
  })
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)   // secondes avant de pouvoir renvoyer un code
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const reset = (m: Mode) => { setMode(m); setErr(''); setInfo('') }
  const remember = () => { try { localStorage.setItem('iwt.lastEmail', email.trim()) } catch { /* rien */ } }

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: siteUrl(), data: { theme: getTheme() } },
    })
    setBusy(false)
    if (error) { setErr(errMsg(error)); return }
    remember(); setCode(''); setMode('code'); setWait(60)
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  const verify = async (token = code) => {
    if (busy) return
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' })
    setBusy(false)
    if (error) { setErr(/expired|invalid/i.test(error.message) ? 'Ce code n\'est pas bon ou a expiré. Vérifiez-le, ou demandez-en un nouveau.' : errMsg(error)); setCode('') }
    // connecté : l'application prend le relais (première étape pour un nouveau compte, sinon la liste)
  }

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    setCode(digits)
    if (digits.length === OTP_LENGTH) verify(digits)
  }

  const passwordLogin = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) setErr(errMsg(error)); else remember()
  }

  const forgot = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
    setBusy(false)
    if (error) setErr(errMsg(error))
    else setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d\'être envoyé. Pensez à regarder dans les indésirables (spam).')
  }

  const oauth = async (provider: 'google' | 'apple') => {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } })
    if (error) setErr(errMsg(error))
  }

  const emailField = (
    <label>Votre adresse e-mail
      <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="prenom@exemple.be" />
    </label>
  )

  return (
    <div className="auth-wrap">
      <Link to="/" className="auth-back">← Accueil</Link>
      <div className="card auth-card">
        {mode === 'start' && (
          <form className="stack" onSubmit={sendCode}>
            <Logo name={APP_NAME} size={32} />
            <p className="muted" style={{ margin: 0 }}>Connexion ou inscription : c'est le même chemin, sans mot de passe à retenir.</p>
            {invite && (
              <Notice kind="info">
                {invite === 'list' ? 'On vous a partagé une liste d\'envies. ' : 'On vous invite à un événement. '}
                Connectez-vous (ou créez votre compte gratuit) pour {invite === 'list' ? 'la voir' : 'le rejoindre'}.
              </Notice>
            )}
            <Notice>{err}</Notice>
            <button type="button" className="btn btn-social btn-lg" onClick={() => oauth('google')}><GoogleG /> Continuer avec Google</button>
            {APPLE_ENABLED && <button type="button" className="btn btn-lg" onClick={() => oauth('apple')}>Continuer avec Apple</button>}
            <div className="or"><span>ou</span></div>
            {emailField}
            <button className="btn btn-primary btn-lg" disabled={busy}><Icon name="mail" size={18} /> Recevoir un code par e-mail</button>
            <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>On vous envoie un code à {OTP_LENGTH} chiffres.</p>
            <button type="button" className="link small" onClick={() => reset('pw')}>Se connecter avec un mot de passe</button>
          </form>
        )}

        {mode === 'code' && (
          <form className="stack" onSubmit={e => { e.preventDefault(); verify() }}>
            <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => reset('start')}>← Changer d'adresse</button>
            <h1 style={{ fontSize: '1.5rem' }}>Entrez le code reçu</h1>
            <p className="muted" style={{ margin: 0 }}>Envoyé à <strong>{email.trim()}</strong>. Pensez à regarder dans les indésirables.</p>
            <Notice>{err}</Notice>
            <label className="sr-only" htmlFor="otp">Code reçu par e-mail</label>
            <input id="otp" ref={codeRef} className="otp-input" value={code} onChange={e => onCode(e.target.value)}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" placeholder={'•'.repeat(OTP_LENGTH)} aria-label="Code reçu par e-mail" />
            <button className="btn btn-primary btn-lg" disabled={busy || code.length < OTP_LENGTH}>{busy ? 'Vérification…' : 'Continuer'}</button>
            <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>
              Rien reçu ? {wait > 0 ? <>Nouveau code possible dans {wait} s</> : <button type="button" className="link small" onClick={() => sendCode()}>Renvoyer le code</button>}
            </p>
          </form>
        )}

        {mode === 'pw' && (
          <form className="stack" onSubmit={passwordLogin}>
            <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => reset('start')}>← Retour</button>
            <h1 style={{ fontSize: '1.5rem' }}>Connexion avec mot de passe</h1>
            <Notice>{err}</Notice>
            {emailField}
            <label>Mot de passe
              <input type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" />
            </label>
            <button className="btn btn-primary btn-lg" disabled={busy}>Se connecter</button>
            <button type="button" className="link small" onClick={() => reset('forgot')}>Mot de passe oublié ?</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form className="stack" onSubmit={forgot}>
            <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => reset('pw')}>← Retour</button>
            <h1 style={{ fontSize: '1.5rem' }}>Mot de passe oublié</h1>
            <p className="muted small" style={{ margin: 0 }}>Plus simple : <button type="button" className="link small" onClick={() => reset('start')}>recevez un code</button> et connectez-vous sans mot de passe.</p>
            <Notice>{err}</Notice>
            <Notice kind="ok">{info}</Notice>
            {emailField}
            <button className="btn btn-primary btn-lg" disabled={busy}>Envoyer le lien</button>
          </form>
        )}
      </div>
    </div>
  )
}
