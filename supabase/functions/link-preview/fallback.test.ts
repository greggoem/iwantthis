import { fillGaps, shopifyJsonUrl, isbnCoverUrl, directImage } from './fallback.ts'
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
Deno.test('urls', () => {
  eq(shopifyJsonUrl(new URL('https://mardi-editions.com/products/bandana-gris?x=1')), 'https://mardi-editions.com/products/bandana-gris.js')
  eq(shopifyJsonUrl(new URL('https://x.com/collections/a/products/b')), 'https://x.com/products/b.js')
  eq(shopifyJsonUrl(new URL('https://www.sezane.com/eu-en/product/adam')), undefined)
  eq(isbnCoverUrl(new URL('https://www.amazon.com.be/dp/3836581914')), 'https://covers.openlibrary.org/b/isbn/3836581914-L.jpg?default=false')
  eq(isbnCoverUrl(new URL('https://www.amazon.com.be/dp/B0H4FF1BNX')), undefined)
  eq(directImage(new URL('https://a.com/x/y.JPG?w=1')), 'https://a.com/x/y.JPG?w=1')
})
Deno.test('chain', async () => {
  const calls: string[] = []
  const net = { json: async (u: string) => { calls.push(u); if (u.endsWith('.js')) return { title: 'Bandana', featured_image: '//cdn.shopify.com/a.jpg', price: 12500 }; throw new Error('x') }, ok: async () => true }
  const r = await fillGaps({ found: false, reason: 'bloqué' }, new URL('https://m.com/products/bandana'), net)
  eq([r.found, r.image, r.title, r.price, r.reason], [true, 'https://cdn.shopify.com/a.jpg', 'Bandana', 125, undefined])
  eq(calls.length, 1)
  const r2 = await fillGaps({ found: false }, new URL('https://www.amazon.com.be/dp/3836581914'), { json: async () => { throw new Error('no') }, ok: async () => true })
  eq(r2.image, 'https://covers.openlibrary.org/b/isbn/3836581914-L.jpg?default=false')
  const r3 = await fillGaps({ found: false }, new URL('https://www.sezane.com/p/x'), { json: async (u: string) => { if (u.includes('microlink')) return { status: 'success', data: { title: 'Loafers', image: { url: 'https://img/x.jpg' } } }; throw new Error() }, ok: async () => false })
  eq([r3.found, r3.image, r3.title], [true, 'https://img/x.jpg', 'Loafers'])
  const r4 = await fillGaps({ found: false, reason: 'bloqué' }, new URL('https://z.com/a'), { json: async () => { throw new Error() }, ok: async () => false })
  eq([r4.found, r4.reason], [false, 'bloqué'])
})
