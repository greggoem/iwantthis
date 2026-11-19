// Opérations métier partagées par l'API REST et le serveur MCP.
// Toutes les requêtes passent par un client Supabase authentifié COMME l'utilisateur :
// la sécurité par ligne (RLS) s'applique donc exactement comme sur le site
// (ex. le propriétaire d'une liste ne voit pas les achats avant la date de remise).
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type SB = SupabaseClient

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export interface Ctx {
  sb: SB
  uid: string
  jwt: string
  siteUrl: string      // ex. https://iwantthis.gift/
  supabaseUrl: string
  anonKey: string
}

// ---------- utilitaires ----------
const UUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const isUuid = (s: unknown): boolean => typeof s === 'string' && new RegExp(`^${UUID_SRC}$`, 'i').test(s.trim())
const findUuid = (s: string) => s.match(new RegExp(UUID_SRC, 'i'))?.[0]

function statusFor(e: { code?: string }): number {
  switch (e.code) {
    case '42501': return 403
    case '23505': case '23503': return 409
    case 'PGRST116': return 404
    case 'P0001': case '23514': case '22P02': case '22007': case '22008': case '23502': return 400
    default: return 500
  }
}
function ok<T>(r: { data: T | null; error: any }): T {
  if (r.error) throw new ApiError(statusFor(r.error), r.error.message ?? 'Erreur')
  return r.data as T
}

export function httpUrl(raw: unknown, field = 'url'): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t || t.length > 2000) throw new ApiError(400, `${field} : lien manquant ou trop long`)
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
    return u.toString()
  } catch { throw new ApiError(400, `${field} doit être un lien http(s) valide`) }
}
function text(v: unknown, field: string, max: number, required = false): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (required) throw new ApiError(400, `${field} est obligatoire`)
    return null
  }
  if (typeof v !== 'string') throw new ApiError(400, `${field} doit être un texte`)
  const t = v.trim()
  if (t.length > max) throw new ApiError(400, `${field} : ${max} caractères maximum`)
  return t
}
function priceOf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!isFinite(n) || n < 0 || n > 1e6) throw new ApiError(400, 'prix invalide')
  return Math.round(n * 100) / 100
}
function dateOf(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) {
    throw new ApiError(400, `${field} doit être une date au format AAAA-MM-JJ`)
  }
  return v
}
export const todayBE = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' })
/** minuscules sans accents : « Noel » trouve « Noël », « Helene » trouve « Hélène » */
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const one = <T>(d: T | T[] | null): T | null => (Array.isArray(d) ? (d[0] ?? null) : d)

const shareUrl = (c: Ctx, token: string) => `${c.siteUrl}#/l/${token}`
const inviteUrl = (c: Ctx, code: string) => `${c.siteUrl}#/e/${code}`

function giftOut(it: any, claim: any | undefined, me: string) {
  return {
    id: it.id, title: it.title, url: it.url, details: it.details,
    price: it.price === null || it.price === undefined ? null : Number(it.price),
    image_url: it.image_url,
    status: claim ? 'claimed' : 'available',
    ...(claim ? { claimed_by: claim.claimed_by_name, claimed_by_me: claim.claimed_by === me, reveal_on: claim.reveal_on } : {}),
  }
}

// ---------- aperçu d'un lien (image, prix, titre) ----------
export interface Preview { found: boolean; title?: string; image?: string; price?: number; currency?: string; site?: string; reason?: string; url?: string }
const SHORT = /^(www\.)?(amzn\.eu|amzn\.to|a\.co|amzn\.asia)$/i
const isShort = (u: string) => { try { return SHORT.test(new URL(u).hostname) } catch { return false } }

export async function previewLink(c: Ctx, url: string): Promise<Preview> {
  try {
    const r = await fetch(`${c.supabaseUrl}/functions/v1/link-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.jwt}`, apikey: c.anonKey },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) return { found: false, reason: 'Service de lecture indisponible' }
    return await r.json() as Preview
  } catch { return { found: false, reason: 'Service de lecture indisponible' } }
}
const euro = (p: Preview) => (p.price !== undefined && (!p.currency || p.currency === 'EUR') ? p.price : undefined)

