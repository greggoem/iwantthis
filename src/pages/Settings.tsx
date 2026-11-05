import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ThemePicker from '../components/ThemePicker'
import ApiAccess from '../components/ApiAccess'
import { HowItWorks, ExtensionGuide } from '../components/HowItWorks'
import Icon from '../components/Icon'

type Section = 'apparence' | 'guide' | 'extension' | 'api' | 'admin'

export default function Settings() {
  const [admin, setAdmin] = useState(false)
  const [params, setParams] = useSearchParams()
  useEffect(() => { supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true)) }, [])

  const menu: { key: Section; label: string }[] = [
    { key: 'apparence', label: 'Apparence' },
    { key: 'guide', label: 'Comment ça marche' },
    { key: 'extension', label: 'Extension' },
    { key: 'api', label: 'API' },
    ...(admin ? [{ key: 'admin' as Section, label: 'Administration' }] : []),
  ]
  const asked = params.get('s') as Section | null
  const current: Section = menu.some(m => m.key === asked) ? asked! : 'apparence'

  return (
    <div>
      <h1>Réglages</h1>
      <p className="small muted">Votre nom, votre e-mail et votre mot de passe se trouvent dans <Link to="/profil">Mon profil</Link>.</p>
      <div className="settings-layout">
        <nav className="settings-menu" aria-label="Sections des réglages">
          {menu.map(m => (
            <button key={m.key} type="button" className={m.key === current ? 'on' : ''} aria-current={m.key === current ? 'page' : undefined}
              onClick={() => setParams({ s: m.key }, { replace: true })}>{m.label}</button>
          ))}
        </nav>
        <div className="settings-body">
          {current === 'apparence' && <ThemePicker />}
          {current === 'guide' && (
            <section className="card stack mt">
              <h2>Comment ça marche</h2>
              <HowItWorks />
            </section>
          )}
          {current === 'extension' && <section className="stack mt"><h2>Extension et raccourci</h2><ExtensionGuide /></section>}
          {current === 'api' && <ApiAccess />}
          {current === 'admin' && (
            <section className="card stack mt">
              <h2>Administration</h2>
              <p className="small muted">Réservé aux administrateurs du site.</p>
              <Link className="btn" to="/admin"><Icon name="chart" size={16} /> <span>Statistiques du site</span></Link>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
