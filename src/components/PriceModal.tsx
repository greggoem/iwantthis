import { useState } from 'react'
import Modal from './Modal'

/** « C'est acheté » pour une envie sans prix : on demande combien, sans obligation (pour le budget) */
export default function PriceModal({ title, onDone, onClose }: { title: string; onDone: (price: number | null) => void; onClose: () => void }) {
  const [v, setV] = useState('')
  const n = Number(v.replace(',', '.'))
  const ok = v.trim() === '' || (Number.isFinite(n) && n >= 0 && n < 1000000)
  return (
    <Modal title="C'est acheté !" onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); if (ok) onDone(v.trim() ? Math.round(n * 100) / 100 : null) }}>
        <p className="muted" style={{ margin: 0 }}>« {title} » n'a pas de prix. Combien l'avez-vous payé ? C'est facultatif : ça sert à calculer votre budget.</p>
        <label>Prix payé (facultatif)
          <span className="price-in"><input inputMode="decimal" autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="Ex. 24,90" aria-label="Prix payé en euros" /> €</span>
        </label>
        <div className="row gap">
          <button className="btn btn-primary" type="submit" disabled={!ok}>{v.trim() ? 'Enregistrer' : 'Continuer sans prix'}</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </Modal>
  )
}
