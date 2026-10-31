/** « 1.299,00 », « 1,299.00 », « 89,90 € » → nombre (undefined si illisible) */
export function parsePrice(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'number') return raw > 0 && raw < 1e6 ? Math.round(raw * 100) / 100 : undefined
  let s = String(raw).replace(/[\s  ]/g, '').replace(/[^\d.,]/g, '')
  if (!s || !/\d/.test(s)) return undefined
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot)
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1)
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const count = s.split(sep).length - 1
    const after = s.length - s.lastIndexOf(sep) - 1
    if (count > 1 || after === 3) s = s.split(sep).join('')
    else s = s.replace(sep, '.')
  }
  const n = parseFloat(s)
  return isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) / 100 : undefined
}
