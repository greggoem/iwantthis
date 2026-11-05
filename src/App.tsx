import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isConfigured, supabase, errMsg, APP_NAME } from './lib/supabase'
import Layout from './components/Layout'
import Logo from './components/Logo'
import { Notice, Spinner } from './components/ui'
import Login from './pages/Login'
import MyList from './pages/MyList'
import SharedLists from './pages/SharedLists'
import ListView from './pages/ListView'
import OpenShared from './pages/OpenShared'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import JoinEvent from './pages/JoinEvent'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Notifications from './pages/Notifications'
import ToGive from './pages/ToGive'
import Confirm from './pages/Confirm'
import Landing from './pages/Landing'
import ThemePicker from './components/ThemePicker'
import { getTheme } from './lib/theme'

/** Connecté : l'application. Non connecté : page d'accueil sur « / », sinon connexion (en gardant la page voulue) */
function Gate() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (session) return <ThemeStep><Layout /></ThemeStep>
  if (loc.pathname === '/') return <Landing />
  sessionStorage.setItem('postLoginPath', loc.pathname + loc.search)
  return <Navigate to="/login" replace />
}

/** Nouveau compte (e-mail ou Google) : une fois connecté, étape « choix de l'apparence » avant d'entrer */
function ThemeStep({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const u = session!.user
  const isNew = Date.now() - new Date(u.created_at).getTime() < 2 * 86400000
  const seen = (() => { try { return !!localStorage.getItem('iwt.themeStep.' + u.id) } catch { return true } })()
  const [open, setOpen] = useState(isNew && !u.user_metadata?.theme && !seen)
  if (!open) return <>{children}</>
  const go = () => {
    try { localStorage.setItem('iwt.themeStep.' + u.id, '1') } catch { /* ignore */ }
    supabase.auth.updateUser({ data: { theme: getTheme() } }).catch(() => {})
    setOpen(false)
  }
  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <Logo name={APP_NAME} size={32} />
        <h1>Bienvenue !</h1>
        <ThemePicker compact />
        <button className="btn btn-primary" onClick={go}>Continuer</button>
      </div>
    </div>
  )
}

/** Après connexion (e-mail ou retour de Google) : retourner là où l'on allait (ex. un lien de partage) */
function PostLogin() {
  const { session } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    if (!session) return
    const p = sessionStorage.getItem('postLoginPath')
    if (p) { sessionStorage.removeItem('postLoginPath'); nav(p, { replace: true }) }
    else if (loc.pathname === '/login') nav('/', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])
  return null
}

function ResetPassword() {
  const { endRecovery } = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setErr(errMsg(error)); else endRecovery()
  }
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Nouveau mot de passe</h1>
        <Notice>{err}</Notice>
        <label>Mot de passe (6 caractères minimum)
          <input type="password" minLength={6} required value={pw} onChange={e => setPw(e.target.value)} autoFocus />
        </label>
        <button className="btn btn-primary">Enregistrer</button>
      </form>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Logo name={APP_NAME} size={32} />
        <Notice kind="info">
          Le site n'est pas encore relié à Supabase. Copiez <code>.env.example</code> en <code>.env</code> et renseignez
          <code> VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> (voir le README).
        </Notice>
      </div>
    </div>
  )
}

export default function App() {
  const { session, recovery } = useAuth()
  if (!isConfigured) return <NotConfigured />
  if (session && recovery) return <ResetPassword />
  return (
    <>
      <PostLogin />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/confirm" element={<Confirm />} />
        <Route element={<Gate />}>
          <Route index element={<MyList />} />
          <Route path="listes" element={<SharedLists />} />
          <Route path="listes/:id" element={<ListView />} />
          <Route path="l/:token" element={<OpenShared />} />
          <Route path="offrir" element={<ToGive />} />
          <Route path="evenements" element={<Events />} />
          <Route path="evenements/:id" element={<EventDetail />} />
          <Route path="e/:code" element={<JoinEvent />} />
          <Route path="profil" element={<Profile />} />
          <Route path="reglages" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
