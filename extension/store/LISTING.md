# Dossier de dépôt — extension « I Want This »

Archives à envoyer : `public/extension/iwt-extension.zip` (Chrome et Edge) et `public/extension/iwt-extension-firefox.zip` (Firefox)
(régénérer : `extension/build.sh`)

Page de confidentialité (à coller dans le champ « Politique de confidentialité ») :
`https://greggoem.github.io/liste-cadeaux/extension/privacy.html`

Images : `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` (1280×800) et `promo-tile-440x280.png` (vignette).
Icône 128 px : `icons/icon-128.png`.

---

## Nom
I Want This

## Résumé (≤ 132 caractères, Chrome)
Ajoutez en un clic le produit affiché à votre liste de cadeaux I Want This : nom, image et prix déjà remplis.

## Description détaillée
I Want This est un site de listes de cadeaux partagées : chacun note ses envies, ses proches marquent ce qu'ils offrent (sans que vous le voyiez avant la date de remise), et on évite les doublons.

Cette extension fait gagner du temps : sur la page d'un produit, cliquez sur l'icône. Le nom, l'image et le prix sont lus dans votre navigateur (même sur les boutiques qui bloquent la lecture automatique), puis votre site s'ouvre avec le formulaire déjà rempli. Vous choisissez la liste ou le groupe, et vous validez.

• Un clic, aucun copier-coller
• Fonctionne sur Amazon, Fnac, Zalando, Bol.com, Coolblue et la plupart des boutiques
• Aucune donnée collectée : l'extension ne voit ni votre compte ni vos mots de passe
• Lit la page uniquement quand vous cliquez

Il faut un compte sur votre site I Want This (l'adresse se règle dans les options de l'extension).

## English summary
Add the product you are looking at to your I Want This gift list in one click: name, image and price are filled in for you. No data collected; the page is read only when you click.

## Catégorie
Shopping (Chrome / Edge) · Shopping (Firefox)

## Langue
Français (anglais en option)

## Objectif unique (Chrome — « single purpose »)
Ajouter le produit affiché dans l'onglet actif à la liste de cadeaux de l'utilisateur sur son site I Want This.

## Justification des permissions (Chrome / Edge)
- **activeTab** : lire le titre, l'image et le prix de la page sur laquelle l'utilisateur vient de cliquer sur l'icône, et seulement à ce moment.
- **scripting** : exécuter, dans cet onglet, le petit script qui lit les métadonnées du produit (Open Graph, JSON-LD).
- **storage** : mémoriser l'adresse du site de l'utilisateur, réglage facultatif des options.
- Pas de permission d'hôte, pas de code distant, pas de collecte de données.

## Déclaration d'utilisation des données (Chrome)
Ne collecte aucune des catégories de données. Cocher les 3 certifications (pas de vente de données, pas d'usage sans rapport avec la fonction, pas d'évaluation de solvabilité).

## Notes pour les validateurs (Firefox / Edge)
Aucun code minifié ni transpilé : les sources sont celles de l'archive. Pour tester : ouvrir une page produit (par exemple une fiche Amazon ou Fnac), cliquer sur l'icône : un onglet s'ouvre sur `https://greggoem.github.io/liste-cadeaux/#/?add=1&u=…&t=…&i=…&p=…`. Le site demande un compte pour valider l'ajout ; l'extension elle-même n'a besoin d'aucun compte. Code source : https://github.com/greggoem/liste-cadeaux/tree/main/extension

## Site / assistance
https://greggoem.github.io/liste-cadeaux/ · https://github.com/greggoem/liste-cadeaux/issues

## Où déposer
| Boutique | Adresse | Coût | Remarque |
|---|---|---|---|
| Chrome Web Store | https://chrome.google.com/webstore/devconsole | 5 $ une fois | validation 1 à 3 jours |
| Microsoft Edge Add-ons | https://partner.microsoft.com/dashboard/microsoftedge | gratuit | même archive que Chrome |
| Firefox Add-ons | https://addons.mozilla.org/developers/ | gratuit | signature par Mozilla, validation rapide |
| Safari (App Store) | Xcode + https://developer.apple.com | 99 $/an | `xcrun safari-web-extension-converter extension/ --app-name "I Want This"` |
