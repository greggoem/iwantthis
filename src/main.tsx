import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { AffiliateProvider } from './lib/affiliate'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AffiliateProvider>
          <App />
        </AffiliateProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
