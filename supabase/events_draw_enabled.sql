-- Le tirage au sort devient un « outil » de l'événement, activé par l'organisateur
alter table public.events add column if not exists draw_enabled boolean not null default false;
update public.events e set draw_enabled = true
 where e.draw_done_at is not null or exists (select 1 from public.draw_exclusions x where x.event_id = e.id);
