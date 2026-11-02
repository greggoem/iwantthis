import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { AffiliateProvider } from './lib/affiliate'
import { ConfirmProvider } from './components/Confirm'
import './styles.css'
import { consumeShareTarget } from './lib/shareTarget'

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
