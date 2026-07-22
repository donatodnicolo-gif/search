-- Chi ha inserito il target: colonna `creato_da` su places.
-- Default auth.uid() → i nuovi target catturano automaticamente il creatore
-- (l'utente loggato che li inserisce). I target storici restano senza creatore
-- (NULL): non è ricostruibile a posteriori.
alter table places
  add column if not exists creato_da uuid references auth.users(id) default auth.uid();

create index if not exists places_creato_da_ix on places (creato_da);
