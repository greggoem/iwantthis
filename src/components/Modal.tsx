import { useEffect, useRef, type ReactNode } from 'react'
import Icon from './Icon'

/** Fenêtre centrée (feuille qui monte du bas sur mobile). Se ferme avec Échap ou un clic à l'extérieur. */
export default function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // bloque le défilement de la page derrière (html ET body : selon le navigateur, c'est l'un ou l'autre qui défile)
    const html = document.documentElement, body = document.body
    const prev = [html.style.overflow, body.style.overflow]
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); html.style.overflow = prev[0]; body.style.overflow = prev[1] }
  }, [onClose])

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
