/** Textes de partage et image « carte » (1200×630) qui reprend l'image de l'événement */

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Petit emoji selon l'occasion */
export function occasionEmoji(name: string): string {
  const n = name.toLowerCase()
  if (/no[eë]l|christmas|r[eé]veillon/.test(n)) return '🎄'
  if (/anniv|birthday/.test(n)) return '🎂'
  if (/mariage|wedding/.test(n)) return '💍'
  if (/naissance|b[eé]b[eé]|baby/.test(n)) return '👶'
  if (/dipl[oô]m|graduat/.test(n)) return '🎓'
  if (/cr[eé]maill|house/.test(n)) return '🏡'
  return '🎁'
}

export function eventMessage(name: string, dateLong: string, url: string, appName: string): string {
  return `${occasionEmoji(name)} ${name} · ${dateLong}\n\n` +
    `Je t'invite à rejoindre l'événement sur ${appName} ! Chacun y met ses envies de cadeaux : on voit les listes des uns et des autres, et on évite les doublons (et les mauvaises surprises 😉).\n\n` +
    `👉 ${url}`
}

export function listMessage(title: string, url: string, appName: string): string {
  return `🎁 ${title}\n\n` +
    `Voici mes envies, avec les liens pour les trouver. Dis-moi ce que tu comptes m'offrir en cliquant « J'ai acheté » : je ne verrai rien avant le lendemain de la date de remise, la surprise reste entière 🤫\n\n` +
    `👉 ${url}\n\n(sur ${appName})`
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines)
    let last = keep[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    keep[maxLines - 1] = last + '…'
    return keep
  }
  return lines
}

function drawGift(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s / 32
  const rr = (rx: number, ry: number, w: number, h: number, r: number, fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x + rx * k, y + ry * k, w * k, h * k, r * k); ctx.fill()
  }
  rr(0, 0, 32, 32, 9, '#0f0f10'); rr(8, 15, 16, 11, 2, '#fff'); rr(6.5, 11.5, 19, 5, 1.6, '#fff'); rr(14.5, 11.5, 3, 14.5, 0, '#ff5a36')
  ctx.fillStyle = '#ff5a36'
  for (const sgn of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x + 16 * k, y + 11.5 * k)
    ctx.bezierCurveTo(x + (16 + sgn * 2.5) * k, y + 11.5 * k, x + (16 + sgn * 4.8) * k, y + 10.4 * k, x + (16 + sgn * 4.8) * k, y + 8.6 * k)
    ctx.bezierCurveTo(x + (16 + sgn * 4.8) * k, y + 7.3 * k, x + (16 + sgn * 3.7) * k, y + 6.6 * k, x + (16 + sgn * 2.6) * k, y + 6.9 * k)
    ctx.bezierCurveTo(x + (16 + sgn * 1.2) * k, y + 7.3 * k, x + (16 + sgn * 0.4) * k, y + 9.2 * k, x + 16 * k, y + 11.5 * k)
    ctx.fill()
  }
}

/** Dessine la carte : image de l'événement en fond (si elle existe), titre et sous-titre en surimpression */
export async function makeShareCard(opts: { heading: string; sub?: string; imageUrl?: string | null; appName: string }): Promise<Blob | null> {
  try { await document.fonts?.ready } catch { /* polices indisponibles : repli système */ }
  const W = 1200, H = 630
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = opts.imageUrl ? await loadImage(opts.imageUrl) : null

  if (img) {
    const r = Math.max(W / img.width, H / img.height)
    const w = img.width * r, h = img.height * r
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    const g = ctx.createLinearGradient(0, H * 0.25, 0, H)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#fbfaf8'); g.addColorStop(1, '#efede8')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    drawGift(ctx, W - 250, 70, 170)
  }

  const fg = img ? '#ffffff' : '#0f0f10'
  const sub = img ? 'rgba(255,255,255,.88)' : '#6b6b73'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = fg
  ctx.font = `700 74px ${FONT}`
  const lines = wrap(ctx, opts.heading, W - 160 - (img ? 0 : 250), 2)
  const lh = 88
  const baseY = H - 120 - (lines.length - 1) * lh - (opts.sub ? 0 : -30)
  lines.forEach((l, i) => ctx.fillText(l, 80, baseY + i * lh))
  if (opts.sub) {
    ctx.font = `500 38px ${FONT}`
    ctx.fillStyle = sub
    ctx.fillText(opts.sub, 80, baseY + (lines.length - 1) * lh + 62)
  }
  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = img ? 'rgba(255,255,255,.8)' : '#6b6b73'
  ctx.fillText(opts.appName, 80, 88)

  return await new Promise<Blob | null>(res => {
    try { canvas.toBlob(b => res(b), 'image/jpeg', 0.9) } catch { res(null) }
  })
}
