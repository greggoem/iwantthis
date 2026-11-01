// Serveur MCP (transport « Streamable HTTP », réponses JSON) — outils de gestion des listes de cadeaux.
// deno-lint-ignore-file no-explicit-any
import * as ops from './ops.ts'
import { ApiError, type Ctx } from './ops.ts'

const str = (description: string) => ({ type: 'string', description })
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })
const READ = { readOnlyHint: true, openWorldHint: false }
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Record<string, unknown>
  run: (c: Ctx, a: any) => Promise<unknown>
}

const giftProps = {
  title: str('Nom du cadeau'),
  url: str('Lien vers la fiche produit (http/https)'),
  details: str('Taille, couleur, modèle…'),
  price: { type: 'number', description: 'Prix en euros' },
  image_url: str('Adresse d\'une image du produit'),
}

export const TOOLS: Tool[] = [
  { name: 'get_my_list', title: 'Ma liste de cadeaux', description: 'Affiche la liste de souhaits de l\'utilisateur, avec son lien de partage. Les achats faits par les proches restent masqués jusqu\'à leur date de remise : ne tentez jamais de les deviner.',
    inputSchema: obj({}), annotations: READ, run: (c) => ops.myList(c) },
  { name: 'add_gift', title: 'Ajouter un cadeau à ma liste', description: 'Ajoute un cadeau à la liste de l\'utilisateur. Si un lien est fourni sans image ni prix, le site tente de les lire automatiquement sur la fiche produit.',
    inputSchema: obj({ ...giftProps, fetch_preview: { type: 'boolean', description: 'false pour ne pas lire la fiche produit (défaut : true)' } }, ['title']), annotations: WRITE, run: (c, a) => ops.addGift(c, a) },
  { name: 'update_gift', title: 'Modifier un cadeau', description: 'Modifie un cadeau de ma liste. Mettre un champ à null l\'efface.',
    inputSchema: obj({ gift_id: str('Identifiant du cadeau'), ...giftProps }, ['gift_id']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => { const { gift_id, ...rest } = a; return ops.updateGift(c, gift_id, rest) } },
  { name: 'delete_gift', title: 'Supprimer un cadeau', description: 'Supprime définitivement un cadeau de ma liste.',
    inputSchema: obj({ gift_id: str('Identifiant du cadeau') }, ['gift_id']), annotations: DESTRUCTIVE, run: (c, a) => ops.deleteGift(c, a.gift_id) },
  { name: 'refresh_gift_from_link', title: 'Actualiser image et prix', description: 'Relit le lien d\'un de mes cadeaux pour mettre à jour l\'image et le prix. Certains magasins bloquent la lecture automatique.',
    inputSchema: obj({ gift_id: str('Identifiant du cadeau') }, ['gift_id']), annotations: { ...WRITE, idempotentHint: true, openWorldHint: true }, run: (c, a) => ops.refreshGift(c, a.gift_id) },
  { name: 'preview_link', title: 'Lire une fiche produit', description: 'Lit une page produit et renvoie titre, image et prix s\'ils sont trouvés (sans rien enregistrer).',
    inputSchema: obj({ url: str('Lien de la fiche produit') }, ['url']), annotations: { ...READ, openWorldHint: true }, run: (c, a) => ops.previewLink(c, ops.httpUrl(a.url)) },

  { name: 'list_shared_lists', title: 'Listes de mes proches', description: 'Liste les listes de cadeaux que des proches ont partagées avec l\'utilisateur (lien ou événement commun).',
    inputSchema: obj({}), annotations: READ, run: (c) => ops.sharedLists(c) },
  { name: 'get_list', title: 'Voir la liste d\'un proche', description: 'Affiche les cadeaux d\'une liste, avec ceux déjà achetés par d\'autres invités (et par qui). Si la liste est celle de l\'utilisateur, les achats masqués restent masqués.',
    inputSchema: obj({ list: str('Identifiant de la liste OU prénom du propriétaire') }, ['list']), annotations: READ, run: (c, a) => ops.getList(c, a.list) },
  { name: 'open_shared_list', title: 'Ouvrir un lien de partage', description: 'Donne accès à une liste à partir d\'un lien de partage reçu (https://…/#/l/…).',
    inputSchema: obj({ link: str('Lien de partage complet ou identifiant de partage') }, ['link']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => ops.openSharedList(c, a.link) },
  { name: 'mark_gift_bought', title: 'Marquer un cadeau comme acheté', description: 'Indique que l\'utilisateur a acheté un cadeau de la liste d\'un proche. Les autres invités le voient tout de suite ; le propriétaire de la liste ne le verra qu\'à la date de remise (celle de l\'événement commun, ou reveal_on).',
    inputSchema: obj({ gift_id: str('Identifiant du cadeau'), event: str('Nom ou identifiant de l\'événement (facultatif : le prochain événement commun est utilisé par défaut)'), reveal_on: str('Date de remise AAAA-MM-JJ, si aucun événement commun') }, ['gift_id']), annotations: WRITE, run: (c, a) => ops.claimGift(c, a.gift_id, a) },
  { name: 'unmark_gift_bought', title: 'Annuler mon achat', description: 'Annule un achat que l\'utilisateur avait indiqué sur un cadeau.',
    inputSchema: obj({ gift_id: str('Identifiant du cadeau') }, ['gift_id']), annotations: { ...DESTRUCTIVE, destructiveHint: false }, run: (c, a) => ops.unclaimGift(c, a.gift_id) },

  { name: 'list_events', title: 'Mes événements', description: 'Liste les événements (Noël, anniversaire…) auxquels l\'utilisateur participe.',
    inputSchema: obj({}), annotations: READ, run: (c) => ops.listEvents(c) },
  { name: 'get_event', title: 'Détail d\'un événement', description: 'Invités, état du tirage au sort, résultat personnel du tirage et lien d\'invitation d\'un événement. L\'organisateur voit aussi les exclusions (jamais le résultat des autres).',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement') }, ['event']), annotations: READ, run: (c, a) => ops.getEvent(c, a.event) },
  { name: 'create_event', title: 'Créer un événement', description: 'Crée un événement ; l\'utilisateur en devient l\'organisateur. Renvoie le lien d\'invitation à envoyer aux invités.',
    inputSchema: obj({ name: str('Nom de l\'événement'), event_date: str('Date de remise des cadeaux, AAAA-MM-JJ') }, ['name', 'event_date']), annotations: WRITE, run: (c, a) => ops.createEvent(c, a) },
  { name: 'update_event', title: 'Modifier un événement', description: 'Change le nom ou la date d\'un événement (organisateur uniquement). La date de révélation des achats suit.',
    inputSchema: obj({ event: str('Nom ou identifiant'), name: str('Nouveau nom'), event_date: str('Nouvelle date AAAA-MM-JJ') }, ['event']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => { const { event, ...rest } = a; return ops.updateEvent(c, event, rest) } },
  { name: 'delete_event', title: 'Supprimer un événement', description: 'Supprime un événement pour tous ses invités (organisateur uniquement). Irréversible.',
    inputSchema: obj({ event: str('Nom ou identifiant') }, ['event']), annotations: DESTRUCTIVE, run: (c, a) => ops.deleteEvent(c, a.event) },
  { name: 'join_event', title: 'Rejoindre un événement', description: 'Rejoint un événement à partir d\'un lien ou code d\'invitation.',
    inputSchema: obj({ invite: str('Lien d\'invitation (https://…/#/e/…) ou code') }, ['invite']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => ops.joinEvent(c, a.invite) },

  { name: 'add_draw_exclusion', title: 'Exclure deux personnes du tirage', description: 'Empêche que deux invités se tirent l\'un l\'autre (organisateur uniquement), par exemple un couple.',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement'), person_a: str('Prénom ou identifiant'), person_b: str('Prénom ou identifiant'), both_ways: { type: 'boolean', description: 'true (défaut) : A ne tire pas B ET B ne tire pas A' } }, ['event', 'person_a', 'person_b']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => ops.addExclusion(c, a.event, a.person_a, a.person_b, a.both_ways !== false) },
  { name: 'remove_draw_exclusion', title: 'Retirer une exclusion du tirage', description: 'Supprime une exclusion entre deux invités (organisateur uniquement).',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement'), person_a: str('Prénom ou identifiant'), person_b: str('Prénom ou identifiant'), both_ways: { type: 'boolean', description: 'true (défaut) : retire les deux sens' } }, ['event', 'person_a', 'person_b']), annotations: DESTRUCTIVE, run: (c, a) => ops.removeExclusion(c, a.event, a.person_a, a.person_b, a.both_ways !== false) },
  { name: 'set_draw_participation', title: 'Inclure / exclure un invité du tirage', description: 'Indique si un invité participe au tirage au sort (organisateur uniquement).',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement'), person: str('Prénom ou identifiant'), in_draw: { type: 'boolean', description: 'true : participe ; false : ne participe pas' } }, ['event', 'person', 'in_draw']), annotations: { ...WRITE, idempotentHint: true }, run: (c, a) => ops.setInDraw(c, a.event, a.person, Boolean(a.in_draw)) },
  { name: 'run_draw', title: 'Lancer le tirage au sort', description: 'Lance (ou refait, en remplaçant le précédent) le tirage au sort d\'un événement (organisateur uniquement). Le résultat est secret : chacun, organisateur compris, ne voit que la personne à qui il offre. Ne devinez ni ne révélez le résultat des autres.',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement') }, ['event']), annotations: DESTRUCTIVE, run: (c, a) => ops.runDraw(c, a.event) },
  { name: 'reset_draw', title: 'Annuler le tirage au sort', description: 'Efface le tirage au sort d\'un événement (organisateur uniquement).',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement') }, ['event']), annotations: DESTRUCTIVE, run: (c, a) => ops.resetDraw(c, a.event) },
  { name: 'get_my_draw_result', title: 'Mon résultat du tirage', description: 'Indique à qui l\'utilisateur doit offrir un cadeau dans cet événement. Information confidentielle : ne la partager qu\'avec l\'utilisateur.',
    inputSchema: obj({ event: str('Nom ou identifiant de l\'événement') }, ['event']), annotations: READ, run: (c, a) => ops.myDraw(c, a.event) },
]

const INSTRUCTIONS = [
  'Serveur de listes de cadeaux partagées (événements, achats secrets, tirage au sort).',
  'Règles de confidentialité : le propriétaire d\'une liste ne doit pas connaître les achats de ses proches avant la date de remise,',
  'et personne ne doit connaître le résultat du tirage des autres. Le serveur applique déjà ces règles : ne cherchez pas à les contourner ni à les deviner.',
  'Les identifiants (gift_id, list, event) viennent des outils get_my_list, get_list, list_events… ; les prénoms sont acceptés pour les listes, événements et invités.',
].join(' ')

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Traite un message JSON-RPC ; renvoie null pour une notification (pas de réponse). */
export async function handleMcpMessage(msg: any, c: Ctx): Promise<unknown | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Requête invalide')
  const isNotification = msg.id === undefined || msg.id === null
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result })

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nos-cadeaux', title: 'Nos cadeaux', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping': return isNotification ? null : reply({})
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) })
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name)
      if (!tool) return rpcError(msg.id, -32602, `Outil inconnu : ${msg.params?.name}`)
      const args = msg.params?.arguments ?? {}
      if (typeof args !== 'object' || Array.isArray(args)) return rpcError(msg.id, -32602, 'arguments doit être un objet')
      try {
        const out = await tool.run(c, args)
        return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false })
      } catch (e) {
        if (e instanceof ApiError) return reply({ content: [{ type: 'text', text: e.message }], isError: true })
        console.error('tool error', tool.name, e)
        return reply({ content: [{ type: 'text', text: 'Erreur interne du serveur' }], isError: true })
      }
    }
    default:
      if (msg.method.startsWith('notifications/')) return null
      if (isNotification) return null
      return rpcError(msg.id, -32601, `Méthode inconnue : ${msg.method}`)
  }
}
