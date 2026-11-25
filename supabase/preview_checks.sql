-- =====================================================================
--  Vérification quotidienne des envies incomplètes (lien sans image, sans prix ou sans titre)
--  pg_cron → pg_net → fonction Edge « refresh-previews », deux passages par nuit.
--  Chaque envie incomplète est retentée au plus une fois par semaine (items.preview_checked_at).
--  La clé d'appel est gardée dans le coffre de Supabase (vault), jamais dans ce fichier :
--    select vault.create_secret('<clé>', 'refresh_previews_key');
-- =====================================================================

alter table public.items add column if not exists preview_checked_at timestamptz;

create or replace function public.run_preview_checks()
returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://enycxafzvcgprfsfkvvc.supabase.co/functions/v1/refresh-previews',
    body := '{"limit":30}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-refresh-key', (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_previews_key')),
    timeout_milliseconds := 140000)
$$;
revoke all on function public.run_preview_checks() from public, anon, authenticated;

select cron.unschedule('iwt-preview-checks') where exists (select 1 from cron.job where jobname = 'iwt-preview-checks');
select cron.unschedule('iwt-preview-checks-2') where exists (select 1 from cron.job where jobname = 'iwt-preview-checks-2');
select cron.schedule('iwt-preview-checks',   '7 3 * * *',  $cron$ select public.run_preview_checks() $cron$);
select cron.schedule('iwt-preview-checks-2', '37 3 * * *', $cron$ select public.run_preview_checks() $cron$);

-- ---------- Suivi dans l'administration ----------
create table if not exists public.preview_check_runs (
  id         bigserial primary key,
  ran_at     timestamptz not null default now(),
  candidates int not null default 0,
  tried      int not null default 0,
  fixed      int not null default 0,
  images     int not null default 0,
  prices     int not null default 0,
  titles     int not null default 0
);
alter table public.preview_check_runs enable row level security;
revoke all on public.preview_check_runs from anon, authenticated;

create or replace function public.admin_preview_checks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return jsonb_build_object(
    'last', (select to_jsonb(r) from preview_check_runs r order by ran_at desc limit 1),
    'week', (select jsonb_build_object('runs', count(*), 'tried', coalesce(sum(tried), 0), 'fixed', coalesce(sum(fixed), 0),
                                       'images', coalesce(sum(images), 0), 'prices', coalesce(sum(prices), 0))
               from preview_check_runs where ran_at > now() - interval '7 days'),
    'no_image', (select count(*) from items where not coalesce(is_group, false) and coalesce(url, '') <> '' and coalesce(image_url, '') = ''),
    'no_price', (select count(*) from items where not coalesce(is_group, false) and coalesce(url, '') <> '' and price is null)
  );
end $$;
revoke all on function public.admin_preview_checks() from public, anon;
grant execute on function public.admin_preview_checks() to authenticated;
