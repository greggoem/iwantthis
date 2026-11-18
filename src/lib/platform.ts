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
