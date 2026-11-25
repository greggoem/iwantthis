import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useConfirm } from '../components/Confirm'
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
interface Links {
  total: number; sponsored: number; sponsored_claimed: number; pending: number; fallback_active: boolean
  by_partner: { label: string; network: string; status: string; enabled: boolean; n: number; claimed: number }[]
  top_free: { host: string; n: number; claimed: number }[]
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
  const [lk, setLk] = useState<Links | null>(null)
  const [unit, setUnit] = useState<Unit>('day')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    const [a, b, c] = await Promise.all([supabase.rpc('admin_stats'), supabase.rpc('admin_series', { p_unit: unit }), supabase.rpc('admin_links')])
    setBusy(false)
    const error = a.error ?? b.error ?? c.error
    if (error) { if (/refus/i.test(error.message)) onDenied(); else setErr(errMsg(error)); return }
    setS(a.data as Stats); setSer(b.data as Series); setLk(c.data as Links)
  }, [unit])
  useEffect(() => { load() }, [load])

  if (!s || !ser || !lk) return err ? <Notice>{err}</Notice> : <Spinner />

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

        <Panel title="Liens sponsorisés" wide>
          <div className="stat-grid">
            <Tile label="Envies avec un lien" value={lk.total} />
            <Tile label="Liens sponsorisés" value={pct(lk.sponsored, lk.total)} hint={`${lk.sponsored} liens`} />
            <Tile label="Achetées via un lien sponsorisé" value={lk.sponsored_claimed} hint="cadeaux marqués achetés" />
            <Tile label="En attente d'un partenaire" value={lk.pending} hint="deviendront sponsorisés si acceptés" />
            <Tile label="Lien par défaut (Skimlinks)" value={lk.fallback_active ? 'Actif' : 'Inactif'} hint={lk.fallback_active ? 'couvre les autres magasins' : 'les autres magasins ne rapportent rien'} />
          </div>
          <div className="dash-cols">
            <div>
              <h3>Liens par partenaire actif</h3>
              {lk.by_partner.length ? <HBars rows={lk.by_partner.map(p => ({ label: p.label, n: p.n }))} /> : <p className="small muted">Aucun partenaire actif.</p>}
            </div>
            <div>
              <h3>Magasins sans partenariat (les plus fréquents)</h3>
              {lk.top_free.length ? (
                <table className="dash-table">
                  <thead><tr><th>Magasin</th><th>Envies</th><th>Achetées</th></tr></thead>
                  <tbody>{lk.top_free.map(h => <tr key={h.host}><td>{h.host}</td><td>{h.n}</td><td>{h.claimed}</td></tr>)}</tbody>
                </table>
              ) : <p className="small muted">Tous les liens sont couverts.</p>}
              <p className="small muted">Pistes pour de nouvelles candidatures (Awin, programmes en direct).</p>
            </div>
          </div>
          <p className="small muted">Les clics sur les liens ne sont pas encore comptés : les revenus réels se consultent chez Amazon Partenaires et Awin.</p>
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

interface Member {
  id: string; email: string | null; display_name: string | null; provider: string
  created_at: string; last_sign_in_at: string | null; wishes: number; kids: number; gifts: number
}
type SortKey = 'created_at' | 'last_sign_in_at' | 'email' | 'display_name' | 'wishes' | 'gifts'
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–'

interface ReminderStat { kind: 'activation' | 'first_wish'; pending: number; sent: number; last_sent: string | null }
const REMINDERS: Record<ReminderStat['kind'], { title: string; who: string; what: string }> = {
  activation: { title: 'Pas encore commencé', who: '1 jour après l\'inscription : jamais connecté ou sans liste', what: '« Votre liste d\'envies vous attend » : connexion sans mot de passe, comment ajouter et partager.' },
  first_wish: { title: 'Liste sans envie', who: '3 jours après l\'inscription : liste créée mais aucune envie', what: '« Ajoutez votre première envie en un clic » : liens vers les extensions Chrome, Edge, Firefox et le partage sur téléphone.' },
}

/** Relances par e-mail : une seule fois par personne et par type */
interface PreviewRun { ran_at: string; candidates: number; tried: number; fixed: number; images: number; prices: number; titles: number }
interface PreviewStats { last: PreviewRun | null; week: { runs: number; tried: number; fixed: number; images: number; prices: number }; no_image: number; no_price: number }