// ---------- profil & ma liste ----------
export async function me(c: Ctx) {
  const p = ok(await c.sb.from('profiles').select('id,display_name').eq('id', c.uid).maybeSingle()) as any
  return { id: c.uid, display_name: p?.display_name ?? null }
}

async function myListRow(c: Ctx): Promise<any> {
  const l = one(ok(await c.sb.rpc('ensure_my_list')) as any)
  if (!l) throw new ApiError(500, 'Liste introuvable')
  return l
}

export async function myList(c: Ctx) {
  const list = await myListRow(c)
  const [items, claims] = await Promise.all([
    c.sb.from('items').select('*').eq('list_id', list.id).order('created_at'),
    c.sb.from('item_claims').select('*'),    // seuls les achats déjà « révélés » reviennent au propriétaire
  ])
  const cl = Object.fromEntries((ok(claims) as any[]).map((x) => [x.item_id, x]))
  return {
    list: { id: list.id, title: list.title, share_url: shareUrl(c, list.share_token) },
    gifts: (ok(items) as any[]).map((it) => giftOut(it, cl[it.id], c.uid)),
    note: 'Les achats effectués par vos proches ne sont visibles qu\'à partir de leur date de remise.',
  }
}

export async function addGift(c: Ctx, b: any) {
  // validation d'abord (aucun appel à la base si les données sont incorrectes)
  const row: any = {
    title: text(b.title, 'title', 200, true),
    url: b.url ? httpUrl(b.url) : null,
    details: text(b.details, 'details', 1000),
    price: priceOf(b.price),
    image_url: b.image_url ? httpUrl(b.image_url, 'image_url') : null,
  }
  row.list_id = (await myListRow(c)).id
  let preview: Preview | undefined
  if (row.url && ((b.fetch_preview !== false && (!row.image_url || row.price === null)) || isShort(row.url))) {
    preview = await previewLink(c, row.url)
    if (preview.url) row.url = httpUrl(preview.url)   // lien court résolu
    if (preview.found) {
      if (!row.image_url && preview.image) row.image_url = preview.image
      if (row.price === null && euro(preview) !== undefined) row.price = euro(preview)
    }
  }
  const item = ok(await c.sb.from('items').insert(row).select().single()) as any
  return { gift: giftOut(item, undefined, c.uid), preview: preview && { found: preview.found, reason: preview.reason } }
}

export async function updateGift(c: Ctx, id: string, b: any) {
  if (!isUuid(id)) throw new ApiError(400, 'gift_id invalide')
  const patch: any = {}
  if ('title' in b) patch.title = text(b.title, 'title', 200, true)
  if ('url' in b) patch.url = b.url ? httpUrl(b.url) : null
  if ('details' in b) patch.details = text(b.details, 'details', 1000)
  if ('price' in b) patch.price = priceOf(b.price)
  if ('image_url' in b) patch.image_url = b.image_url ? httpUrl(b.image_url, 'image_url') : null
  if (Object.keys(patch).length === 0) throw new ApiError(400, 'Rien à modifier')
  const rows = ok(await c.sb.from('items').update(patch).eq('id', id).select()) as any[]
  if (!rows.length) throw new ApiError(404, 'Cadeau introuvable (ou ce n\'est pas le vôtre)')
  return { gift: giftOut(rows[0], undefined, c.uid) }
}

export async function deleteGift(c: Ctx, id: string) {
  if (!isUuid(id)) throw new ApiError(400, 'gift_id invalide')
  const rows = ok(await c.sb.from('items').delete().eq('id', id).select('id,title')) as any[]
  if (!rows.length) throw new ApiError(404, 'Cadeau introuvable (ou ce n\'est pas le vôtre)')
  return { deleted: true, title: rows[0].title }
}

