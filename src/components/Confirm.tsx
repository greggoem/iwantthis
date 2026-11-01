import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import Modal from './Modal'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Ask = (o: ConfirmOptions) => Promise<boolean>
const Ctx = createContext<Ask>(async () => false)

/** Remplace window.confirm : une fenêtre dans le style du site. `if (!(await confirm({...}))) return` */
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const ask = useCallback<Ask>(o => new Promise<boolean>(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setOpts(o)
  }), [])

  const close = useCallback((v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }, [])

  return (
    <Ctx.Provider value={ask}>
      {children}
      {opts && (
        <Modal title={opts.title} onClose={() => close(false)}>
          <div className="stack">
            {opts.message && <div className="muted confirm-msg">{opts.message}</div>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => close(false)}>{opts.cancelLabel ?? 'Annuler'}</button>
              <button className={`btn ${opts.danger ? 'danger-btn-solid' : 'btn-primary'}`} autoFocus onClick={() => close(true)}>
                {opts.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}
