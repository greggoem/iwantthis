# Extension « I Want This » (Chrome, Edge, Firefox, Safari)

Un clic sur l'icône, sur une page produit : l'extension lit le titre, l'image et le prix **dans votre navigateur**
(donc même sur les magasins qui bloquent la lecture automatique), puis ouvre le site avec le formulaire d'ajout
déjà rempli, où l'on choisit aussi le groupe. Elle ne voit ni votre mot de passe ni votre compte : la connexion se fait sur le site.

Permissions : `activeTab` (lire la page seulement quand vous cliquez), `scripting`, `storage` (mémoriser l'adresse du site).

## Installer à la main (en attendant les stores)

- **Chrome / Edge / Brave** : `chrome://extensions` (ou `edge://extensions`) → activer le *Mode développeur* →
  *Charger l'extension non empaquetée* → choisir ce dossier (ou l'archive décompressée).
- **Firefox** : `about:debugging#/runtime/this-firefox` → *Charger un module complémentaire temporaire…* → choisir `manifest.json`.
  (Temporaire : à refaire à chaque redémarrage, tant que l'extension n'est pas signée par Mozilla — voir « Publier ».)
- **Safari (Mac)** : `xcrun safari-web-extension-converter extension/ --app-name "I Want This"` génère un projet Xcode ;
  le lancer, puis Safari → Réglages → Extensions. Un compte développeur Apple est nécessaire pour la distribuer.

## Régler l'adresse du site

Clic droit sur l'icône → *Options* : par défaut `https://greggoem.github.io/liste-cadeaux/`.

## Publier sur les stores

1. Archive : `cd extension && zip -r ../public/extension/iwt-extension.zip . -x README.md 'store/*'` (c'est le fichier proposé dans « Mon profil »).
2. Chrome Web Store (5 $ une fois), Microsoft Edge Add-ons (gratuit), Firefox Add-ons (gratuit, signature incluse), App Store (compte Apple Developer).
3. Une fois publiée, collez l'adresse de la fiche dans `src/lib/extensions.ts` : le bouton « Installer » apparaît dans « Mon profil ».

Le dossier `store/` contient tout ce qu'il faut pour remplir les fiches (textes, justification des permissions, captures 1280×800, vignette) : voir `store/LISTING.md`.
