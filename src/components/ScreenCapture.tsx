import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Le navigateur sait-il capturer l'écran ? (ordinateur : oui ; téléphones : non) */
export const canCaptureScreen = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function'

/** Demande à la personne de choisir un onglet / une fenêtre / un écran et en renvoie une image (ou null si annulé) */
export async function grabScreen(): Promise<HTMLCanvasElement | null> {
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) } catch { return null }
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise(r => setTimeout(r, 350))   // laisse le temps au partage de s'afficher
    const c = document.createElement('canvas')
    c.width = video.videoWidth; c.height = video.videoHeight
    c.getContext('2d')!.drawImage(video, 0, 0)
    return c
  } finally {
    stream.getTracks().forEach(t => t.stop())
  }
}

/** Affiche la capture : on tire un rectangle pour ne garder que l'image du produit */
export default function CropCapture({ source, onDone, onCancel }: { source: HTMLCanvasElement; onDone: (f: File) => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = imgRef.current!
    c.width = source.width; c.height = source.height
    c.getContext('2d')!.drawImage(source, 0, 0)
  }, [source])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onCancel])

  const pos = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) }
  }
  const down = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); start.current = pos(e); setSel(null) }
  const move = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = pos(e), s = start.current
    setSel({ x: Math.min(p.x, s.x), y: Math.min(p.y, s.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = () => { start.current = null }

  const finish = (all: boolean) => {
    const el = imgRef.current!, r = el.getBoundingClientRect()
    const k = source.width / r.width
    const crop = !all && sel && sel.w > 8 && sel.h > 8 ? { x: sel.x * k, y: sel.y * k, w: sel.w * k, h: sel.h * k } : { x: 0, y: 0, w: source.width, h: source.height }
    const out = document.createElement('canvas')
    out.width = Math.round(crop.w); out.height = Math.round(crop.h)
    out.getContext('2d')!.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height)
    out.toBlob(b => { if (b) onDone(new File([b], 'capture.png', { type: 'image/png' })) }, 'image/png')
  }

  return createPortal(
    <div className="cap-back" role="dialog" aria-modal="true" aria-label="Capture d'écran">
      <div className="cap-bar">
        <span className="small">Tirez un rectangle autour de l'image du produit</span>
        <div className="row gap">
          <button type="button" className="btn btn-sm" onClick={onCancel}>Annuler</button>
          <button type="button" className="btn btn-sm" onClick={() => finish(true)}>Tout garder</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!sel || sel.w < 8 || sel.h < 8} onClick={() => finish(false)}>Utiliser la sélection</button>
        </div>
      </div>
      <div className="cap-stage" ref={box}>
        <div className="cap-wrap" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <canvas ref={imgRef} className="cap-img" />
          {sel && <div className="cap-sel" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
