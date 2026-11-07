import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Notice, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { SeriesChart, Sparkline, HBars, type Unit } from '../components/AdminCharts'

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
const THEME_LABELS: Record<string, string> = { classique: 'Classique', menthe: 'Menthe', fete: 'Fête', doodle: 'Doodle', nuit: 'Nuit' }

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

interface Series {
  unit: Unit
  buckets: string[]
  series: Record<'users' | 'lists' | 'items' | 'claims' | 'shares' | 'events', { new: number[]; before: number }>
  list_sizes: { label: string; n: number }[]
  favorites: number
}
const cumul = (s: { new: number[]; before: number }) => { let t = s.before; return s.new.map(v => (t += v)) }
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const UNIT_TXT: Record<Unit, string> = { day: '30 derniers jours', week: '16 dernières semaines', month: '12 derniers mois' }
const PER: Record<Unit, string> = { day: 'par jour', week: 'par semaine', month: 'par mois' }

function Kpi({ label, value, added, spark }: { label: string; value: number; added: number; spark: number[] }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-delta">{added > 0 ? `+${added}` : '0'} sur la période</span>
      <Sparkline values={spark} />
    </div>
  )
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`dash-panel ${wide ? 'wide' : ''}`}><h2>{title}</h2>{children}</section>
}

function StatsTab({ onDenied }: { onDenied: () => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [ser, setSer] = useState<Series | null>(null)
  const [unit, setUnit] = useState<Unit>('day')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    const [a, b] = await Promise.all([supabase.rpc('admin_stats'), supabase.rpc('admin_series', { p_unit: unit })])
    setBusy(false)
    const error = a.error ?? b.error
    if (error) { if (/refus/i.test(error.message)) onDenied(); else setErr(errMsg(error)); return }
    setS(a.data as Stats); setSer(b.data as Series)
  }, [unit])
  useEffect(() => { load() }, [load])

  if (!s || !ser) return err ? <Notice>{err}</Notice> : <Spinner />

  const u = s.users, S = ser.series, B = ser.buckets
  const when = new Date(s.generated_at).toLocaleString('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })
  const chart = (k: keyof Series['series'], label: string, kind: 'bar' | 'line' = 'bar') =>
    <SeriesChart buckets={B} unit={unit} label={label} kind={kind} values={kind === 'line' ? cumul(S[k]) : S[k].new} />
  return (
    <div className="dash">
      <div className="dash-bar">
        <div className="seg-unit" role="group" aria-label="Période">
          {(['day', 'week', 'month'] as Unit[]).map(x => (
            <button key={x} type="button" className={x === unit ? 'on' : ''} aria-pressed={x === unit} onClick={() => setUnit(x)}>
              {x === 'day' ? 'Jour' : x === 'week' ? 'Semaine' : 'Mois'}</button>
          ))}
        </div>
        <span className="small muted">{UNIT_TXT[unit]} · mis à jour le {when}</span>
        <button className="btn btn-sm" onClick={load} disabled={busy}><Icon name="refresh" size={15} /> <span>{busy ? 'Actualisation…' : 'Actualiser'}</span></button>
      </div>
      <Notice>{err}</Notice>

      <div className="kpis">
        <Kpi label="Inscrits" value={u.total} added={sum(S.users.new)} spark={cumul(S.users)} />
        <Kpi label="Listes" value={s.lists.total} added={sum(S.lists.new)} spark={cumul(S.lists)} />
        <Kpi label="Envies" value={s.items.total} added={sum(S.items.new)} spark={cumul(S.items)} />
        <Kpi label="Achats" value={s.claims.total} added={sum(S.claims.new)} spark={cumul(S.claims)} />
        <Kpi label="Événements" value={s.events.total} added={sum(S.events.new)} spark={cumul(S.events)} />
      </div>

      <div className="dash-grid">
        <Panel title="Listes">
          <h3>Nouvelles listes {PER[unit]}</h3>
          {chart('lists', `Nouvelles listes ${PER[unit]}`)}
          <h3>Listes ouvertes par un proche {PER[unit]}</h3>
          {chart('shares', `Listes ouvertes par un proche ${PER[unit]}`)}
          <div className="stat-grid">
            <Tile label="Avec au moins une envie" value={pct(s.lists.with_items, s.lists.total)} hint={`${s.lists.with_items} listes`} />
            <Tile label="Ouvertes par un proche" value={pct(s.lists.shared_with_someone, s.lists.total)} hint={`${s.lists.shared_with_someone} listes`} />
            <Tile label="Envies par liste" value={s.lists.with_items ? (s.items.total / s.lists.with_items).toFixed(1) : '–'} hint="listes non vides" />
          </div>
          <h3>Taille des listes (nombre d'envies)</h3>
          <HBars rows={ser.list_sizes} />
        </Panel>

        <Panel title="Envies">
          <h3>Nouvelles envies {PER[unit]}</h3>
          {chart('items', `Nouvelles envies ${PER[unit]}`)}
          <h3>Total des envies</h3>
          {chart('items', 'Total cumulé des envies', 'line')}
          <div className="stat-grid">
            <Tile label="Groupes" value={s.items.groups} />
            <Tile label="Favoris" value={ser.favorites} />
            <Tile label="Achetées" value={pct(s.claims.total, s.items.total)} hint={`${s.claims.total} envie${s.claims.total > 1 ? "s" : ""}`} />
          </div>
          <h3>Qualité des fiches</h3>
          <HBars total={s.items.total} rows={[
            { label: 'Avec lien', n: s.items.with_link },
            { label: 'Avec image', n: s.items.with_image },
            { label: 'Avec prix', n: s.items.with_price },
          ]} />
        </Panel>

        <Panel title="Inscrits">
          <h3>Inscriptions {PER[unit]}</h3>
          {chart('users', `Inscriptions ${PER[unit]}`)}
          <div className="stat-grid">
            <Tile label="Actifs (7 jours)" value={u.active7} hint={pct(u.active7, u.total)} />
            <Tile label="Actifs (30 jours)" value={u.active30} hint={pct(u.active30, u.total)} />
            <Tile label="Jamais connectés" value={u.never_signed_in} hint="compte non ouvert" />
          </div>
          <h3>Mode de connexion</h3>
          <HBars total={u.total} rows={[{ label: 'Google', n: u.google }, { label: 'E-mail', n: u.email }, { label: 'Apple', n: u.apple }]} />
          <h3>Apparence choisie</h3>
          <HBars total={u.total} rows={Object.entries(s.themes).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ label: THEME_LABELS[t] ?? t, n }))} />
        </Panel>

        <Panel title="Achats et événements">
          <h3>Cadeaux marqués achetés {PER[unit]}</h3>
          {chart('claims', `Achats ${PER[unit]}`)}
          <div className="stat-grid">
            <Tile label="Révélés au propriétaire" value={s.claims.revealed} />
            <Tile label="Découverts (archivés)" value={s.claims.seen_by_owner} />
            <Tile label="Discrets" value={s.claims.discreet} />
          </div>
          <h3>Nouveaux événements {PER[unit]}</h3>
          {chart('events', `Nouveaux événements ${PER[unit]}`)}
          <div className="stat-grid">
            <Tile label="À venir" value={s.events.upcoming} />
            <Tile label="Participations" value={s.events.memberships} />
            <Tile label="Tirages effectués" value={s.events.draws_done} hint={`${s.events.draw_mails_sent} annoncés par e-mail`} />
            <Tile label="Invitations par e-mail" value={s.invites.total} hint={`${s.invites.emailed} envoyées`} />
            <Tile label="Accès API" value={s.other.api_tokens} />
          </div>
        </Panel>
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
