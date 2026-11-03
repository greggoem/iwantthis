import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { AffiliateProvider } from './lib/affiliate'
import { ConfirmProvider } from './components/Confirm'
import './styles.css'
import './theme-fete.css'
import '@fontsource/caveat-brush/400.css'
import '@fontsource/patrick-hand/400.css'
import './theme-doodle.css'
import { applyTheme, getTheme } from './lib/theme'
import { consumeShareTarget } from './lib/shareTarget'

applyTheme(getTheme())   // avant le premier affichage : pas de clignotement
consumeShareTarget()   // « Partager vers I Want This » depuis un téléphone : convertit en lien d'ajout

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
