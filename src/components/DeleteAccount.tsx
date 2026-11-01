import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { Notice } from './ui'
import Modal from './Modal'
import Icon from './Icon'

interface Counts { gifts: number; organized: number; organizedAlone: number; purchases: number }

const CONFIRM_WORD = 'SUPPRIMER'

/** Se désinscrire : suppression définitive de son compte et de ses données (droit à l'effacement) */
export default function DeleteAccount() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !session) return
    const me = session.user.id
    ;(async () => {
      const [items, mine, claims] = await Promise.all([
        supabase.from('items').select('id, wishlists!inner(owner_id)', { count: 'exact', head: true }).eq('wishlists.owner_id', me),
        supabase.from('events').select('id, event_members(count)').eq('created_by', me),
        supabase.from('item_claims').select('item_id', { count: 'exact', head: true }).eq('claimed_by', me),
      ])
      const ev = (mine.data as unknown as { event_members: { count: number }[] }[]) ?? []
      setCounts({
        gifts: items.count ?? 0,
        organized: ev.length,
        organizedAlone: ev.filter(e => (e.event_members?.[0]?.count ?? 0) <= 1).length,
        purchases: claims.count ?? 0,
      })
    })()
  }, [open, session])

  const close = () => { setOpen(false); setWord(''); setErr('') }

  const remove = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(false); setErr(errMsg(error)); return }
    // le compte n'existe plus : on efface la session locale
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.hash = '#/'
    window.location.reload()
  }

  return (
    <>
      <section className="card stack mt danger-zone">
        <h2>Se désinscrire</h2>
        <p className="small muted">Supprimez votre compte et toutes vos données. Cette action est définitive.</p>
        <div><button className="btn btn-sm danger-btn" onClick={() => setOpen(true)}><Icon name="trash" size={15} /> Supprimer mon compte</button></div>
      </section>

      {open && (
        <Modal title="Supprimer mon compte" onClose={close}>
          <div className="stack">
            <p>Cette action est <strong>définitive</strong>. Voici ce qui sera supprimé ou modifié :</p>
            <ul className="small consequences">
              <li>Votre profil, votre liste{counts ? ` et ses ${counts.gifts} cadeau${counts.gifts > 1 ? 'x' : ''}` : ''} disparaissent pour tout le monde.</li>
              <li>Les achats que vous avez indiqués{counts ? ` (${counts.purchases})` : ''} sont annulés : les cadeaux redeviennent disponibles pour les autres invités.</li>
              {counts && counts.organized > 0 && (
                <li>
                  Vos {counts.organized} événement{counts.organized > 1 ? 's' : ''} organisé{counts.organized > 1 ? 's' : ''} :
                  {' '}transmis à un autre invité{counts.organizedAlone > 0 ? `, sauf ${counts.organizedAlone} sans autre invité, supprimé${counts.organizedAlone > 1 ? 's' : ''}` : ''}.
                  Si un tirage au sort avait eu lieu, il devra être refait.
                </li>
              )}
              <li>Vos jetons d'accès API sont révoqués.</li>
            </ul>
            <Notice>{err}</Notice>
            <label>
              <span>Pour confirmer, tapez <strong>{CONFIRM_WORD}</strong></span>
              <input value={word} onChange={e => setWord(e.target.value)} autoComplete="off" />
            </label>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={close}>Annuler</button>
              <button className="btn danger-btn-solid" disabled={busy || word.trim().toUpperCase() !== CONFIRM_WORD} onClick={remove}>
                {busy ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
