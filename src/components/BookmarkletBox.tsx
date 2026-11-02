import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME, siteUrl } from '../lib/supabase'
import { bookmarkletHref } from '../lib/bookmarklet'
import { LogoMark } from './Logo'

/** Raccourci à glisser dans la barre de favoris (fonctionne dans tous les navigateurs, Safari compris) */
export default function BookmarkletBox({ open = false, title = 'Le magasin ne donne ni image ni prix ?', hideTip = false }: { open?: boolean; title?: string; hideTip?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null)
  // le href « javascript: » est posé après coup (React refuse ce type de lien dans le JSX)
  useEffect(() => { ref.current?.setAttribute('href', bookmarkletHref(siteUrl())) }, [])
  return (
    <details className="bm" open={open}>
      <summary>{title}</summary>
      <p className="small">
        Certains magasins (Amazon, Zalando, Fnac…) interdisent la lecture automatique. Ce raccourci passe par <strong>votre</strong> navigateur :
        sur ordinateur, <strong>glissez le bouton ci-dessous dans votre barre de favoris</strong> (Ctrl+Maj+B, ou Cmd+Maj+B sur Mac, pour l'afficher).
        Sur la page d'un produit, cliquez sur ce favori : le cadeau arrive ici, déjà rempli.
      </p>
      <a ref={ref} className="btn btn-sm" draggable onClick={e => e.preventDefault()}><LogoMark size={20} /> Ajouter à {APP_NAME}</a>
      {!hideTip && <p className="small muted">Plus pratique : l'<Link to="/profil">extension pour Chrome, Edge ou Firefox</Link> (dans Mon profil), avec l'icône du site dans la barre du navigateur.</p>}
      <p className="small muted">Sur téléphone : collez le lien du produit et saisissez le prix à la main si besoin.</p>
    </details>
  )
}
