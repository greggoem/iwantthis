// Tests locaux : deno test --allow-net=none api.test.ts   (client Supabase simulé, aucun réseau)
// deno-lint-ignore-file no-explicit-any
import { handleRequest, normalizePath } from './router.ts'
import { ApiError, type Ctx } from './ops.ts'

function assert(cond: unknown, msg: string) { if (!cond) throw new Error('ÉCHEC : ' + msg) }
function eq(a: unknown, b: unknown, msg: string) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`) }

/** Faux client Supabase : chaque table renvoie ses lignes ; les appels sont enregistrés. */
function fakeSb(tables: Record<string, any[]>, rpcs: Record<string, any> = {}, calls: any[] = []) {
  const builder = (name: string) => {
    let op = 'select'
    let rows = tables[name] ?? []
    const b: any = {
      select: () => b, order: () => b, eq: () => b, neq: () => b, in: () => b,
      insert: (r: any) => { op = 'insert'; calls.push([name, 'insert', r]); rows = [{ id: 'new-id', ...r }]; return b },
      update: (r: any) => { op = 'update'; calls.push([name, 'update', r]); rows = rows.map((x) => ({ ...x, ...r })); return b },
      delete: () => { op = 'delete'; calls.push([name, 'delete']); return b },
      upsert: (r: any) => { op = 'upsert'; calls.push([name, 'upsert', r]); return b },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === 'upsert' ? null : rows, error: null }).then(res, rej),
    }
    return b
  }
  return {
    from: builder,
    rpc: (fn: string, args: any) => { calls.push(['rpc', fn, args]); const r = rpcs[fn]; return Promise.resolve(r instanceof Error ? { data: null, error: { code: 'P0001', message: r.message } } : { data: r ?? null, error: null }) },
  }
}
const ctxWith = (sb: any): Ctx => ({ sb, uid: 'u-me', jwt: 'jwt', siteUrl: 'https://site.test/', supabaseUrl: 'https://x.supabase.co', anonKey: 'k' })
const BASE = 'https://x.supabase.co/functions/v1/api'
const authOK = (sb: any) => (t: string) => t === 'ncg_' + 'a'.repeat(64) ? Promise.resolve(ctxWith(sb)) : Promise.reject(new ApiError(401, 'Jeton invalide'))
const TOKEN = 'ncg_' + 'a'.repeat(64)
const req = (method: string, path: string, body?: unknown, token: string | null = TOKEN) =>
  new Request(`${BASE}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const call = async (r: Request, sb: any = fakeSb({})) => { const res = await handleRequest(r, authOK(sb), BASE); return { status: res.status, json: res.status === 202 || res.status === 204 ? null : await res.json(), headers: res.headers } }
const rpc = (method: string, params?: unknown, id: number | null = 1) => ({ jsonrpc: '2.0', ...(id !== null ? { id } : {}), method, params })

Deno.test('chemins : préfixes de la plateforme', () => {
  eq(normalizePath('/functions/v1/api/v1/me'), '/v1/me', 'préfixe complet')
  eq(normalizePath('/api/v1/me'), '/v1/me', 'préfixe court')
  eq(normalizePath('/api'), '/', 'racine')
  eq(normalizePath('/api/mcp/t/abc'), '/mcp/t/abc', 'mcp')
})

Deno.test('public : accueil et OpenAPI sans jeton', async () => {
  let r = await call(req('GET', '', undefined, null))
  assert(r.status === 200 && r.json.mcp.endsWith('/mcp'), 'accueil')
  r = await call(req('GET', '/v1/openapi.json', undefined, null))
  assert(r.status === 200 && r.json.openapi === '3.1.0' && Object.keys(r.json.paths).length > 15, 'openapi')
})

Deno.test('REST : authentification', async () => {
  let r = await call(req('GET', '/v1/me', undefined, null))
  assert(r.status === 401 && r.headers.get('www-authenticate')?.startsWith('Bearer'), 'sans jeton → 401')
  r = await call(req('GET', '/v1/me', undefined, 'ncg_' + 'b'.repeat(64)))
  assert(r.status === 401, 'mauvais jeton → 401')
  r = await call(req('GET', '/v1/inconnu'))
  eq(r.status, 404, 'route inconnue')
  r = await call(req('PUT', '/v1/me'))
  eq(r.status, 405, 'méthode non autorisée')
})

