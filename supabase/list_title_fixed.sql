-- Le titre de la liste n'est plus modifiable : « Ma liste d'envies »
alter table public.wishlists alter column title set default 'Ma liste d''envies';
update public.wishlists set title = 'Ma liste d''envies' where title <> 'Ma liste d''envies';
