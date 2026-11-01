// Description OpenAPI 3.1 de l'API REST (servie sur /v1/openapi.json).
// deno-lint-ignore-file no-explicit-any

const idParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } })
const body = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } },
})
const okRes = (description: string) => ({ '200': { description, content: { 'application/json': { schema: { type: 'object', properties: { data: {} } } } } }, '401': { $ref: '#/components/responses/Unauthorized' }, '4XX': { $ref: '#/components/responses/Error' } })
const S = { type: 'string' }
const giftFields = {
  title: { type: 'string', maxLength: 200 }, url: { type: 'string', format: 'uri' }, details: { type: 'string', maxLength: 1000 },
  price: { type: 'number', description: 'Euros' }, image_url: { type: 'string', format: 'uri' },
}
const exclFields = { person_a: { ...S, description: 'Prénom ou identifiant' }, person_b: { ...S, description: 'Prénom ou identifiant' }, both_ways: { type: 'boolean', default: true } }

export function openapi(base: string): Record<string, unknown> {
  const op = (summary: string, extra: Record<string, unknown> = {}) => ({ summary, security: [{ bearer: [] }], responses: okRes('Succès'), ...extra })
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nos cadeaux — API',
      version: '1.0.0',
      description: 'Listes de cadeaux partagées, événements et tirage au sort. Authentification : jeton personnel (« ncg_… ») créé dans Mon profil. Vous agissez avec exactement vos droits : le propriétaire d\'une liste ne voit pas les achats avant leur date de remise, et le résultat du tirage n\'est visible que par la personne concernée.',
    },
    servers: [{ url: `${base}/v1` }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Jeton personnel ncg_…' } },
      responses: {
        Unauthorized: { description: 'Jeton manquant, invalide, expiré ou révoqué' },
        Error: { description: 'Erreur', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', properties: { status: { type: 'integer' }, message: S } } } } } } },
      },
    },
    paths: {
      '/me': { get: op('Mon profil') },
      '/list': { get: op('Ma liste (achats déjà révélés uniquement)') },
      '/lists': { get: op('Listes partagées avec moi') },
      '/lists/open': { post: op('Ouvrir un lien de partage', { requestBody: body({ link: { ...S, description: 'Lien de partage complet ou identifiant' } }, ['link']) }) },
      '/lists/{id}': { get: op('Voir une liste (identifiant ou prénom du propriétaire)', { parameters: [idParam('id', 'Identifiant de liste ou prénom')] }) },
      '/gifts': { post: op('Ajouter un cadeau à ma liste (image et prix lus sur le lien si absents)', { requestBody: body({ ...giftFields, fetch_preview: { type: 'boolean', default: true } }, ['title']), responses: { ...okRes('Cadeau créé'), '201': { description: 'Cadeau créé' } } }) },
      '/gifts/{id}': {
        patch: op('Modifier un de mes cadeaux', { parameters: [idParam('id', 'Identifiant du cadeau')], requestBody: body(giftFields) }),
        delete: op('Supprimer un de mes cadeaux', { parameters: [idParam('id', 'Identifiant du cadeau')] }),
      },
      '/gifts/{id}/refresh': { post: op('Relire le lien pour actualiser image et prix', { parameters: [idParam('id', 'Identifiant du cadeau')] }) },
      '/gifts/{id}/claim': {
        post: op('Marquer comme acheté (masqué au propriétaire jusqu\'à la date de remise)', { parameters: [idParam('id', 'Identifiant du cadeau')], requestBody: body({ event: { ...S, description: 'Nom ou identifiant de l\'événement (défaut : prochain événement commun)' }, reveal_on: { ...S, format: 'date' } }) }),
        delete: op('Annuler mon achat', { parameters: [idParam('id', 'Identifiant du cadeau')] }),
      },
      '/preview': { post: op('Lire une fiche produit (titre, image, prix)', { requestBody: body({ url: { type: 'string', format: 'uri' } }, ['url']) }) },
      '/events': {
        get: op('Mes événements'),
        post: op('Créer un événement', { requestBody: body({ name: S, event_date: { ...S, format: 'date' } }, ['name', 'event_date']), responses: { ...okRes('Créé'), '201': { description: 'Créé' } } }),
      },
      '/events/join': { post: op('Rejoindre un événement', { requestBody: body({ invite: { ...S, description: 'Lien d\'invitation ou code' } }, ['invite']) }) },
      '/events/{id}': {
        get: op('Détail d\'un événement', { parameters: [idParam('id', 'Identifiant ou nom')] }),
        patch: op('Modifier un événement (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')], requestBody: body({ name: S, event_date: { ...S, format: 'date' } }) }),
        delete: op('Supprimer un événement (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')] }),
      },
      '/events/{id}/exclusions': {
        post: op('Exclure deux personnes du tirage (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')], requestBody: body(exclFields, ['person_a', 'person_b']) }),
        delete: op('Retirer une exclusion (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')], requestBody: body(exclFields, ['person_a', 'person_b']) }),
      },
      '/events/{id}/participants': { patch: op('Inclure/exclure un invité du tirage (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')], requestBody: body({ person: S, in_draw: { type: 'boolean' } }, ['person', 'in_draw']) }) },
      '/events/{id}/draw': {
        post: op('Lancer ou refaire le tirage (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')] }),
        delete: op('Annuler le tirage (organisateur)', { parameters: [idParam('id', 'Identifiant ou nom')] }),
        get: op('Mon résultat du tirage (confidentiel)', { parameters: [idParam('id', 'Identifiant ou nom')] }),
      },
    },
  }
}