Deno.test('REST : mon profil et ma liste (achats déjà révélés seulement)', async () => {
  const sb = fakeSb({
    profiles: [{ id: 'u-me', display_name: 'Greg' }],
    items: [{ id: 'i1', title: 'Pull', url: 'https://x.be', details: 'L', price: 89.9, image_url: null }, { id: 'i2', title: 'Livre', url: null, details: null, price: null, image_url: null }],
    item_claims: [{ item_id: 'i1', claimed_by: 'u-j', claimed_by_name: 'Julie', reveal_on: '2026-12-25' }],
  }, { ensure_my_list: { id: 'L1', title: 'Ma liste', share_token: 'tok-1' } })
  let r = await call(req('GET', '/v1/me'), sb)
  eq(r.json.data, { id: 'u-me', display_name: 'Greg' }, 'me')
  r = await call(req('GET', '/v1/list'), sb)
  eq(r.json.data.list.share_url, 'https://site.test/#/l/tok-1', 'lien de partage')
  eq(r.json.data.gifts.map((g: any) => [g.title, g.status, g.claimed_by ?? null]), [['Pull', 'claimed', 'Julie'], ['Livre', 'available', null]], 'cadeaux + achats révélés')
})

Deno.test('REST : ajout de cadeau — validation et lecture du lien', async () => {
  const calls: any[] = []
  const sb = fakeSb({}, { ensure_my_list: { id: 'L1', title: 't', share_token: 'x' } }, calls)
  let r = await call(req('POST', '/v1/gifts', {}), sb)
  assert(r.status === 400 && /title/.test(r.json.error.message), 'titre obligatoire')
  r = await call(req('POST', '/v1/gifts', { title: 'X', url: 'javascript:alert(1)' }), sb)
  eq(r.status, 400, 'lien javascript: refusé')
  r = await call(req('POST', '/v1/gifts', { title: 'X', price: -5 }), sb)
  eq(r.status, 400, 'prix négatif refusé')
  r = await call(req('POST', '/v1/gifts', { title: 'X', image_url: 'data:text/html,x' }), sb)
  eq(r.status, 400, 'image data: refusée')
  r = await call(req('POST', '/v1/gifts', { title: 'Pull', price: '89,90', details: 'L', fetch_preview: false }), sb)
  eq(r.status, 201, 'création')
  const ins = calls.find((c) => c[0] === 'items' && c[1] === 'insert')[2]
  eq([ins.list_id, ins.title, ins.price, ins.url], ['L1', 'Pull', 89.9, null], 'ligne insérée')
})

Deno.test('REST : achat — événement commun par défaut, sinon date exigée', async () => {
  const calls: any[] = []
  const sb = fakeSb({
    items: [{ id: '11111111-1111-1111-1111-111111111111', list_id: 'L2', title: 'Écharpe' }],
    wishlists: [{ owner_id: 'u-j' }],
    events: [{ id: 'E-old', name: 'Passé', event_date: '2020-01-01', event_members: [{ user_id: 'u-j' }] }, { id: 'E-noel', name: 'Noël', event_date: '2099-12-25', event_members: [{ user_id: 'u-j' }, { user_id: 'u-me' }] }, { id: 'E-autre', name: 'Autre', event_date: '2098-01-01', event_members: [{ user_id: 'u-x' }] }],
    item_claims: [{ item_id: 'i', reveal_on: '2099-12-25' }],
  }, { claim_item: null }, calls)
  const id = '11111111-1111-1111-1111-111111111111'
  let r = await call(req('POST', `/v1/gifts/${id}/claim`, {}), sb)
  eq(r.status, 200, 'claim ok')
  const c = calls.find((x) => x[1] === 'claim_item')[2]
  eq([c.p_event, c.p_reveal], ['E-noel', null], 'événement commun à venir choisi')
  const sb2 = fakeSb({ items: [{ id, list_id: 'L2', title: 'x' }], wishlists: [{ owner_id: 'u-j' }], events: [] })
  r = await call(req('POST', `/v1/gifts/${id}/claim`, {}), sb2)
  assert(r.status === 400 && /reveal_on/.test(r.json.error.message), 'sans événement commun → demande reveal_on')
  r = await call(req('POST', `/v1/gifts/${id}/claim`, { reveal_on: '31/12/2026' }), sb2)
  eq(r.status, 400, 'date mal formée refusée')
  r = await call(req('POST', `/v1/gifts/pas-un-uuid/claim`, {}), sb2)
  eq(r.status, 400, 'identifiant invalide')
})

