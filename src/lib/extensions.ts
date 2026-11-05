/**
 * Adresses des fiches de l'extension sur les stores. Laissez vide tant qu'elle n'est pas publiée :
 * la page « Mon profil » propose alors l'installation manuelle (archive à télécharger).
 */
export const STORE_LINKS = {
  chrome: '',    // https://chromewebstore.google.com/detail/…
  edge: 'https://microsoftedge.microsoft.com/addons/detail/i-want-this/ieimbhjicpkcgahghhdhjhafbnifdpmj',
  firefox: 'https://addons.mozilla.org/addon/i-want-this/',
} as const

export const EXTENSION_ZIP = `${import.meta.env.BASE_URL}extension/iwt-extension.zip`
export const EXTENSION_SOURCE = 'https://github.com/greggoem/iwantthis/tree/main/extension'
export const EXTENSION_ZIP_FIREFOX = `${import.meta.env.BASE_URL}extension/iwt-extension-firefox.zip`
