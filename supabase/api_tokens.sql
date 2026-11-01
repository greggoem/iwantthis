-- =====================================================================
--  Jetons personnels pour l'API REST / le serveur MCP
--  (à exécuter après schema.sql). Seul l'empreinte SHA-256 est stockée :
--  le jeton en clair n'est montré qu'une fois, à sa création.
-- =====================================================================
create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  token_prefix text not null,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '1 year'),
  last_used_at timestamptz
);
create index api_tokens_user_idx on public.api_tokens(user_id);

alter table public.api_tokens enable row level security;
create policy api_tokens_select on public.api_tokens for select to authenticated using (user_id = auth.uid());
create policy api_tokens_delete on public.api_tokens for delete to authenticated using (user_id = auth.uid());

-- l'empreinte n'est jamais lisible côté navigateur
revoke all on public.api_tokens from anon, authenticated;
grant select (id, name, token_prefix, created_at, expires_at, last_used_at) on public.api_tokens to authenticated;
grant delete on public.api_tokens to authenticated;

-- Création : renvoie le jeton en clair UNE seule fois
create or replace function public.create_api_token(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_n int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Donnez un nom au jeton'; end if;
  select count(*) into v_n from api_tokens where user_id = auth.uid();
  if v_n >= 10 then raise exception 'Maximum 10 jetons : révoquez-en un d''abord'; end if;
  v_token := 'ncg_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into api_tokens (user_id, name, token_prefix, token_hash)
  values (auth.uid(), left(trim(p_name), 60), left(v_token, 8), encode(sha256(convert_to(v_token, 'utf8')), 'hex'));
  return v_token;
end $$;

-- Vérification (réservée à la fonction « api » côté serveur) : renvoie l'utilisateur ou NULL
create or replace function public.verify_api_token(p_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid; v_last timestamptz;
begin
  select id, user_id, last_used_at into v_id, v_user, v_last
    from api_tokens where token_hash = p_hash and expires_at > now();
  if v_user is null then return null; end if;
  if v_last is null or v_last < now() - interval '10 minutes' then
    update api_tokens set last_used_at = now() where id = v_id;
  end if;
  return v_user;
end $$;

revoke all on function public.create_api_token(text) from public, anon;
grant execute on function public.create_api_token(text) to authenticated;
revoke all on function public.verify_api_token(text) from public, anon, authenticated;
grant execute on function public.verify_api_token(text) to service_role;
