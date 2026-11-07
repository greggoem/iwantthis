import { useState } from 'react'

export type Unit = 'day' | 'week' | 'month'

export function bucketLabel(d: string, unit: Unit, long = false): string {
  const dt = new Date(d + 'T12:00:00')
  if (unit === 'month') return dt.toLocaleDateString('fr-BE', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' })
  const s = dt.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
  return unit === 'week' ? (long ? `semaine du ${s}` : s) : s
}

/** Jolis paliers pour l'axe (1, 2, 5 × 10^n) */
function niceMax(v: number): number {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = [1, 2, 2.5, 5, 10].find(x => x * p >= v) ?? 10
  return m * p
}

interface SeriesProps { buckets: string[]; values: number[]; unit: Unit; label: string; kind?: 'bar' | 'line'; height?: number }

/** Graphique simple (une série) : barres = nouveaux par période, ligne = total cumulé. Survol : valeur exacte. */
export function SeriesChart({ buckets, values, unit, label, kind = 'bar', height = 150 }: SeriesProps) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = height, padL = 34, padB = 26, padT = 8
  const max = niceMax(Math.max(0, ...values))
  const n = values.length
  const cw = (W - padL) / n
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)
  const x = (i: number) => padL + cw * i + cw / 2
  const ticks = [0, max / 2, max]
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1]
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const h = hover ?? null
  return (
    <figure className="dash-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'dc-base' : 'dc-grid'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="dc-tick">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {kind === 'bar' && values.map((v, i) => {
          const bw = Math.max(2, cw - 3), top = y(v), bh = Math.max(0, y(0) - top)
          return v > 0 ? <path key={i} className={`dc-bar ${h === i ? 'on' : ''}`}
            d={`M${x(i) - bw / 2},${y(0)} V${top + Math.min(4, bh)} Q${x(i) - bw / 2},${top} ${x(i) - bw / 2 + Math.min(4, bw / 2)},${top} H${x(i) + bw / 2 - Math.min(4, bw / 2)} Q${x(i) + bw / 2},${top} ${x(i) + bw / 2},${top + Math.min(4, bh)} V${y(0)} Z`} /> : null
        })}
        {kind === 'line' && <>
          <path d={`${path}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} className="dc-area" />
          <path d={path} className="dc-line" />
          {h !== null && <circle cx={x(h)} cy={y(values[h])} r="4.5" className="dc-dot" />}
        </>}
        {h !== null && kind === 'line' && <line x1={x(h)} x2={x(h)} y1={padT} y2={y(0)} className="dc-cross" />}
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="dc-tick">{bucketLabel(buckets[i], unit)}</text>
        ))}
        {values.map((_, i) => (
          <rect key={i} x={padL + cw * i} y={padT} width={cw} height={H - padT - padB} fill="transparent"
            onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {h !== null && (
        <div className="dc-tip" style={{ left: `${(x(h) / W) * 100}%` }}>
          <span className="muted">{bucketLabel(buckets[h], unit, true)}</span>
          <strong>{values[h]}</strong>
        </div>
      )}
    </figure>
  )
}

/** Mini-courbe pour les tuiles */
export function Sparkline({ values }: { values: number[] }) {
  const W = 120, H = 32, max = Math.max(1, ...values), n = values.length
  const pts = values.map((v, i) => `${(i / Math.max(1, n - 1)) * W},${H - 2 - (v / max) * (H - 4)}`).join(' ')
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><polyline points={pts} /></svg>
}

/** Barres horizontales (répartition / pourcentages) */
export function HBars({ rows, total, suffix = '' }: { rows: { label: string; n: number }[]; total?: number; suffix?: string }) {
  const max = total ?? Math.max(1, ...rows.map(r => r.n))
  return (
    <div className="hbars">
      {rows.map(r => (
        <div key={r.label} className="hbar" title={`${r.label} : ${r.n}${suffix}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${max ? (r.n / max) * 100 : 0}%` }} /></span>
          <span className="hbar-val">{total ? `${Math.round((r.n / (total || 1)) * 100)} %` : r.n}</span>
        </div>
      ))}
    </div>
  )
}
