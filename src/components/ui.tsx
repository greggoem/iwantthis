import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import Icon, { type IconName } from './Icon'

export function Notice({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <p className="muted center pad">{label}</p>
}

export function IconButton({ icon, label, danger, ...rest }: { icon: IconName; label: string; danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${danger ? 'danger' : ''}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return (
    <div className="copyfield">
      {label && <label className="small muted">{label}</label>}
      <div className="row">
        <input readOnly value={value} onFocus={e => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={async () => { if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1800) } }}>
          <Icon name={done ? 'check' : 'copy'} size={16} /> {done ? 'Copié' : 'Copier'}
        </button>
        {canShare && (
          <button type="button" className="btn btn-ghost" onClick={() => navigator.share({ url: value }).catch(() => {})}>Partager</button>
        )}
      </div>
    </div>
  )
}
