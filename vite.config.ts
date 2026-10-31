import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : le site fonctionne aussi bien à la racine (Vercel, domaine perso)
// que dans un sous-dossier (GitHub Pages : https://utilisateur.github.io/depot/)
export default defineConfig({
  base: './',
  plugins: [react()],
})