Deno.test('REST : erreurs de la base renvoyées proprement', async () => {
  const sb = fakeSb({}, { run_draw: new Error('Seul l\'organisateur peut lancer le tirage') })
  const ev = '22222222-2222-2222-2222-222222222222'
  const r = await call(req('POST', `/v1/events/${ev}/draw`), sb)
  assert(r.status === 400 && /organisateur/.test(r.json.error.message), 'message de la base conservé')
})

Deno.test('REST : exclusions de tirage par prénom', async () => {
  const calls: any[] = []
  const sb = fakeSb({ event_members: [
    { user_id: 'u-me', in_draw: true, profiles: { display_name: 'Greg' } },
    { user_id: 'u-j', in_draw: true, profiles: { display_name: 'Julie' } },
    { user_id: 'u-l', in_draw: true, profiles: { display_name: 'Louis' } },
  ] }, {}, calls)
  const ev = '22222222-2222-2222-2222-222222222222'
  let r = await call(req('POST', `/v1/events/${ev}/exclusions`, { person_a: 'greg', person_b: 'JULIE' }), sb)
  eq(r.status, 200, 'exclusion ok')
  const rows = calls.find((x) => x[0] === 'draw_exclusions' && x[1] === 'upsert')[2]
  eq(rows.map((x: any) => [x.giver_id, x.receiver_id]), [['u-me', 'u-j'], ['u-j', 'u-me']], 'deux sens')
  r = await call(req('POST', `/v1/events/${ev}/exclusions`, { person_a: 'Greg', person_b: 'Greg' }), sb)
  eq(r.status, 400, 'même personne refusée')
  r = await call(req('POST', `/v1/events/${ev}/exclusions`, { person_a: 'Greg', person_b: 'Inconnu' }), sb)
  eq(r.status, 404, 'invité inconnu')
})

Deno.test('MCP : poignée de main, outils, appel, erreurs', async () => {
  const sb = fakeSb({ events: [{ id: 'E1', name: 'Noël', event_date: '2099-12-25', created_by: 'u-me', event_members: [{ count: 3 }], draw_done_at: null }] })
  let r = await call(req('POST', '/mcp', rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } })), sb)
  eq([r.status, r.json.result.protocolVersion, r.json.result.serverInfo.name, !!r.json.result.capabilities.tools], [200, '2025-03-26', 'nos-cadeaux', true], 'initialize')
  r = await call(req('POST', '/mcp', rpc('initialize', { protocolVersion: '1999-01-01' })), sb)
  eq(r.json.result.protocolVersion, '2025-06-18', 'version inconnue → plus récente')
  r = await call(req('POST', '/mcp', rpc('notifications/initialized', undefined, null)), sb)
  eq(r.status, 202, 'notification → 202')
  r = await call(req('POST', '/mcp', rpc('tools/list')), sb)
  const names = r.json.result.tools.map((t: any) => t.name)
  assert(names.length >= 20 && names.includes('run_draw') && names.includes('mark_gift_bought'), 'liste des outils')
  assert(r.json.result.tools.every((t: any) => t.inputSchema.type === 'object' && t.annotations && t.description), 'schémas + annotations')
  assert(r.json.result.tools.find((t: any) => t.name === 'run_draw').annotations.destructiveHint === true, 'run_draw marqué destructif')
  assert(r.json.result.tools.find((t: any) => t.name === 'get_my_list').annotations.readOnlyHint === true, 'get_my_list lecture seule')
  eq(new Set(names).size, names.length, 'noms uniques')
  r = await call(req('POST', '/mcp', rpc('tools/call', { name: 'list_events', arguments: {} })), sb)
  const out = JSON.parse(r.json.result.content[0].text)
  eq([r.json.result.isError, out[0].name, out[0].is_organizer, out[0].members_count], [false, 'Noël', true, 3], 'list_events')
  r = await call(req('POST', '/mcp', rpc('tools/call', { name: 'add_gift', arguments: {} })), sb)
  assert(r.json.result.isError === true && /title/.test(r.json.result.content[0].text), 'erreur métier → isError')
  r = await call(req('POST', '/mcp', rpc('tools/call', { name: 'nope', arguments: {} })), sb)
  eq(r.json.error.code, -32602, 'outil inconnu')
  r = await call(req('POST', '/mcp', rpc('truc/inconnu')), sb)
  eq(r.json.error.code, -32601, 'méthode inconnue')
  r = await call(req('POST', '/mcp', rpc('ping')), sb)
  eq(r.json.result, {}, 'ping')
  r = await call(req('POST', '/mcp', [rpc('ping', undefined, 1), rpc('notifications/initialized', undefined, null), rpc('ping', undefined, 2)]), sb)
  eq(r.json.length, 2, 'lot : 2 réponses (notification ignorée)')
})

