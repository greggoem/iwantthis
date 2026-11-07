import { useEffect, useState, type ReactNode } from 'react'
import { APP_NAME } from '../lib/supabase'
import { makeShareCard } from '../lib/shareCard'
import { copyText } from './ui'
import Icon from './Icon'
import Modal from './Modal'

/** Fenêtre de partage : carte image (reprend l'image de l'événement), message sympa modifiable, boutons d'envoi */
export default function ShareSheet({ title, intro, message, subject, heading, sub, kicker, imageUrl, fileName, onClose, children }: {
  title: string; intro: string; message: string; subject: string
  heading: string; sub?: string; kicker?: string; imageUrl?: string | null; fileName: string; onClose: () => void; children?: ReactNode
}) {
  const [text, setText] = useState(message)
  const [card, setCard] = useState<Blob | null>(null)
  const [cardUrl, setCardUrl] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true, obj = ''
    makeShareCard({ heading, sub, kicker, imageUrl, appName: APP_NAME }).then(b => {
      if (!alive || !b) return
      obj = URL.createObjectURL(b); setCard(b); setCardUrl(obj)
    })
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [heading, sub, kicker, imageUrl])

  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const nativeShare = async () => {
    setNote('')
    try {
      const file = card ? new File([card], `${fileName}.jpg`, { type: 'image/jpeg' }) : null
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, title: subject })
      else await navigator.share({ text, title: subject })
    } catch (e) { if ((e as Error).name !== 'AbortError') setNote('Le partage n\'a pas abouti : utilisez les autres boutons.') }
  }
  const copy = async () => setNote(await copyText(text) ? 'Message copié.' : 'Copie impossible : sélectionnez le texte et copiez-le.')

  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <p className="muted">{intro}</p>
        {children}
        {cardUrl
          ? <img className="sharecard" src={cardUrl} alt="Aperçu de l'image partagée" />
          : <div className="sharecard sharecard-wait" aria-hidden="true" />}
        <label>Message
          <textarea rows={9} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <div className="row wrap gap">
          {canNative && <button className="btn btn-primary" onClick={nativeShare}><Icon name="share" size={16} /> Partager…</button>}
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={16} /> WhatsApp</a>
          <a className="btn" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}><Icon name="mail" size={16} /> E-mail</a>
          <button className="btn" onClick={copy}><Icon name="copy" size={16} /> Copier le message</button>
          {cardUrl && <a className="btn" href={cardUrl} download={`${fileName}.jpg`}><Icon name="image" size={16} /> Enregistrer l'image</a>}
        </div>
        {note && <p className="small muted">{note}</p>}
        <p className="small muted">« Partager… » (téléphone) joint l'image et le message. Par WhatsApp ou e-mail depuis un ordinateur, enregistrez l'image et ajoutez-la à votre message.</p>
      </div>
    </Modal>
  )
}