export async function refreshGift(c: Ctx, id: string) {
  if (!isUuid(id)) throw new ApiError(400, 'gift_id invalide')
  const it = ok(await c.sb.from('items').select('*').eq('id', id).maybeSingle()) as any
  if (!it) throw new ApiError(404, 'Cadeau introuvable')
  if (!it.url) throw new ApiError(400, 'Ce cadeau n\'a pas de lien à relire')
  const p = await previewLink(c, it.url)
  if (p.url && p.url !== it.url) {
    const rows = ok(await c.sb.from('items').update({ url: httpUrl(p.url) }).eq('id', id).select()) as any[]
    if (rows.length) Object.assign(it, rows[0])
  }
  if (!p.found) return { updated: false, reason: p.reason ?? 'Lecture impossible', gift: giftOut(it, undefined, c.uid) }
  const patch: any = {}
  // une image ajoutée à la main (stockée dans item-images) n'est jamais remplacée
  const ownImage = typeof it.image_url === 'string' && it.image_url.includes('/storage/v1/object/public/item-images/')
  if (p.image && !ownImage) patch.image_url = p.image
  if (euro(p) !== undefined) patch.price = euro(p)
  if (!Object.keys(patch).length) return { updated: false, reason: 'Le site ne donne ni image ni prix', gift: giftOut(it, undefined, c.uid) }
  const rows = ok(await c.sb.from('items').update(patch).eq('id', id).select()) as any[]
  if (!rows.length) throw new ApiError(403, 'Seul le propriétaire de la liste peut actualiser ce cadeau')
  return { updated: true, gift: giftOut(rows[0], undefined, c.uid) }
}

// ---------- listes des proches ----------
export async function sharedLists(c: Ctx) {
  const rows = ok(await c.sb.from('wishlists').select('id,owner_id,title,child_name,items(count)').neq('owner_id', c.uid)) as any[]
  const names: Record<string, string> = {}
  if (rows.length) {
    const p = ok(await c.sb.from('profiles').select('id,display_name').in('id', rows.map((r) => r.owner_id))) as any[]
    for (const x of p) names[x.id] = x.display_name
  }
  return rows.map((r) => ({ id: r.id, owner: r.child_name ?? names[r.owner_id] ?? null, child: !!r.child_name, owner_id: r.owner_id, title: r.title, gift_count: r.items?.[0]?.count ?? 0 }))
}

export async function resolveListId(c: Ctx, ref: unknown): Promise<string> {
  if (typeof ref !== 'string' || !ref.trim()) throw new ApiError(400, 'Précisez la liste (identifiant ou prénom du propriétaire)')
  if (isUuid(ref)) return (ref as string).trim()
  const lists = await sharedLists(c)
  const q = norm(ref)
  let m = lists.filter((l) => norm(l.owner ?? '') === q)
  if (!m.length) m = lists.filter((l) => norm(l.owner ?? '').includes(q))
  if (m.length === 1) return m[0].id
  if (!m.length) throw new ApiError(404, `Aucune liste partagée avec vous au nom de « ${ref} »`)
  throw new ApiError(400, `Plusieurs listes correspondent : ${m.map((l) => `${l.owner} (${l.id})`).join(', ')}`)
}

export async function getList(c: Ctx, ref: unknown) {
  const id = await resolveListId(c, ref)
  const l = ok(await c.sb.from('wishlists').select('id,owner_id,title,share_token,child_name').eq('id', id).maybeSingle()) as any
  if (!l) throw new ApiError(404, 'Liste introuvable ou accès refusé')
  const [items, claims, prof] = await Promise.all([
    c.sb.from('items').select('*').eq('list_id', id).order('created_at'),
    c.sb.from('item_claims').select('*'),
    c.sb.from('profiles').select('display_name').eq('id', l.owner_id).maybeSingle(),
  ])
  const itemRows = ok(items) as any[]
  const ids = new Set(itemRows.map((i) => i.id))
  const cl = Object.fromEntries((ok(claims) as any[]).filter((x) => ids.has(x.item_id)).map((x) => [x.item_id, x]))
  return {
    list: { id: l.id, title: l.title, owner: l.child_name ?? (ok(prof) as any)?.display_name ?? null, is_mine: l.owner_id === c.uid },
    gifts: itemRows.map((it) => giftOut(it, cl[it.id], c.uid)),
  }
}

