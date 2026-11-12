export interface Profile { id: string; display_name: string }

export interface Wishlist {
  id: string
  owner_id: string
  title: string
  share_token: string
  /** liste d'enfant tenue par owner_id (null = la liste du compte lui-même) */
  child_name?: string | null
  child_age?: string | null
  child_color?: string | null
  /** liste d'enfant : visible par défaut dans les événements du parent */
  in_events?: boolean
}

export interface Item {
  id: string
  list_id: string
  title: string
  url: string | null
  details: string | null
  price: number | null
  image_url: string | null
  parent_id: string | null
  is_group: boolean
  pick_one: boolean
  is_favorite?: boolean
  created_at: string
}

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  read_at: string | null
}

export interface Claim {
  item_id: string
  claimed_by: string
  claimed_by_name: string
  event_id: string | null
  reveal_on: string
  owner_seen_at?: string | null
  discreet?: boolean
}

export interface EventRow {
  id: string
  name: string
  event_date: string
  created_by: string
  invite_code: string
  draw_done_at: string | null
  draw_enabled?: boolean
  draw_count: number | null
  image_url: string | null
  event_time?: string | null
  location?: string | null
}

export interface MemberRow {
  event_id: string
  user_id: string
  in_draw: boolean
  profiles: { display_name: string } | null
}

export interface AffiliateProgram {
  id: string
  label: string
  domain: string
  kind: 'param' | 'template'
  param_name: string | null
  param_value: string | null
  template: string | null
}
