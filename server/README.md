# Serveur Node.js d'I Want This

Sert le site construit (`dist/`) et personnalise l'aperçu des liens partagés
(WhatsApp, Messenger, e-mail…) :

| Lien partagé | Aperçu |
|---|---|
| `https://iwantthis.gift/?e=CODE` (ou `/e/CODE`) | 💌 Invitation : nom de l'événement, date, image de l'événement |
| `https://iwantthis.gift/?l=TOKEN` (ou `/l/TOKEN`) | 🎁 La liste d'envies de <prénom> |

Les informations viennent de la fonction Supabase `share_preview` (nom, date et image
de l'événement, ou prénom du propriétaire de la liste — rien d'autre), seulement pour
qui possède le code du lien. Aucune dépendance npm : Node 18 ou plus suffit.

## Déploiement (ordiman)

```bash
npm ci
npm run build      # produit dist/
npm start          # = node server/server.mjs
```

Variables facultatives : `PORT` (défaut 3000), `HOST` (adresse d'écoute, par ex. `172.17.0.1` pour n'écouter que sur le pont Docker derrière Caddy ; défaut : toutes), `STATIC_DIR` (défaut `dist/`),
`SITE_URL` (défaut `https://iwantthis.gift/`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`
(défauts : le projet de production ; la clé anon est publique).

À chaque nouvelle version : `git pull`, `npm ci`, `npm run build`, puis redémarrer l'application.