Deno.test('MCP : authentification par en-tête ou par chemin, GET refusé', async () => {
  let r = await call(req('POST', '/mcp', rpc('ping'), null))
  eq(r.status, 401, 'sans jeton')
  r = await call(req('POST', `/mcp/t/${TOKEN}`, rpc('ping'), null))
  eq([r.status, r.json.result], [200, {}], 'jeton dans le chemin')
  r = await call(req('POST', `/mcp/t/${'ncg_' + 'c'.repeat(64)}`, rpc('ping'), null))
  eq(r.status, 401, 'mauvais jeton dans le chemin')
  r = await call(req('GET', '/mcp'))
  eq(r.status, 405, 'GET refusé')
  const bad = await handleRequest(new Request(`${BASE}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{pas du json' }), authOK(fakeSb({})), BASE)
  eq(bad.status, 400, 'JSON invalide')
})

Deno.test('CORS : pré-requête', async () => {
  const res = await handleRequest(new Request(`${BASE}/v1/me`, { method: 'OPTIONS' }), authOK(fakeSb({})), BASE)
  assert(res.status === 204 && res.headers.get('access-control-allow-origin') === '*', 'préflight')
})

Deno.test('noms : insensibles aux accents et à la casse', async () => {
  const sb = fakeSb({
    events: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Noël en famille', event_date: '2099-12-25', created_by: 'u-me', event_members: [{ count: 2 }], draw_done_at: null }],
    event_members: [
      { user_id: 'u-me', in_draw: true, profiles: { display_name: 'Hélène' } },
      { user_id: 'u-j', in_draw: true, profiles: { display_name: 'Zoé' } },
    ],
    wishlists: [{ id: 'L9', owner_id: 'u-j', title: 'Liste', items: [{ count: 1 }] }],
    profiles: [{ id: 'u-j', display_name: 'Zoé' }],
  }, {}, [])
  const ev = await call(req('GET', '/v1/events/NOEL'), sb)
  assert(ev.status !== 404 && ev.status !== 400, 'événement trouvé sans accent : ' + JSON.stringify(ev.json).slice(0, 120))
  const calls: any[] = []
  const sb2 = fakeSb({ event_members: [{ user_id: 'u-me', in_draw: true, profiles: { display_name: 'Hélène' } }, { user_id: 'u-j', in_draw: true, profiles: { display_name: 'Zoé' } }] }, {}, calls)
  const id = '33333333-3333-3333-3333-333333333333'
  const r = await call(req('POST', `/v1/events/${id}/exclusions`, { person_a: 'helene', person_b: 'ZOE' }), sb2)
  eq(r.status, 200, 'exclusion par prénoms sans accent')
  const l = await call(req('GET', '/v1/lists/zoe'), fakeSb({ wishlists: [{ id: 'L9', owner_id: 'u-j', title: 'Liste', items: [{ count: 1 }] }], profiles: [{ id: 'u-j', display_name: 'Zoé' }], items: [], item_claims: [] }))
  assert(l.status === 200 && l.json.data.list.owner === 'Zoé', 'liste trouvée par prénom sans accent')
})
