// Routage HTTP : API REST (/v1/…), serveur MCP (/mcp) et documentation (OpenAPI).
// deno-lint-ignore-file no-explicit-any
import * as ops from './ops.ts'
import { ApiError, type Ctx } from './ops.ts'
import { handleMcpMessage } from './tools.ts'
import { openapi } from './openapi.ts'

export type Authenticate = (token: string) => Promise<Ctx>

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}
function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extra } })
}
const fail = (status: number, message: string, extra: Record<string, string> = {}) => json({ error: { status, message } }, status, extra)

type Handler = (c: Ctx, p: Record<string, string>, body: any) => Promise<unknown>
const ROUTES: [string, string, Handler, number?][] = [
  ['GET', '/v1/me', (c) => ops.me(c)],
  ['GET', '/v1/list', (c) => ops.myList(c)],
  ['GET', '/v1/lists', (c) => ops.sharedLists(c)],
  ['POST', '/v1/lists/open', (c, _p, b) => ops.openSharedList(c, b.link ?? b.token), 200],
  ['GET', '/v1/lists/:id', (c, p) => ops.getList(c, p.id)],
  ['POST', '/v1/gifts', (c, _p, b) => ops.addGift(c, b), 201],
  ['PATCH', '/v1/gifts/:id', (c, p, b) => ops.updateGift(c, p.id, b)],
  ['DELETE', '/v1/gifts/:id', (c, p) => ops.deleteGift(c, p.id)],
  ['POST', '/v1/gifts/:id/refresh', (c, p) => ops.refreshGift(c, p.id)],
  ['POST', '/v1/gifts/:id/claim', (c, p, b) => ops.claimGift(c, p.id, b)],
  ['DELETE', '/v1/gifts/:id/claim', (c, p) => ops.unclaimGift(c, p.id)],
  ['POST', '/v1/preview', (c, _p, b) => ops.previewLink(c, ops.httpUrl(b.url))],
  ['GET', '/v1/events', (c) => ops.listEvents(c)],
  ['POST', '/v1/events', (c, _p, b) => ops.createEvent(c, b), 201],
  ['POST', '/v1/events/join', (c, _p, b) => ops.joinEvent(c, b.invite ?? b.code)],
  ['GET', '/v1/events/:id', (c, p) => ops.getEvent(c, p.id)],
  ['PATCH', '/v1/events/:id', (c, p, b) => ops.updateEvent(c, p.id, b)],
  ['DELETE', '/v1/events/:id', (c, p) => ops.deleteEvent(c, p.id)],
  ['POST', '/v1/events/:id/exclusions', (c, p, b) => ops.addExclusion(c, p.id, b.person_a, b.person_b, b.both_ways !== false)],
  ['DELETE', '/v1/events/:id/exclusions', (c, p, b) => ops.removeExclusion(c, p.id, b.person_a, b.person_b, b.both_ways !== false)],
  ['PATCH', '/v1/events/:id/participants', (c, p, b) => ops.setInDraw(c, p.id, b.person, Boolean(b.in_draw))],
  ['POST', '/v1/events/:id/draw', (c, p) => ops.runDraw(c, p.id)],
  ['DELETE', '/v1/events/:id/draw', (c, p) => ops.resetDraw(c, p.id)],
  ['GET', '/v1/events/:id/draw', (c, p) => ops.myDraw(c, p.id)],
]

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/'), b = path.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}

async function readBody(req: Request): Promise<any> {
  if (req.method === 'GET') return {}
  const raw = await req.text()
  if (raw.length > 200_000) throw new ApiError(413, 'Requête trop volumineuse')
  if (!raw.trim()) return {}
  try { return JSON.parse(raw) } catch { throw new ApiError(400, 'Corps JSON invalide') }
}

export const normalizePath = (pathname: string) => (pathname.replace(/^(?:\/functions\/v1)?\/api(?=\/|$)/, '') || '/').replace(/\/+$/, '') || '/'

export async function handleRequest(req: Request, authenticate: Authenticate, publicBase: string): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const url = new URL(req.url)
  const path = normalizePath(url.pathname)
  const unauthorized = (msg: string) => fail(401, msg, { 'WWW-Authenticate': 'Bearer realm="nos-cadeaux"' })

  try {
    // ----- pages publiques -----
    if (path === '/' && req.method === 'GET') {
      return json({
        name: 'Nos cadeaux — API & serveur MCP',
        rest: `${publicBase}/v1`, openapi: `${publicBase}/v1/openapi.json`, mcp: `${publicBase}/mcp`,
        auth: 'Authorization: Bearer ncg_… (jeton créé dans « Mon profil » du site)',
      })
    }
    if (path === '/v1/openapi.json' && req.method === 'GET') return json(openapi(publicBase))

    // ----- serveur MCP -----
    const mcpToken = path === '/mcp' ? null : path.match(/^\/mcp\/t\/([^/]+)$/)?.[1]
    if (path === '/mcp' || mcpToken) {
      if (req.method !== 'POST') return fail(405, 'Ce serveur MCP n\'accepte que POST', { Allow: 'POST' })
      const token = mcpToken ?? req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!token) return unauthorized('Jeton manquant : envoyez Authorization: Bearer ncg_…')
      const c = await authenticate(token)
      let msg: any
      try { msg = JSON.parse(await req.text()) } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }, 400) }
      if (Array.isArray(msg)) {
        const out = (await Promise.all(msg.map((m) => handleMcpMessage(m, c)))).filter((r) => r !== null)
        return out.length ? json(out) : new Response(null, { status: 202, headers: CORS })
      }
      const out = await handleMcpMessage(msg, c)
      return out === null ? new Response(null, { status: 202, headers: CORS }) : json(out)
    }

    // ----- API REST -----
    if (path.startsWith('/v1/')) {
      let allowed: string[] = []
      for (const [method, pattern, handler, okStatus] of ROUTES) {
        const params = match(pattern, path)
        if (!params) continue
        allowed.push(method)
        if (method !== req.method) continue
        const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
        if (!token) return unauthorized('Jeton manquant : envoyez Authorization: Bearer ncg_…')
        const c = await authenticate(token)
        const body = await readBody(req)
        const data = await handler(c, params, body && typeof body === 'object' ? body : {})
        return json({ data }, okStatus ?? 200)
      }
      if (allowed.length) return fail(405, 'Méthode non autorisée', { Allow: allowed.join(', ') })
    }
    return fail(404, 'Route inconnue. Documentation : /v1/openapi.json')
  } catch (e) {
    if (e instanceof ApiError) return e.status === 401 ? unauthorized(e.message) : fail(e.status, e.message)
    console.error('erreur non gérée', e)
    return fail(500, 'Erreur interne du serveur')
  }
}
