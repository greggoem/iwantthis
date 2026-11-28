import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { listenInstallPrompt, noteButtonUse } from './lib/platform'
import { AuthProvider } from './lib/auth'
import { AffiliateProvider } from './lib/affiliate'
import { ConfirmProvider } from './components/Confirm'
import './styles.css'
import './theme-fete.css'
import '@fontsource/caveat-brush/400.css'
import '@fontsource/patrick-hand/400.css'
import './theme-doodle.css'
import './theme-menthe.css'
import './theme-nuit.css'
import { applyTheme, getTheme } from './lib/theme'
import { consumeShareTarget } from './lib/shareTarget'

// Le titre personnalisé (aperçu des liens partagés) ne sert qu'aux robots : l'onglet reprend le nom du site.
// Sur l'accueil d'un visiteur non connecté, on garde le titre descriptif de index.html : c'est celui que
// Google lit après exécution du JavaScript (référencement). « iwt-app » est posé par index.html
// pour une session existante, une route #/… ou un lien partagé.
if (document.documentElement.classList.contains('iwt-app')) document.title = 'I Want This'

// Liens partagés « ?l=TOKEN » / « ?e=CODE » / « ?g=TOKEN » → routes internes #/l/TOKEN, #/e/CODE, #/g/TOKEN
{
  const q = new URLSearchParams(window.location.search)
  const l = q.get('l'), e = q.get('e'), g = q.get('g')
  if (l || e || g) window.history.replaceState(null, '', window.location.pathname + (l ? `#/l/${l}` : e ? `#/e/${e}` : `#/g/${g}`))
}

applyTheme(getTheme())   // avant le premier affichage : pas de clignotement
consumeShareTarget()   // « Partager vers I Want This » depuis un téléphone : convertit en lien d'ajout

listenInstallPrompt()   // Android : garder l'invitation d'installation pour la « première étape »
noteButtonUse()         // lien d'ajout venu de l'extension ou du favori : le bouton est installé ici
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AffiliateProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AffiliateProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
