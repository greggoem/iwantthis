import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'
import Icon from '../components/Icon'

interface Stats {
  generated_at: string
  users: { total: number; last7: number; last30: number; active7: number; active30: number; never_signed_in: number; google: number; email: number; apple: number }
  themes: Record<string, number>
  signups_by_day: { day: string; n: number }[]
  lists: { total: number; with_items: number; shared_with_someone: number }
  items: { total: number; groups: number; last7: number; with_link: number; with_image: number; with_price: number }
  claims: { total: number; discreet: number; revealed: number; seen_by_owner: number }
  events: { total: number; upcoming: number; memberships: number; draws_done: number; draw_mails_sent: number }
  invites: { total: number; emailed: number }
  other: { api_tokens: number; notifications: number }
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '–')
const THEME_LABELS: Record<string, string> = { classique: 'Classique', menthe: 'Menthe', fete: 'Fête', doodle: 'Doodle' }

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

function SignupChart({ days }: { days: { day: string; n: number }[] }) {
  const max = Math.max(1, ...days.map(d => d.n))
  const W = 600, H = 120, bw = W / days.length
  return (
    <figure className="stat-chart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Inscriptions par jour sur les 30 derniers jours">
        {days.map((d, i) => {
          const h = (d.n / max) * H
          return (
            <g key={d.day}>
              <rect x={i * bw + 2} y={H - h} width={Math.max(1, bw - 4)} height={Math.max(h, d.n ? 2 : 0)} rx="2" className="stat-bar">
                <title>{new Date(d.day).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} : {d.n} inscription{d.n > 1 ? 's' : ''}</title>
              </rect>
            </g>
          )
        })}
        <line x1="0" y1={H} x2={W} y2={H} className="stat-axis" />
        <text x="0" y={H + 14} className="stat-axis-text">{new Date(days[0].day).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</text>
        <text x={W} y={H + 14} textAnchor="end" className="stat-axis-text">{new Date(days[days.length - 1].day).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</text>
      </svg>
      <figcaption className="small muted">Inscriptions par jour, 30 derniers jours (pic : {max})</figcaption>
    </figure>
  )
}

function StatsTab({ onDenied }: { onDenied: () => void }) {
  const [s, setS] = useState<Stats | null>(null)
    const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('admin_stats')
    setBusy(false)
    if (error) { if (/refus/i.test(error.message)) onDenied(); else setErr(errMsg(error)); return }
    setS(data as Stats)
  }, [])
  useEffect(() => { load() }, [load])

  if (!s) return err ? <Notice>{err}</Notice> : <Spinner />

  const u = s.users
  const when = new Date(s.generated_at).toLocaleString('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div>
      <div className="admin-actions">
        <button className="btn" onClick={load} disabled={busy}><Icon name="refresh" size={16} /> <span>{busy ? 'Actualisation…' : 'Actualiser'}</span></button>
      </div>
      <p className="small muted">Chiffres globaux uniquement : aucun contenu de liste ni adresse n'apparaît ici. Mis à jour le {when}.</p>
      <Notice>{err}</Notice>

      <h2>Inscrits</h2>
      <div className="stat-grid">
        <Tile label="Inscrits" value={u.total} />
        <Tile label="Nouveaux (7 jours)" value={u.last7} />
        <Tile label="Nouveaux (30 jours)" value={u.last30} />
        <Tile label="Actifs (7 jours)" value={u.active7} hint={pct(u.active7, u.total)} />
        <Tile label="Actifs (30 jours)" value={u.active30} hint={pct(u.active30, u.total)} />
        <Tile label="Jamais connectés" value={u.never_signed_in} hint="compte créé, jamais ouvert" />
      </div>
      <div className="card"><SignupChart days={s.signups_by_day} /></div>
      <div className="stat-grid">
        <Tile label="Via Google" value={u.google} />
        <Tile label="Via e-mail" value={u.email} />
        <Tile label="Via Apple" value={u.apple} />
        {Object.entries(s.themes).sort((a, b) => b[1] - a[1]).map(([t, n]) => <Tile key={t} label={`Thème ${THEME_LABELS[t] ?? t}`} value={n} />)}
      </div>

      <h2>Listes et envies</h2>
      <div className="stat-grid">
        <Tile label="Listes" value={s.lists.total} />
        <Tile label="Listes avec au moins une envie" value={s.lists.with_items} hint={pct(s.lists.with_items, s.lists.total)} />
        <Tile label="Listes ouvertes par un proche" value={s.lists.shared_with_someone} hint="via un lien" />
        <Tile label="Envies" value={s.items.total} hint={`+${s.items.last7} sur 7 jours`} />
        <Tile label="Groupes" value={s.items.groups} />
        <Tile label="Envies par liste" value={s.lists.with_items ? (s.items.total / s.lists.with_items).toFixed(1) : '–'} hint="listes non vides" />
        <Tile label="Avec lien" value={pct(s.items.with_link, s.items.total)} />
        <Tile label="Avec image" value={pct(s.items.with_image, s.items.total)} />
        <Tile label="Avec prix" value={pct(s.items.with_price, s.items.total)} />
      </div>

      <h2>Achats</h2>
      <div className="stat-grid">
        <Tile label="Cadeaux marqués achetés" value={s.claims.total} />
        <Tile label="Dont discrets" value={s.claims.discreet} />
        <Tile label="Révélés au propriétaire" value={s.claims.revealed} />
        <Tile label="Découverts (archivés)" value={s.claims.seen_by_owner} />
      </div>

      <h2>Événements</h2>
      <div className="stat-grid">
        <Tile label="Événements" value={s.events.total} />
        <Tile label="À venir" value={s.events.upcoming} />
        <Tile label="Participations" value={s.events.memberships} />
        <Tile label="Tirages effectués" value={s.events.draws_done} />
        <Tile label="Tirages annoncés par e-mail" value={s.events.draw_mails_sent} />
        <Tile label="Invitations par e-mail" value={s.invites.total} hint={`${s.invites.emailed} envoyées`} />
      </div>

      <h2>Divers</h2>
      <div className="stat-grid">
        <Tile label="Accès API créés" value={s.other.api_tokens} />
        <Tile label="Notifications" value={s.other.notifications} />
      </div>
    </div>
  )
}

