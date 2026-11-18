-- Administration : liste des inscrits (adresse e-mail, prénom choisi, nombre d'envies et de cadeaux réservés).
-- Réservé aux administrateurs (table admins). Aucun contenu d'envie n'est renvoyé, seulement des nombres.

create or replace function public.admin_users()
returns table (
  id uuid, email text, display_name text, provider text,
  created_at timestamptz, last_sign_in_at timestamptz,
  wishes bigint, kids bigint, gifts bigint
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return query
    select u.id, u.email::text, p.display_name, coalesce(u.raw_app_meta_data->>'provider', 'email'),
           u.created_at, u.last_sign_in_at,
           (select count(*) from items i join wishlists w on w.id = i.list_id
              where w.owner_id = u.id and not coalesce(i.is_group, false)),
           (select count(*) from wishlists w where w.owner_id = u.id and w.child_name is not null),
           (select count(*) from item_claims c where c.claimed_by = u.id)
    from auth.users u
    left join profiles p on p.id = u.id
    order by u.created_at desc;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
