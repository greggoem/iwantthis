# 🎁 Nos cadeaux — listes de cadeaux partagées

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

## 6. Limites connues / pistes

- Les invités doivent avoir un compte (c'est ce qui permet de masquer les achats au propriétaire).
- Le plan gratuit Supabase met le projet en pause après ~1 semaine sans activité ; il se réactive en un clic.
- Idées pour la suite : récupération automatique du titre/de l'image depuis le lien, plusieurs listes par personne, achat groupé à plusieurs, notifications par e-mail, mode PWA hors-ligne.

## Structure

```
supabase/schema.sql      base de données, sécurité, tirage, parrainage
src/lib/                 connexion Supabase, liens de parrainage, authentification
src/pages/               Ma liste, liste d'un proche, événements, tirage, connexion
.github/workflows/       publication automatique sur GitHub Pages
```