interface Partner { id: string; label: string; domain: string; network: string | null; status: Status; enabled: boolean; notes: string | null; checked_at: string | null; merchant_id: string | null }
type Status = 'active' | 'pending' | 'paused' | 'declined'
const STATUS_LABEL: Record<Status, string> = { active: 'Actif', pending: 'En attente', paused: 'En pause', declined: 'Refusé' }

function PartnerRow({ p, onSave }: { p: Partner; onSave: (id: string, status: Status, notes: string) => Promise<void> }) {
  const [status, setStatus] = useState<Status>(p.status)
  const [notes, setNotes] = useState(p.notes ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = status !== p.status || notes.trim() !== (p.notes ?? '')
  return (
    <li className={`partner partner-${p.status}`}>
      <div className="partner-main">
        <strong>{p.label}</strong>
        <span className="small muted">{p.domain === '*' ? 'tous les autres magasins' : p.domain}{p.network ? ` · ${p.network}` : ''}{p.merchant_id ? ` · n° ${p.merchant_id}` : ''}</span>
        {p.checked_at && <span className="small muted">vérifié le {new Date(p.checked_at).toLocaleDateString('fr-BE')}</span>}
      </div>
      <select aria-label={`Statut de ${p.label}`} value={status} onChange={e => setStatus(e.target.value as Status)}>
        {(Object.keys(STATUS_LABEL) as Status[]).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
      </select>
      <input aria-label={`Note pour ${p.label}`} placeholder="Note (facultatif)" value={notes} maxLength={200} onChange={e => setNotes(e.target.value)} />
      <button className="btn btn-sm" disabled={!dirty || busy} onClick={async () => { setBusy(true); await onSave(p.id, status, notes); setBusy(false) }}>Enregistrer</button>
    </li>
  )
}

/** Partenaires d'affiliation : actifs (liens parrainés), en attente, en pause, refusés */
function PartnersTab() {
  const [rows, setRows] = useState<Partner[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_partners')
    if (error) { setErr(errMsg(error)); setRows([]); return }
    setRows((data as Partner[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (id: string, status: Status, notes: string) => {
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('admin_set_partner', { p_id: id, p_status: status, p_notes: notes })
    if (error) { setErr(errMsg(error)); return }
    setMsg(status === 'active' ? 'Enregistré : les liens de ce partenaire sont maintenant parrainés.' : 'Enregistré : les liens de ce partenaire ne sont plus parrainés.')
    load()
  }

  if (!rows) return <Spinner />
  const group = (st: Status) => rows.filter(r => r.status === st)
  const counts = (Object.keys(STATUS_LABEL) as Status[]).map(k => ({ k, n: group(k).length }))
  return (
    <div>
      <p className="small muted">Seuls les partenaires <strong>actifs</strong> parrainent les liens des envies. Un partenaire en attente n'est pas encore validé par le réseau : ses liens restent normaux.</p>
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>
      <div className="stat-grid">{counts.map(c => <Tile key={c.k} label={STATUS_LABEL[c.k]} value={c.n} />)}</div>
      {(Object.keys(STATUS_LABEL) as Status[]).map(st => group(st).length > 0 && (
        <section key={st}>
          <h2>{STATUS_LABEL[st]} ({group(st).length})</h2>
          <ul className="partners">{group(st).map(p => <PartnerRow key={p.id + p.status + (p.notes ?? '')} p={p} onSave={save} />)}</ul>
        </section>
      ))}
    </div>
  )
}

/** Espace réservé aux administrateurs : statistiques et partenaires */
export default function Admin() {
  const [tab, setTab] = useState<'stats' | 'partners'>('stats')
  const [denied, setDenied] = useState(false)
  if (denied) return <Navigate to="/" replace />
  return (
    <div className="admin">
      <div className="page-head"><h1>Administration</h1></div>
      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}><Icon name="chart" size={16} /> Statistiques</button>
        <button role="tab" aria-selected={tab === 'partners'} className={tab === 'partners' ? 'on' : ''} onClick={() => setTab('partners')}><Icon name="gift" size={16} /> Partenaires</button>
      </div>
      {tab === 'stats' ? <StatsTab onDenied={() => setDenied(true)} /> : <PartnersTab />}
      <p className="small muted"><Link to="/reglages">← Réglages</Link></p>
    </div>
  )
}
