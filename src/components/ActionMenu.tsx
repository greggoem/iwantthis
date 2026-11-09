import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon, { type IconName } from './Icon'

export interface Action { icon: IconName; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; active?: boolean }

/** Menu « ⋯ » d'actions sur une envie (ouvert dans un calque, jamais coupé par la carte) */
export default function ActionMenu({ actions, label = 'Actions' }: { actions: (Action | false | null | undefined)[]; label?: string }) {
  const list = actions.filter(Boolean) as Action[]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false })
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const h = panel.current?.offsetHeight ?? 200, w = panel.current?.offsetWidth ?? 220
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0
    setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), up })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (e.type === 'scroll' || e.type === 'resize' || (!panel.current?.contains(t) && !btn.current?.contains(t))) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', close); document.addEventListener('touchstart', close)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close)
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <>
      <button ref={btn} type="button" className={`icon-btn amenu-btn ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
        <Icon name="more" size={20} />
      </button>
      {open && createPortal(
        <div ref={panel} className="amenu-panel" role="menu" style={{ top: pos.top, left: pos.left }}>
          {list.map(a => (
            <button key={a.label} type="button" role="menuitem" disabled={a.disabled} className={`${a.danger ? 'danger' : ''} ${a.active ? 'active' : ''}`}
              onClick={() => { setOpen(false); a.onClick() }}>
              <Icon name={a.icon} size={18} /> {a.label}
            </button>
          ))}
        </div>, document.body)}
    </>
  )
}
