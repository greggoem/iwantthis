-- Heure et lieu facultatifs d'un événement (le lieu n'apparaît pas dans l'aperçu public des liens)
alter table public.events add column if not exists event_time time, add column if not exists location text check (location is null or length(location) <= 200);
-- share_preview renvoie aussi l'heure (voir share_preview.sql)
