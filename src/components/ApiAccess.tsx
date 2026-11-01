import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, errMsg, apiBase } from '../lib/supabase'
import { formatDateShort } from '../lib/format'
import { CopyField, Notice } from './ui'
import { useConfirm } from './Confirm'

interface Tok { id: string; name: string; token_prefix: string; created_at: string; expires_at: string; last_used_at: string | null }

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div className="stack">
      <strong className="small">{title}</strong>
      <CopyField value={text} />
    </div>
  )
}

/** Gestion des jetons personnels pour l'API REST et le serveur MCP */
export default function ApiAccess() {
  const [tokens, setTokens] = useState<Tok[]>([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const confirm = useConfirm()

  const load = useCallback(async () => {
    const { data } = await supabase.from('api_tokens')
      .select('id,name,token_prefix,created_at,expires_at,last_used_at').order('created_at', { ascending: false })
    setTokens((data as Tok[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setFresh(null)
    const { data, error } = await supabase.rpc('create_api_token', { p_name: name })
    if (error) { setErr(errMsg(error)); return }
    setFresh(data as string); setName(''); load()
  }
  const revoke = async (t: Tok) => {
    if (!(await confirm({ title: 'Révoquer ce jeton ?', message: `Le jeton « ${t.name} » sera révoqué : toute application qui l'utilise cessera de fonctionner.`, confirmLabel: 'Révoquer', danger: true }))) return
    const { error } = await supabase.from('api_tokens').delete().eq('id', t.id)
    if (error) setErr(errMsg(error)); else { setFresh(null); load() }
  }

  const base = apiBase()
  const tk = fresh ?? 'ncg_…'

  return (
    <section className="card stack mt">
      <h2>Accès API &amp; Claude (MCP)</h2>
      <p className="small muted">
        Pilotez vos listes depuis Claude ou depuis vos propres outils. Un jeton agit <strong>avec exactement vos droits</strong> : les achats
        restent masqués au propriétaire d'une liste, et personne ne voit le tirage des autres. Traitez-le comme un mot de passe.
      </p>
      <Notice>{err}</Notice>

      <form className="row" onSubmit={create}>
        <input required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Nom du jeton (ex. Claude Code, Zapier…)" />
        <button className="btn btn-primary">Créer un jeton</button>
      </form>

      {fresh && (
        <div className="reveal stack" style={{ textAlign: 'left' }}>
          <strong>Votre jeton — copiez-le maintenant, il ne sera plus jamais affiché :</strong>
          <CopyField value={fresh} />
          <Snippet title="Claude Code (ligne de commande)" text={`claude mcp add --transport http nos-cadeaux ${base}/mcp --header "Authorization: Bearer ${tk}"`} />
          <Snippet title="claude.ai ou toute application qui n'accepte qu'une adresse (le jeton est dans l'adresse : ne la partagez pas)" text={`${base}/mcp/t/${tk}`} />
          <Snippet title="Claude Desktop (fichier de configuration, via mcp-remote)" text={JSON.stringify({ mcpServers: { 'nos-cadeaux': { command: 'npx', args: ['-y', 'mcp-remote', `${base}/mcp`, '--header', `Authorization: Bearer ${tk}`] } } })} />
          <Snippet title="API REST (exemple)" text={`curl -H "Authorization: Bearer ${tk}" ${base}/v1/list`} />
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="plain">
          {tokens.map(t => (
            <li key={t.id} className="row between wrap gap">
              <span>
                <strong>{t.name}</strong> <code>{t.token_prefix}…</code>
                <span className="small muted"> · créé le {formatDateShort(t.created_at)} · expire le {formatDateShort(t.expires_at)} · {t.last_used_at ? `utilisé le ${formatDateShort(t.last_used_at)}` : 'jamais utilisé'}</span>
              </span>
              <button className="btn btn-ghost btn-sm danger" onClick={() => revoke(t)}>Révoquer</button>
            </li>
          ))}
        </ul>
      )}

      <p className="small muted">
        Documentation de l'API : <a href={`${base}/v1/openapi.json`} target="_blank" rel="noopener noreferrer">OpenAPI (JSON)</a>.
        Le serveur MCP expose 23 outils : ma liste, listes des proches, achats, événements, tirage au sort.
      </p>
    </section>
  )
}
