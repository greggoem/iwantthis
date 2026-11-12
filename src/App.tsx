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
import Welcome from './pages/Welcome'
import Help from './pages/Help'

/** Connecté : l'application. Non connecté : page d'accueil sur « / », sinon connexion (en gardant la page voulue) */
function Gate() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (session) return <Layout />
  // Lien d'ajout (#/?add=1&u=… : raccourci, partage mobile, lien externe) : connexion d'abord, puis le formulaire pré-rempli
  // (sans cela, la page d'accueil s'affichait et le cadeau était perdu)
  if (loc.pathname === '/' && !new URLSearchParams(loc.search).has('add')) return <Landing />
  sessionStorage.setItem('postLoginPath', loc.pathname + loc.search)
  return <Navigate to="/login" replace />
}

/** Après connexion (e-mail ou retour de Google) : retourner là où l'on allait (ex. un lien de partage) */
function PostLogin() {
  const { session } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => {
    if (!session) return
    // Compte tout juste créé (Google : première connexion) : page de bienvenue d'abord, une seule fois
    const u = session.user
    const key = 'iwt.welcomed.' + u.id
    let welcomed = true
    try { welcomed = !!localStorage.getItem(key) } catch { /* ignore */ }
    if (!welcomed && Date.now() - new Date(u.created_at).getTime() < 10 * 60000 && loc.pathname !== '/bienvenue') {
      try { localStorage.setItem(key, '1') } catch { /* ignore */ }
      nav('/bienvenue', { replace: true })
      return
    }
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
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { setErr('Les deux mots de passe ne correspondent pas.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setErr(errMsg(error)); else endRecovery()
  }
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Nouveau mot de passe</h1>
        <Notice>{err}</Notice>
        <label>Mot de passe (6 caractères minimum)
          <input type="password" minLength={6} required value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" autoFocus />
        </label>
        <label>Confirmer le mot de passe
          <input type="password" minLength={6} required value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" />
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
          <Route path="bienvenue" element={<Welcome />} />
          <Route path="aide" element={<Help />} />
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
