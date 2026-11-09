import { useEffect, useRef, type ReactNode } from 'react'
import Icon from './Icon'

/** Fenêtre centrée (feuille qui monte du bas sur mobile). Se ferme avec Échap ou un clic à l'extérieur. */
export default function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  // onClose change à chaque rendu : on garde la dernière version sans relancer l'effet
  // (sinon la fenêtre reprenait le focus à chaque frappe et le champ en cours le perdait)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    // bloque le défilement de la page derrière (html ET body : selon le navigateur, c'est l'un ou l'autre qui défile)
    const html = document.documentElement, body = document.body
    const prev = [html.style.overflow, body.style.overflow]
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden'
    // focus sur la fenêtre seulement si aucun champ ne l'a déjà pris (autoFocus)
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); html.style.overflow = prev[0]; body.style.overflow = prev[1] }
  }, [])

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer" title="Fermer"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