/** Vérification quotidienne des envies incomplètes (lien sans image ou sans prix) */
function PreviewChecks() {
  const [s, setS] = useState<PreviewStats | null>(null)
  useEffect(() => { supabase.rpc('admin_preview_checks').then(({ data }) => setS((data as PreviewStats) ?? null)) }, [])
  if (!s) return null
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  const detail = (r: { images: number; prices: number; titles?: number }) =>
    [r.images ? plural(r.images, 'image', 'images') : '', r.prices ? plural(r.prices, 'prix', 'prix') : '', r.titles ? plural(r.titles, 'titre', 'titres') : ''].filter(Boolean).join(', ')
  return (
    <section className="reminders">
      <h3 style={{ margin: '0 0 .2rem' }}>Envies incomplètes</h3>
      <p className="small muted" style={{ margin: '0 0 .6rem' }}>Chaque nuit (4h07 et 4h37), les envies avec un lien mais sans image, sans prix ou sans titre sont relues. Une envie qui reste incomplète est retentée chaque semaine ; rien de déjà rempli n'est modifié.</p>
      <div className="reminder-grid">
        <div className="card reminder">
          <strong>Dernière vérification</strong>
          {s.last ? (
            <>
              <span className="small muted">{fmtDate(s.last.ran_at)} à {new Date(s.last.ran_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="small">{plural(s.last.tried, 'envie relue', 'envies relues')}, {plural(s.last.fixed, 'complétée', 'complétées')}{s.last.fixed ? ` (${detail(s.last)})` : ''}.</span>
            </>
          ) : <span className="small muted">Pas encore de passage.</span>}
        </div>
        <div className="card reminder">
          <strong>Sur 7 jours</strong>
          <span className="small">{plural(s.week.fixed, 'envie complétée', 'envies complétées')}{s.week.fixed ? ` (${detail(s.week)})` : ''}</span>
          <span className="small muted">{plural(s.week.runs, 'passage', 'passages')}, {plural(s.week.tried, 'lecture', 'lectures')}</span>
        </div>
        <div className="card reminder">
          <strong>Encore incomplètes</strong>
          <span className="small">{plural(s.no_image, 'envie sans image', 'envies sans image')}</span>
          <span className="small">{plural(s.no_price, 'envie sans prix', 'envies sans prix')}</span>
        </div>
      </div>
    </section>
  )
}

function Reminders() {
  const confirm = useConfirm()
  const [stats, setStats] = useState<ReminderStat[] | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    supabase.rpc('admin_reminders').then(({ data, error }) => {
      if (error) { setErr(errMsg(error)); return }
      setStats(((data as ReminderStat[]) ?? []).map(r => ({ ...r, pending: Number(r.pending), sent: Number(r.sent) })))
    })
  }, [])
  useEffect(() => { load() }, [load])
  const send = async (r: ReminderStat) => {
    const t = REMINDERS[r.kind]
    if (!(await confirm({ title: `Envoyer « ${t.title} » ?`, message: `${r.pending} personne${r.pending > 1 ? 's' : ''} ${r.pending > 1 ? 'vont' : 'va'} recevoir cet e-mail. Chacune ne le reçoit qu'une fois.`, confirmLabel: 'Envoyer' }))) return
    setBusy(r.kind); setMsg(''); setErr('')
    const { data, error } = await supabase.functions.invoke('send-reminders', { body: { kind: r.kind } })
    const res = data as { sent?: number; total?: number; reason?: string; error?: string } | null
    setBusy('')
    if (error || !res) setErr('L\'envoi n\'a pas abouti.')
    else if (res.reason === 'not_configured') setErr('L\'envoi d\'e-mails n\'est pas configuré.')
    else if (res.reason === 'refused') setErr(res.error ?? 'Envoi refusé.')
    else setMsg(`${res.sent} e-mail${(res.sent ?? 0) > 1 ? 's' : ''} envoyé${(res.sent ?? 0) > 1 ? 's' : ''}${res.total !== res.sent ? ` sur ${res.total}` : ''}.`)
    load()
  }
  if (!stats) return null
  return (
    <section className="reminders">
      <h3 style={{ margin: '0 0 .2rem' }}>Relances par e-mail</h3>
      <p className="small muted" style={{ margin: '0 0 .6rem' }}>Envoyées automatiquement chaque matin (9h), une seule fois par personne. Le bouton envoie tout de suite celles qui sont dues.</p>
      <Notice>{err}</Notice><Notice kind="ok">{msg}</Notice>
      <div className="reminder-grid">
        {stats.map(r => (
          <div key={r.kind} className="card reminder">
            <strong>{REMINDERS[r.kind].title}</strong>
            <span className="small muted">{REMINDERS[r.kind].who}</span>
            <span className="small">{REMINDERS[r.kind].what}</span>
            <span className="small muted">{r.pending ? `${r.pending} en attente du prochain envoi · ` : ''}{r.sent ? `Déjà relancés : ${r.sent}${r.last_sent ? ` (dernier envoi le ${fmtDate(r.last_sent)})` : ''}` : 'Jamais envoyée'}</span>
            <div>
              <button type="button" className="btn btn-sm btn-primary" disabled={!r.pending || busy === r.kind} onClick={() => send(r)}>
                {busy === r.kind ? 'Envoi…' : r.pending ? `Envoyer maintenant (${r.pending})` : 'Personne à relancer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Liste des inscrits : adresse, prénom, nombre d'envies et de cadeaux réservés */
function UsersTab({ onDenied }: { onDenied: () => void }) {
  const [rows, setRows] = useState<Member[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'created_at', desc: true })
  useEffect(() => {
    supabase.rpc('admin_users').then(({ data, error }) => {
      if (error) { if (/refus/i.test(error.message)) onDenied(); else setErr(errMsg(error)); setRows([]); return }
      setRows(((data as Member[]) ?? []).map(r => ({ ...r, wishes: Number(r.wishes), kids: Number(r.kids), gifts: Number(r.gifts) })))
    })
  }, [onDenied])
  if (!rows) return <Spinner />
  const n = q.trim().toLowerCase()
  const shown = rows
    .filter(r => !n || (r.email ?? '').toLowerCase().includes(n) || (r.display_name ?? '').toLowerCase().includes(n))
    .sort((a, b) => {
      const x = a[sort.k] ?? '', y = b[sort.k] ?? ''
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr', { sensitivity: 'base' })
      return sort.desc ? -c : c
    })
  const th = (k: SortKey, label: string, num = false) => (
    <th className={num ? 'num' : ''} aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSort(s => ({ k, desc: s.k === k ? !s.desc : num || k.endsWith('_at') }))}>
        {label}{sort.k === k ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['E-mail', 'Prénom', 'Connexion', 'Inscrit le', 'Dernière connexion', 'Envies', "Listes d'enfants", 'Cadeaux réservés'].map(esc).join(';'),
      ...shown.map(r => [r.email, r.display_name, r.provider, fmtDate(r.created_at), fmtDate(r.last_sign_in_at), r.wishes, r.kids, r.gifts].map(esc).join(';'))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    a.download = `inscrits-iwantthis-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }
  const tot = (k: 'wishes' | 'gifts') => shown.reduce((s, r) => s + r[k], 0)
  return (
    <div>
      <Reminders />
      <PreviewChecks />
      <Notice>{err}</Notice>
      <div className="users-bar">
        <input type="search" placeholder="Rechercher un e-mail ou un prénom" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher" />
        <span className="small muted">{shown.length} inscrit{shown.length > 1 ? 's' : ''} · {tot('wishes')} envies · {tot('gifts')} cadeaux</span>
        <button type="button" className="btn btn-sm" onClick={csv}>Exporter (CSV)</button>
      </div>
      <div className="users-wrap">
        <table className="users-table">
          <thead><tr>
            {th('email', 'E-mail')}{th('display_name', 'Prénom')}{th('created_at', 'Inscrit le')}{th('last_sign_in_at', 'Dernière connexion')}
            {th('wishes', 'Envies', true)}{th('gifts', 'Cadeaux', true)}
          </tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id}>
              <td className="u-mail">{r.email ?? '–'}{r.provider === 'google' && <span className="u-tag">Google</span>}</td>
              <td>{r.display_name ?? '–'}{r.kids > 0 && <span className="u-tag">+{r.kids} enfant{r.kids > 1 ? 's' : ''}</span>}</td>
              <td>{fmtDate(r.created_at)}</td>
              <td>{r.last_sign_in_at ? fmtDate(r.last_sign_in_at) : <span className="muted">jamais</span>}</td>
              <td className="num">{r.wishes}</td>
              <td className="num">{r.gifts}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted">Envies : sur toutes ses listes (enfants compris). Cadeaux : les envies des autres qu'il ou elle a réservées.</p>
    </div>
  )
}

/** Espace réservé aux administrateurs : statistiques, inscrits et partenaires */
export default function Admin() {
  const [tab, setTab] = useState<'stats' | 'users' | 'partners'>('stats')
  const [denied, setDenied] = useState(false)
  const deny = useCallback(() => setDenied(true), [])
  if (denied) return <Navigate to="/" replace />
  return (
    <div className="admin">
      <div className="page-head"><h1>Administration</h1></div>
      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}><Icon name="chart" size={16} /> Statistiques</button>
        <button role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}><Icon name="users" size={16} /> Inscrits</button>
        <button role="tab" aria-selected={tab === 'partners'} className={tab === 'partners' ? 'on' : ''} onClick={() => setTab('partners')}><Icon name="gift" size={16} /> Partenaires</button>
      </div>
      {tab === 'stats' ? <StatsTab onDenied={deny} /> : tab === 'users' ? <UsersTab onDenied={deny} /> : <PartnersTab />}
      <p className="small muted"><Link to="/reglages">← Réglages</Link></p>
    </div>
  )
}
