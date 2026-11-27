// Cadeaux communs : types partagés entre le formulaire, la page du cadeau et « À offrir »

export type GGStatus = 'open' | 'closed' | 'bought' | 'cancelled'
export type GGAnswer = 'pending' | 'yes' | 'no'

export interface GGMember {
  id: string; name: string; organizer: boolean; answer: GGAnswer; me: boolean
  amount: number | null      // part (visible des organisateurs, et de soi)
  paid: boolean | null
}

export interface GroupGift {
  id: string; title: string; url: string | null; image_url: string | null; price: number; split: 'equal' | 'free'; fixed_share: number | null
  recipient_name: string; recipient_on_site: boolean; from_list: boolean; recipient_list: string | null
  give_on: string; respond_by: string | null; note: string | null; status: GGStatus
  surplus: 'reduce' | 'extra' | 'voucher' | null; extra_text: string | null
  event: { id: string; name: string } | null
  share_token: string | null; is_organizer: boolean; created_by: string
  total: number; yes: number; pending: number; suggested: number | null
  me: { answer: GGAnswer; amount: number | null; share: number | null; paid: boolean }
  members: GGMember[]
  invites: { id: string; email: string; emailed: boolean }[]
  extras: { id: string; title: string; price: number; image_url: string | null }[]
}

export interface GGCard {
  id: string; title: string; image_url: string | null; url: string | null; price: number
  recipient_name: string; give_on: string; status: GGStatus; is_organizer: boolean
  answer: GGAnswer; share: number | null; paid: boolean; total: number; yes: number
  with: string[]; organizers: string[]
}

/** Ce qu'on sait déjà du cadeau quand on le lance depuis une envie */
export interface GGSeed {
  itemId?: string; title?: string; url?: string | null; image?: string | null; price?: number | null
  recipientId?: string | null; recipientKid?: string | null; recipientName?: string; eventId?: string | null; giveOn?: string | null
}

export const euros = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : `${Number(n).toLocaleString('fr-BE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`

/** « Greg, Julie et Marc » */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`
}