export async function openSharedList(c: Ctx, tokenOrUrl: unknown) {
  const t = typeof tokenOrUrl === 'string' ? findUuid(tokenOrUrl) : undefined
  if (!t) throw new ApiError(400, 'Lien de partage ou jeton de liste invalide')
  const id = ok(await c.sb.rpc('open_shared_list', { p_token: t })) as string
  return { list_id: id }
}

// ---------- achats ----------
async function pickCommonEvent(c: Ctx, ownerId: string) {
  const evs = ok(await c.sb.from('events').select('id,name,event_date,event_members(user_id)')) as any[]
  const common = evs.filter((e) => e.event_members.some((m: any) => m.user_id === ownerId)).sort((a, b) => a.event_date.localeCompare(b.event_date))
  return common.find((e) => e.event_date >= todayBE()) ?? null
}

export async function claimGift(c: Ctx, id: string, b: any) {
  if (!isUuid(id)) throw new ApiError(400, 'gift_id invalide')
  const it = ok(await c.sb.from('items').select('id,list_id,title').eq('id', id).maybeSingle()) as any
  if (!it) throw new ApiError(404, 'Cadeau introuvable ou accès refusé')
  const l = ok(await c.sb.from('wishlists').select('owner_id').eq('id', it.list_id).maybeSingle()) as any
  let eventId: string | null = null
  let reveal: string | null = null
  if (b.event) eventId = await resolveEventId(c, b.event)
  else if (b.event_id) eventId = String(b.event_id)
  else if (b.reveal_on) reveal = dateOf(b.reveal_on, 'reveal_on')
  else {
    const ev = l ? await pickCommonEvent(c, l.owner_id) : null
    if (!ev) throw new ApiError(400, 'Aucun événement à venir commun avec cette personne : précisez reveal_on (AAAA-MM-JJ), la date de remise du cadeau')
    eventId = ev.id
  }
  ok(await c.sb.rpc('claim_item', { p_item: id, p_event: eventId, p_reveal: reveal }))
  const claim = ok(await c.sb.from('item_claims').select('*').eq('item_id', id).maybeSingle()) as any
  return { claimed: true, gift: it.title, reveal_on: claim?.reveal_on ?? reveal, note: 'Le propriétaire de la liste ne verra pas cet achat avant cette date.' }
}

export async function unclaimGift(c: Ctx, id: string) {
  if (!isUuid(id)) throw new ApiError(400, 'gift_id invalide')
  const rows = ok(await c.sb.from('item_claims').delete().eq('item_id', id).select('item_id')) as any[]
  if (!rows.length) throw new ApiError(404, 'Aucun achat de votre part à annuler sur ce cadeau')
  return { unclaimed: true }
}

// ---------- événements ----------
export async function listEvents(c: Ctx) {
  const rows = ok(await c.sb.from('events').select('*,event_members(count)').order('event_date')) as any[]
  return rows.map((e) => ({
    id: e.id, name: e.name, event_date: e.event_date, is_organizer: e.created_by === c.uid,
    members_count: e.event_members?.[0]?.count ?? 0, draw_done: Boolean(e.draw_done_at),
  }))
}

export async function resolveEventId(c: Ctx, ref: unknown): Promise<string> {
  if (typeof ref !== 'string' || !ref.trim()) throw new ApiError(400, 'Précisez l\'événement (identifiant ou nom)')
  if (isUuid(ref)) return (ref as string).trim()
  const evs = ok(await c.sb.from('events').select('id,name,event_date')) as any[]
  const q = norm(ref)
  let m = evs.filter((e) => norm(e.name) === q)
  if (!m.length) m = evs.filter((e) => norm(e.name).includes(q))
  if (m.length === 1) return m[0].id
  if (!m.length) throw new ApiError(404, `Aucun événement nommé « ${ref} »`)
  throw new ApiError(400, `Plusieurs événements correspondent : ${m.map((e) => `${e.name} ${e.event_date} (${e.id})`).join(', ')}`)
}

