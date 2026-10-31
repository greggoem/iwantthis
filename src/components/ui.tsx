import { useState, type ReactNode } from 'react'

export function Notice({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <p className="muted center pad">{label}</p>
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
          {done ? 'Copié ✓' : 'Copier'}
        </button>
        {canShare && (
          <button type="button" className="btn btn-ghost" onClick={() => navigator.share({ url: value }).catch(() => {})}>Partager</button>
        )}
      </div>
    </div>
  )
}
