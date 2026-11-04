import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, siteUrl, errMsg, APP_NAME } from '../lib/supabase'
import Logo from '../components/Logo'
import { Notice } from '../components/ui'
import ThemePicker from '../components/ThemePicker'

type Mode = 'in' | 'up' | 'forgot'

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
          options: { data: { display_name: name.trim() }, emailRedirectTo: siteUrl() },
        })
        if (error) throw error
        if (!data.session) setInfo('Compte créé ! Cliquez sur le lien de confirmation reçu par e-mail, puis connectez-vous.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })
        if (error) throw error
        setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d\'être envoyé.')
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

  return (
    <div className="auth-wrap">
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
        {mode === 'up' && <ThemePicker compact />}
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
            <button type="button" className="btn" onClick={google}>Continuer avec Google</button>
          </>
        )}
      </form>
    </div>
  )
}
