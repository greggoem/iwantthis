/** Appareil et navigateur, pour proposer la bonne « première étape » (extension, installation…) */
export type Platform = 'ios' | 'android' | 'chromium' | 'firefox' | 'safari' | 'other'

export function platform(): Platform {
  const ua = navigator.userAgent
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Firefox\//i.test(ua)) return 'firefox'
  if (/Edg\/|OPR\/|Chrome\/|Chromium\//i.test(ua)) return 'chromium'
  if (/Safari\//i.test(ua)) return 'safari'
  return 'other'
}
export const isMobile = (p = platform()) => p === 'ios' || p === 'android'

/** Ouvert depuis l'icône de l'écran d'accueil (application installée) */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Sur cet appareil, la première étape a déjà été proposée (montrée ou refusée) */
const KEY = 'iwt.device.setup'
export const deviceSetupDone = (): boolean => { try { return !!localStorage.getItem(KEY) } catch { return true } }
export const markDeviceSetup = () => { try { localStorage.setItem(KEY, '1') } catch { /* rien */ } }

/**
 * Le bouton « I Want This » (extension ou favori) est-il déjà installé dans ce navigateur ?
 * 1. Il a déjà servi ici : ses liens d'ajout portent toujours &i= (image), contrairement au partage mobile et au raccourci iPhone.
 * 2. Chrome / Edge : l'extension (à partir de la 1.0.3) répond à un « ping » de iwantthis.gift (externally_connectable).
 *    Firefox ne permet pas ce ping : seul le point 1 y fonctionne.
 */
const EXT_KEY = 'iwt.ext.seen'
const EXT_IDS = ['flieedooclbbhihafmimamgphhilgedb', 'ieimbhjicpkcgahghhdhjhafbnifdpmj']   // Chrome Web Store, Edge Add-ons
export function noteButtonUse(hash = location.hash) {
  if (!/[?&]add=1\b/.test(hash) || !/[?&]i=/.test(hash)) return
  try { localStorage.setItem(EXT_KEY, '1') } catch { /* rien */ }
  markDeviceSetup()
}
type Rt = { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: unknown }
function ping(rt: Rt, id: string): Promise<boolean> {
  return new Promise(res => {
    const t = setTimeout(() => res(false), 800)
    try {
      rt.sendMessage(id, { type: 'iwt-ping' }, r => { clearTimeout(t); void rt.lastError; res(!!(r && (r as { ok?: boolean }).ok)) })
    } catch { clearTimeout(t); res(false) }
  })
}
export async function buttonInstalled(): Promise<boolean> {
  try { if (localStorage.getItem(EXT_KEY)) return true } catch { /* rien */ }
  // chrome.runtime n'existe sur la page que si une extension installée accepte ce site
  const rt = (window as unknown as { chrome?: { runtime?: Rt } }).chrome?.runtime
  if (!rt?.sendMessage) return false
  const found = (await Promise.all(EXT_IDS.map(id => ping(rt, id)))).some(Boolean)
  if (found) { try { localStorage.setItem(EXT_KEY, '1') } catch { /* rien */ } }
  return found
}

/** Y a-t-il quelque chose d'utile à proposer sur cet appareil ? */
export const hasDeviceStep = () => !(isMobile() && isStandalone())

/** Invitation d'installation d'Android/Chrome (événement beforeinstallprompt), gardée pour plus tard */
interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPrompt | null = null
export function listenInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt })
  window.addEventListener('appinstalled', () => { deferred = null; markDeviceSetup() })
}
export const canPromptInstall = () => deferred !== null
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  return outcome === 'accepted'
}
