# I Want This (IWT) — listes de cadeaux partagées

> Nom provisoire : il se change avec la variable `VITE_APP_NAME` (et le logo dans `src/components/Logo.tsx`).

Site web (ordinateur et téléphone) pour :

- **créer un compte** (e-mail + mot de passe, ou Google) ;
- **tenir sa liste de souhaits** : cadeau, lien vers le site, détails (taille, couleur…), prix indicatif ;
- **partager sa liste par un lien** ;
- **indiquer « j'ai acheté ce cadeau »** : tous les autres invités le voient (plus de doublons), **mais pas le propriétaire de la liste, avant la date de remise** ;
- **créer des événements** (date + invités via un lien d'invitation) ;
- **tirage au sort** (« Secret Santa ») avec **exclusions** (ex. les couples ne se tirent pas) ;
- **liens de parrainage / affiliation ajoutés automatiquement** aux liens des magasins partenaires.

Technique : React + Vite (site statique) et **Supabase** (comptes + base de données). Aucune machine à gérer.

---

## 1. Créer la base Supabase (≈ 10 min)

1. Créez un compte gratuit sur <https://supabase.com> puis **New project** (région *West EU – Paris* ou *Frankfurt*).
2. Menu **SQL Editor → New query**, collez **tout** le contenu de `supabase/schema.sql`, cliquez **Run**.
   Puis, dans une nouvelle requête, collez `supabase/api_tokens.sql` (jetons personnels pour l'API / MCP).
3. Menu **Authentication → Providers** :
   - **Email** : activé par défaut. Pour un usage familial, vous pouvez désactiver *Confirm email* (inscription immédiate) ou le laisser actif (lien de confirmation par e-mail).
   - **Google** (optionnel) : créez des identifiants OAuth dans la [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (*ID client OAuth → Application Web*), avec comme *URI de redirection autorisé* l'adresse indiquée par Supabase (`https://<votre-projet>.supabase.co/auth/v1/callback`), puis collez *Client ID* et *Client secret* dans Supabase.
4. Menu **Authentication → URL Configuration** :
   - **Site URL** : l'adresse finale du site (ex. `https://greggoem.github.io/liste-cadeaux/`).
   - **Redirect URLs** : ajoutez la même adresse, et `http://localhost:5173/` pour tester chez vous.
5. Menu **Project Settings → API** : notez l'**URL du projet** et la clé **anon public**.

> La clé *anon* est faite pour être publique. La protection des données repose sur les règles de sécurité de la base (déjà dans `schema.sql`) : même en appelant l'API à la main, le propriétaire d'une liste **ne peut pas** lire les achats avant la date.

## 2. Tester chez vous

```bash
cp .env.example .env     # puis renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173
```

## 3. Mettre en ligne (GitHub Pages, comme FrigoScan)

1. Créez un dépôt GitHub et poussez ce dossier sur la branche `main`.
2. Dépôt → **Settings → Pages → Source : GitHub Actions**.
3. Dépôt → **Settings → Secrets and variables → Actions → Secrets** : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
   (Facultatif, onglet *Variables* : `VITE_APP_NAME` pour changer le nom affiché.)
4. Chaque `git push` reconstruit et publie le site (`.github/workflows/deploy.yml`).

Vercel ou Netlify fonctionnent aussi : commande `npm run build`, dossier `dist`, mêmes variables d'environnement.

## 3 bis. E-mails envoyés depuis *votre* adresse (confirmation, mot de passe oublié)

Par défaut, Supabase envoie ces e-mails depuis sa propre adresse, en anglais, et en nombre très limité. Pour qu'ils partent de votre site :

1. **Expéditeur** : Supabase → *Authentication → Emails → SMTP Settings* → *Enable custom SMTP*, avec un service d'envoi (Resend, Brevo… offres gratuites) et une adresse d'un domaine que vous possédez (ex. `noreply@votredomaine.be`, après vérification DNS chez le service d'envoi).
2. **Textes** : Supabase → *Authentication → Emails → Templates* : collez le contenu de `supabase/emails/confirmation-inscription.html` (« Confirm sign up ») et `supabase/emails/mot-de-passe-oublie.html` (« Reset password »), avec l'objet indiqué en commentaire en haut de chaque fichier.
3. **Site URL** : dans *Authentication → URL Configuration*, mettez l'adresse du site **avec la barre finale** (ex. `https://greggoem.github.io/liste-cadeaux/`). Les liens des e-mails pointent alors directement vers votre site (page `#/confirm`) et non vers supabase.co.

Option la plus simple : désactiver *Confirm email* (*Authentication → Providers → Email*). L'inscription est alors immédiate, sans e-mail (seul « mot de passe oublié » en envoie encore un).

## 4. Comment ça se passe pour les utilisateurs

| Étape | Action |
|---|---|
| 1 | Chacun crée son compte et remplit **Ma liste**. |
| 2 | **Partager ma liste** : lien à envoyer (WhatsApp, e-mail…). La personne se connecte et voit la liste. |
| 3 | Sur la liste d'un proche, **« J'ai acheté ce cadeau »** : on choisit l'occasion (événement commun) ou une autre date de remise. Les autres invités voient « Déjà acheté par X ». |
| 4 | Le propriétaire ne voit rien jusqu'à la date de remise ; ensuite il voit « 🎁 Offert par X ». Si la date de l'événement change, la date de révélation suit. |
| 5 | **Événements** : créer (nom + date), envoyer le lien d'invitation. Les invités voient les listes des uns des autres. |
| 6 | **Tirage au sort** (organisateur) : ajouter les exclusions, puis *Lancer le tirage*. Chacun découvre uniquement la personne à qui il offre — **y compris l'organisateur** (le tirage est calculé côté serveur). |

## 5. Liens de parrainage (affiliation)

Ils sont ajoutés **à l'affichage** (le lien d'origine est conservé tel quel dans la base), pour tous les cadeaux, anciens et nouveaux. Ils se gèrent sans toucher au code :
**Supabase → Table Editor → `affiliate_programs`**.

| Colonne | Rôle |
|---|---|
| `domain` | Magasin concerné, ex. `amazon.com.be` (les sous-domaines comptent aussi). |
| `kind` = `param` | On ajoute un paramètre au lien : `param_name` / `param_value` (ex. `tag` = `montag-21` pour Amazon). |
| `kind` = `template` | Pour les réseaux d'affiliation à redirection (Awin, Tradedoubler, Effiliation…) : `template` contient `{url}`, remplacé par l'adresse du produit encodée. Ex. `https://www.awin1.com/cread.php?awinmid=12345&awinaffid=67890&ued={url}` |
| `enabled` | Cochez pour activer. Les lignes décochées sont ignorées. |

Deux lignes Amazon (BE et FR) sont déjà là, **désactivées** avec `VOTRE-TAG-21` : remplacez par votre identifiant partenaire puis activez. Ajoutez une ligne par magasin.

À savoir :
- Il faut d'abord **être accepté** dans le programme du magasin (Amazon Partenaires, Awin, etc.), qui fournit l'identifiant.
- **Transparence** : le site affiche déjà « liens partenaires » en bas de page et une pastille *partenaire* sur chaque lien concerné (obligatoire en Europe). Pour Amazon, la mention « En tant que Partenaire Amazon… » s'ajoute automatiquement dès qu'une ligne Amazon est activée.
- Les liens raccourcis (`amzn.to`, `bit.ly`…) ne peuvent pas être transformés : demandez à vos proches de coller l'adresse complète du produit.
- Les programmes ont leurs propres règles (ex. Amazon interdit les liens d'affiliation dans les e-mails). Relisez-les.

## 5 bis. Image et prix automatiques (fonction `link-preview`)

Quand on colle un lien, la fonction Supabase `supabase/functions/link-preview` lit la fiche produit (métadonnées Open Graph, JSON-LD, balises Amazon) et renvoie titre, image et prix. Elle est réservée aux utilisateurs connectés et refuse les adresses internes. Pour la redéployer : Supabase → *Edge Functions*, ou `supabase functions deploy link-preview`.

Certains magasins (Amazon, Fnac, Zalando, Coolblue, Bol.com…) bloquent souvent les serveurs. Dans ce cas, l'écran *Ma liste* propose un **raccourci à glisser dans la barre de favoris** : il lit la page dans le navigateur de la personne (donc jamais bloqué) et pré-remplit le formulaire.

## 5 ter. API REST et serveur MCP (piloter ses listes depuis Claude)

La fonction Supabase `supabase/functions/api` expose **la même chose que le site** de deux façons :

- une **API REST** (`/v1/…`, description OpenAPI sur `/v1/openapi.json`) ;
- un **serveur MCP** (`/mcp`) avec 23 outils : ma liste, listes des proches, ajout/modification de cadeaux, « j'ai acheté », événements, exclusions, tirage au sort…

Adresse de base : `https://<projet>.supabase.co/functions/v1/api`

**Connexion** : sur le site, *Mon profil → Accès API & Claude → Créer un jeton*. Le jeton (`ncg_…`) n'est affiché qu'une fois ; seule son empreinte est stockée. Il expire au bout d'un an, 10 jetons maximum, révocable à tout moment (effet immédiat).

| Client | Configuration |
|---|---|
| Claude Code | `claude mcp add --transport http nos-cadeaux <base>/mcp --header "Authorization: Bearer ncg_…"` |
| claude.ai / applications qui n'acceptent qu'une adresse | `<base>/mcp/t/ncg_…` (le jeton est dans l'adresse : ne la partagez pas) |
| Claude Desktop | `npx -y mcp-remote <base>/mcp --header "Authorization: Bearer ncg_…"` dans `claude_desktop_config.json` |
| REST | `curl -H "Authorization: Bearer ncg_…" <base>/v1/list` |

**Sécurité** : le serveur ouvre une vraie session au nom de l'utilisateur, donc toutes les règles de la base s'appliquent (le propriétaire d'une liste ne voit pas les achats avant la date ; le résultat du tirage n'est visible que par la personne concernée). La clé « service » ne sert qu'à vérifier le jeton. Les instructions du serveur MCP rappellent aussi à l'IA de ne pas deviner ces informations.

**Tests** : `cd supabase/functions/api && deno test --no-prompt api.test.ts` (client Supabase simulé). **Déploiement** : `supabase functions deploy api --no-verify-jwt` et `supabase functions deploy link-preview` (ou via le tableau de bord / l'outil MCP Supabase).

## 5 quater. Se désinscrire

*Mon profil → Se désinscrire → Supprimer mon compte* (confirmation en tapant SUPPRIMER) appelle la fonction SQL `delete_my_account()` (`supabase/delete_account.sql`) : le compte, le profil, la liste, les cadeaux, les jetons API et les achats de la personne sont supprimés ; ses achats sont annulés (les cadeaux redeviennent disponibles) ; un événement qu'elle organisait est transmis au plus ancien autre invité, ou supprimé s'il est seul.

## 5 quinquies. Inviter par nom + e-mail

Dans un événement, l'organisateur peut **ajouter un invité avec son nom et son e-mail** (`supabase/event_invites.sql`). Le site n'envoie pas d'e-mail lui-même : le bouton « E-mail » ouvre votre messagerie avec un message prêt (lien d'invitation inclus), et « Copier » met ce message dans le presse-papiers (WhatsApp, SMS…). Dès que la personne se connecte avec cette adresse, l'événement lui apparaît dans **Événements → Invitations** et elle choisit de le rejoindre ou de refuser. Si elle rejoint par le lien d'invitation, elle disparaît toute seule des « En attente ». Seuls les invités qui ont rejoint participent au tirage au sort.

## 5 sexies. Groupes de cadeaux (plusieurs liens pour une même envie)

Bouton **Groupe** au-dessus de la liste (`supabase/item_groups.sql`, à exécuter une fois dans le SQL Editor). Un groupe est une seule ligne dépliable ; à l'intérieur, **un élément par objet**, nommé d'après le produit (et non le magasin). Collez les liens, un par ligne (ou « Nom — lien » pour imposer un nom) : le nom, l'image et le prix sont lus sur chaque page, avec repli sur le nom lu dans l'adresse.

- **Plusieurs possibles** : une collection ; chaque élément s'achète séparément, le groupe affiche « 2 sur 12 achetés ».
- **Un seul à choisir** : plusieurs options pour la même envie ; dès qu'une est achetée (vérifié côté serveur, même si deux personnes cliquent en même temps), les autres passent en « Plus nécessaire ».

Un groupe ne s'achète pas lui-même. Un proche peut copier un élément ou tout le groupe dans sa propre liste. Les achats restent cachés au propriétaire jusqu'à la date de remise.

## 5 septies. Liste, galerie et tri

Au-dessus de chaque liste (la vôtre comme celles de vos proches), deux boutons permettent de passer de la **liste** à la **galerie** (grandes images en cartes ; un groupe devient une section pleine largeur). En mode liste, **survoler la miniature avec la souris affiche la grande image**. On trie en cliquant sur les titres de colonnes (Cadeau, Prix, Où l'acheter, Statut) : un clic croissant, un deuxième décroissant, un troisième revient à l'ordre d'ajout ; en galerie et sur téléphone, un menu « Trier par » fait la même chose. Les envies sans prix ou sans lien restent en bas. Un groupe est trié d'après son élément le moins cher (ou son premier magasin), et ses éléments suivent le même tri. Le choix est mémorisé sur l'appareil (aucune donnée côté serveur).

## 6. Limites connues / pistes

- Les invités doivent avoir un compte (c'est ce qui permet de masquer les achats au propriétaire).
- Le plan gratuit Supabase met le projet en pause après ~1 semaine sans activité ; il se réactive en un clic.
- Idées pour la suite : récupération automatique du titre/de l'image depuis le lien, plusieurs listes par personne, achat groupé à plusieurs, notifications par e-mail, mode PWA hors-ligne.

## Structure

```
supabase/schema.sql      base de données, sécurité, tirage, parrainage
supabase/api_tokens.sql  jetons personnels (API / MCP)
supabase/delete_account.sql  désinscription (suppression de son compte)
supabase/event_invites.sql   invitations par nom + e-mail
supabase/item_groups.sql     groupes de cadeaux (plusieurs liens, « un seul à choisir »)
supabase/functions/      link-preview (image + prix) et api (REST + MCP)
src/lib/                 connexion Supabase, liens de parrainage, authentification
src/pages/               Ma liste, liste d'un proche, événements, tirage, connexion
.github/workflows/       publication automatique sur GitHub Pages
```
