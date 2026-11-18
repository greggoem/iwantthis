import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase, errMsg, APP_NAME } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { STORE_LINKS } from '../lib/extensions'
import { platform, isStandalone, isMobile, canPromptInstall, promptInstall, markDeviceSetup } from '../lib/platform'
import BookmarkletBox from '../components/BookmarkletBox'
import { LogoMark } from '../components/Logo'
import { Notice } from '../components/ui'
import Icon from '../components/Icon'

/** Prénom à demander : compte créé par code e-mail, sans nom fourni (Google donne le nom) */
function needsName(meta: Record<string, unknown> | undefined): boolean {
  return !['display_name', 'full_name', 'name'].some(k => typeof meta?.[k] === 'string' && (meta[k] as string).trim())
}

/**
 * « Première étape » : après l'inscription, ou sur un nouvel appareil (?appareil=1).
 * Une seule action, adaptée à l'appareil (extension, installation, écran d'accueil) ; le prénom seulement s'il manque.
 */
export default function Welcome() {
  const { session, refreshProfile } = useAuth()
  const nav = useNavigate()
  const p = platform()
  const askName = needsName(session?.user.user_metadata)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [installed, setInstalled] = useState(false)
  const go = (() => { try { return sessionStorage.getItem('postLoginPath') || '/' } catch { return '/' } })()

  // rien d'utile à proposer (appli déjà installée sur ce téléphone) et prénom connu : directement à la liste
  if (!askName && isMobile(p) && isStandalone()) { markDeviceSetup(); return <Navigate to={go} replace /> }

  const saveName = async (): Promise<boolean> => {
    if (!askName) return true
    const n = name.trim()
    if (!n) { setErr('Indiquez votre prénom : vos proches verront « La liste d\'envies de … ».'); return false }
    const [a, b] = await Promise.all([
      supabase.from('profiles').update({ display_name: n }).eq('id', session!.user.id),
      supabase.auth.updateUser({ data: { display_name: n } }),
    ])
    const e = a.error ?? b.error
    if (e) { setErr(errMsg(e)); return false }
    await refreshProfile()
    return true
  }
  /** openUrl : le store de l'extension, ouvert une fois le prénom enregistré */
  const finish = async (e?: FormEvent | React.MouseEvent, openUrl?: string) => {
    e?.preventDefault()
    if (openUrl) window.open(openUrl, '_blank', 'noopener')
    setErr(''); setBusy(true)
    const ok = await saveName()
    setBusy(false)
    if (!ok) return
    markDeviceSetup()
    try { sessionStorage.removeItem('postLoginPath') } catch { /* rien */ }
    nav(go, { replace: true })
  }
  const install = async () => {
    if (await promptInstall()) setInstalled(true)
  }

  const step = (n: number, t: React.ReactNode) => <li><span className="fs-n">{n}</span><span>{t}</span></li>

  let kicker = '', title = '', intro: React.ReactNode = '', body: React.ReactNode = null, action: React.ReactNode = null
  if (p === 'ios') {
    kicker = 'iPhone'
    title = 'Mettez I Want This sur votre écran d\'accueil'
    intro = 'Vous l\'ouvrez comme une appli et vous restez connecté.'
    body = <ol className="fs-steps">{step(1, <>Touchez <strong>Partager</strong> <Icon name="share" size={15} /> en bas de Safari.</>)}{step(2, <>Choisissez <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</>)}{step(3, <>Dans l'appli d'une marque (Zara, Amazon…) : <strong>Partager › Copier le lien</strong>, puis collez-le dans {APP_NAME}.</>)}</ol>
  } else if (p === 'android') {
    kicker = 'Android'
    title = 'Installez I Want This sur ce téléphone'
    intro = 'Il apparaîtra dans le menu Partager de vos applis : un produit vu sur Zara ou Amazon arrive dans votre liste en deux gestes.'
    if (installed) body = <Notice kind="ok">C'est installé ! Dans l'appli d'une marque, touchez Partager › {APP_NAME}.</Notice>
    else if (canPromptInstall()) action = <button type="button" className="btn btn-primary btn-lg" onClick={install}><Icon name="plus" size={18} /> Installer l'appli</button>
    else body = <ol className="fs-steps">{step(1, <>Menu <strong>⋮</strong> du navigateur › <strong>Installer l'application</strong> (ou <strong>Ajouter à l'écran d'accueil</strong>).</>)}{step(2, <>Dans l'appli d'une marque : <strong>Partager › {APP_NAME}</strong>.</>)}</ol>
  } else if (p === 'chromium' || p === 'firefox') {
    const ff = p === 'firefox'
    kicker = ff ? 'Firefox' : 'Ordinateur'
    title = 'Ajoutez vos envies en un clic, depuis n\'importe quel magasin'
    intro = <>Avec l'extension, un clic sur l'icône {APP_NAME}, sur la page d'un produit, l'ajoute à votre liste avec son image et son prix.</>
    const store = ff ? STORE_LINKS.firefox : STORE_LINKS.chrome
    action = <a className="btn btn-primary btn-lg" href={store} target="_blank" rel="noopener noreferrer"
      onClick={e => { if (askName && !name.trim()) { e.preventDefault(); setErr('Indiquez d\'abord votre prénom.'); return } finish(e, store) }}>
      {ff ? 'Ajouter à Firefox' : 'Ajouter à Chrome'} · gratuit <Icon name="external" size={16} /></a>
  } else {
    kicker = 'Ordinateur'
    title = 'Ajoutez vos envies en un clic, depuis n\'importe quel magasin'
    intro = 'Glissez ce bouton dans votre barre de favoris : sur la page d\'un produit, un clic l\'ajoute à votre liste.'
    body = <BookmarkletBox open title="Le bouton à glisser" hideTip />
  }

  return (
    <form className="first-step card" onSubmit={finish}>
      <LogoMark size={44} />
      {askName && (
        <div className="stack">
          <h1>Bienvenue ! Comment vous appelez-vous ?</h1>
          <label>Votre prénom
            <input required maxLength={60} value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" autoFocus />
          </label>
          <p className="small muted" style={{ margin: 0 }}>Vos proches verront « La liste d'envies de {name.trim() || '…'} ».</p>
          <hr className="fs-sep" />
        </div>
      )}
      <p className="fs-kicker">Première étape · {kicker}</p>
      {askName ? <h2>{title}</h2> : <h1>{title}</h1>}
      <p className="muted fs-intro">{intro}</p>
      {body}
      <Notice>{err}</Notice>
      <div className="fs-actions">
        {action}
        <button className={action ? 'btn btn-ghost btn-lg' : 'btn btn-primary btn-lg'} disabled={busy}>
          {action ? 'Plus tard, commencer ma liste' : 'Commencer ma liste'}
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Tout est expliqué dans <Link to="/aide">Comment ça marche</Link>.</p>
    </form>
  )
}