async function eventMembers(c: Ctx, eventId: string): Promise<any[]> {
  return ok(await c.sb.from('event_members').select('user_id,in_draw,profiles(display_name)').eq('event_id', eventId)) as any[]
}
function member(members: any[], ref: unknown): any {
  if (typeof ref !== 'string' || !ref.trim()) throw new ApiError(400, 'Précisez la personne (prénom ou identifiant)')
  const r = norm(ref)
  const name = (m: any) => norm(m.profiles?.display_name ?? '')
  let m = members.filter((x) => x.user_id === r || name(x) === r)
  if (!m.length) m = members.filter((x) => name(x).includes(r))
  if (m.length === 1) return m[0]
  if (!m.length) throw new ApiError(404, `« ${ref} » n'est pas invité(e) à cet événement`)
  throw new ApiError(400, `Plusieurs invités correspondent à « ${ref} » : précisez`)
}

export async function getEvent(c: Ctx, ref: unknown) {
  const id = await resolveEventId(c, ref)
  const e = ok(await c.sb.from('events').select('*').eq('id', id).maybeSingle()) as any
  if (!e) throw new ApiError(404, 'Événement introuvable ou accès refusé')
  const members = await eventMembers(c, id)
  const [lists, draws] = await Promise.all([
    c.sb.from('wishlists').select('id,owner_id').is('child_name', null).in('owner_id', members.map((m) => m.user_id)),
    eventDraws(c, id),
  ])
  const listOf = Object.fromEntries((ok(lists) as any[]).map((l) => [l.owner_id, l.id]))
  const isOrg = e.created_by === c.uid
  const inSome = new Set(draws.flatMap((d: any) => d.participants.map((p: any) => p.pid)))
  return {
    id: e.id, name: e.name, event_date: e.event_date, is_organizer: isOrg, invite_url: inviteUrl(c, e.invite_code),
    members: members.map((m) => ({ user_id: m.user_id, name: m.profiles?.display_name ?? null, in_draw: inSome.has(m.user_id), is_me: m.user_id === c.uid, is_organizer: m.user_id === e.created_by, list_id: listOf[m.user_id] ?? null })),
    draws: draws.map((d: any) => drawSummary(d, isOrg)),
  }
}

export async function createEvent(c: Ctx, b: any) {
  const row = { name: text(b.name, 'name', 120, true), event_date: dateOf(b.event_date, 'event_date'), created_by: c.uid }
  const e = ok(await c.sb.from('events').insert(row).select().single()) as any
  return { id: e.id, name: e.name, event_date: e.event_date, invite_url: inviteUrl(c, e.invite_code) }
}

export async function updateEvent(c: Ctx, ref: unknown, b: any) {
  const id = await resolveEventId(c, ref)
  const patch: any = {}
  if ('name' in b) patch.name = text(b.name, 'name', 120, true)
  if ('event_date' in b) patch.event_date = dateOf(b.event_date, 'event_date')
  if (!Object.keys(patch).length) throw new ApiError(400, 'Rien à modifier')
  const rows = ok(await c.sb.from('events').update(patch).eq('id', id).select('id,name,event_date')) as any[]
  if (!rows.length) throw new ApiError(403, 'Seul l\'organisateur peut modifier l\'événement')
  return rows[0]
}

export async function deleteEvent(c: Ctx, ref: unknown) {
  const id = await resolveEventId(c, ref)
  const rows = ok(await c.sb.from('events').delete().eq('id', id).select('id,name')) as any[]
  if (!rows.length) throw new ApiError(403, 'Seul l\'organisateur peut supprimer l\'événement')
  return { deleted: true, name: rows[0].name }
}

