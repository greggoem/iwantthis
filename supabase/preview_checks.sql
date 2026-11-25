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