export async function joinEvent(c: Ctx, invite: unknown) {
  if (typeof invite !== 'string' || !invite.trim()) throw new ApiError(400, 'Lien ou code d\'invitation manquant')
  const code = invite.match(/#\/e\/([a-z0-9]+)/i)?.[1] ?? invite.trim()
  const id = ok(await c.sb.rpc('join_event', { p_code: code })) as string
  return getEvent(c, id)
}

// ---------- tirages au sort (plusieurs par événement) ----------
// Un participant est un invité (compte) ou une liste d'enfant. Chacun ne voit que ses résultats et ceux de ses enfants.
async function eventDraws(c: Ctx, eventId: string): Promise<any[]> {
  return (ok(await c.sb.rpc('event_draws', { p_event: eventId })) as any[]) ?? []
}
function findDraw(draws: any[], ref: unknown): any | null {
  if (ref == null || (typeof ref === 'string' && !ref.trim())) {
    if (draws.length === 1) return draws[0]
    if (!draws.length) return null
    throw new ApiError(400, `Cet événement a plusieurs tirages : précisez lequel (${draws.map((d) => `« ${d.name} »`).join(', ')})`)
  }
  const r = norm(String(ref))
  let m = draws.filter((d) => d.id === r || norm(d.name) === r)
  if (!m.length) m = draws.filter((d) => norm(d.name).includes(r))
  if (m.length === 1) return m[0]
  if (!m.length) return null
  throw new ApiError(400, `Plusieurs tirages correspondent à « ${ref} » : précisez`)
}
/** Invités et listes d'enfants pouvant participer (pid = id du compte ou de la liste d'enfant) */
async function drawPeople(c: Ctx, eventId: string): Promise<{ pid: string; name: string }[]> {
  const ms = await eventMembers(c, eventId)
  const kids = ok(await c.sb.from('wishlists').select('id,child_name').not('child_name', 'is', null).in('owner_id', ms.map((m) => m.user_id))) as any[]
  return [...ms.map((m) => ({ pid: m.user_id, name: m.profiles?.display_name ?? '' })), ...kids.map((k) => ({ pid: k.id, name: k.child_name }))]
}
function person(people: { pid: string; name: string }[], ref: unknown) {
  if (typeof ref !== 'string' || !ref.trim()) throw new ApiError(400, 'Précisez la personne (prénom ou identifiant)')
  const r = norm(ref)
  let m = people.filter((x) => x.pid === r || norm(x.name) === r)
  if (!m.length) m = people.filter((x) => norm(x.name).includes(r))
  if (m.length === 1) return m[0]
  if (!m.length) throw new ApiError(404, `« ${ref} » ne fait pas partie de cet événement ou de ce tirage`)
  throw new ApiError(400, `Plusieurs personnes correspondent à « ${ref} » : précisez`)
}
/** Le tirage visé ; s'il n'existe pas encore, on le crée (avec tous les invités s'il s'agit du premier) */
async function drawFor(c: Ctx, eventId: string, ref: unknown, create = true): Promise<any> {
  const draws = await eventDraws(c, eventId)
  const d = findDraw(draws, ref)
  if (d) return d
  if (!create) throw new ApiError(404, draws.length ? `Aucun tirage nommé « ${ref} »` : 'Aucun tirage dans cet événement')
  const name = typeof ref === 'string' && ref.trim() ? ref.trim() : 'Tirage au sort'
  const pids = draws.length ? [] : (await eventMembers(c, eventId)).map((m) => m.user_id)
  const id = ok(await c.sb.rpc('save_draw', { p_event: eventId, p_draw: null, p_name: name, p_pids: pids })) as string
  return findDraw(await eventDraws(c, eventId), id)
}
const resultsOf = (d: any) => (d.mine ?? []).map((m: any) => ({
  draw: d.name, giver: m.giver_kind === 'me' ? 'vous' : m.giver_name, recipient: m.receiver_name, list_id: m.receiver_list ?? null,
}))
function drawSummary(d: any, isOrg: boolean) {
  const nm = (pid: string) => d.participants.find((p: any) => p.pid === pid)?.name ?? pid
  return {
    name: d.name, done: Boolean(d.done_at), done_at: d.done_at,
    outdated: Boolean(d.done_at) && d.done_count !== d.participants.length,
    participants: d.participants.map((p: any) => (p.kind === 'kid' ? `${p.name} (liste d'enfant)` : p.name)),
    my_results: resultsOf(d),
    ...(isOrg ? { exclusions: d.blocks.map((b: any) => ({ giver: nm(b.giver), receiver: nm(b.receiver) })) } : {}),
  }
}

export async function addExclusion(c: Ctx, eventRef: unknown, a: unknown, bRef: unknown, both = true, drawRef?: unknown) {
  const id = await resolveEventId(c, eventRef)
  const d = await drawFor(c, id, drawRef)
  const people = d.participants.map((p: any) => ({ pid: p.pid, name: p.name }))
  const x = person(people, a), y = person(people, bRef)
  if (x.pid === y.pid) throw new ApiError(400, 'Choisissez deux personnes différentes')
  ok(await c.sb.rpc('set_draw_block', { p_draw: d.id, p_giver: x.pid, p_receiver: y.pid, p_on: true, p_both: both }))
  return { excluded: true, draw: d.name, both_ways: both, people: [x.name, y.name] }
}

export async function removeExclusion(c: Ctx, eventRef: unknown, a: unknown, bRef: unknown, both = true, drawRef?: unknown) {
  const id = await resolveEventId(c, eventRef)
  const d = await drawFor(c, id, drawRef, false)
  const people = d.participants.map((p: any) => ({ pid: p.pid, name: p.name }))
  const x = person(people, a), y = person(people, bRef)
  ok(await c.sb.rpc('set_draw_block', { p_draw: d.id, p_giver: x.pid, p_receiver: y.pid, p_on: false, p_both: both }))
  return { removed: true, draw: d.name }
}

export async function setInDraw(c: Ctx, eventRef: unknown, who: unknown, inDraw: boolean, drawRef?: unknown) {
  const id = await resolveEventId(c, eventRef)
  const p = person(await drawPeople(c, id), who)
  const d = await drawFor(c, id, drawRef, inDraw)
  const pids = new Set<string>(d.participants.map((x: any) => x.pid))
  if (inDraw) pids.add(p.pid); else pids.delete(p.pid)
  ok(await c.sb.rpc('save_draw', { p_event: id, p_draw: d.id, p_name: d.name, p_pids: [...pids] }))
  return { person: p.name, draw: d.name, in_draw: inDraw }
}

export async function runDraw(c: Ctx, eventRef: unknown, drawRef?: unknown) {
  const id = await resolveEventId(c, eventRef)
  const d = await drawFor(c, id, drawRef)
  ok(await c.sb.rpc('run_one_draw', { p_draw: d.id }))
  const after = findDraw(await eventDraws(c, id), d.id)
  return { done: true, draw: d.name, note: 'Tirage effectué. Chacun (organisateur compris) ne voit que son résultat et celui de ses enfants.', my_results: after ? resultsOf(after) : [] }
}

export async function resetDraw(c: Ctx, eventRef: unknown, drawRef?: unknown) {
  const id = await resolveEventId(c, eventRef)
  const d = await drawFor(c, id, drawRef, false)
  ok(await c.sb.rpc('reset_one_draw', { p_draw: d.id }))
  return { reset: true, draw: d.name }
}

export async function myDraw(c: Ctx, eventRef: unknown) {
  const id = await resolveEventId(c, eventRef)
  const results = (await eventDraws(c, id)).filter((d) => d.done_at).flatMap(resultsOf)
  if (!results.length) return { my_results: [], note: 'Pas de résultat pour vous (tirage pas encore fait, ou vous ne participez pas).' }
  const mine = results.filter((r: any) => r.giver === 'vous')
  return { my_results: results, ...(mine.length === 1 ? { my_recipient: { name: mine[0].recipient, list_id: mine[0].list_id } } : {}) }
}
