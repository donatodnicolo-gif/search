-- Deluxy Scout — 0066: da dove arriva un preventivo (e la mail che lo porta).
-- Idempotente. La applica scripts/allinea-supabase.mjs (o il workflow al push).
--
-- PERCHÉ. I preventivi dei fornitori (0055) si potevano scrivere solo a mano,
-- dentro Scout. Ma il prezzo arriva quasi sempre per POSTA: il fornitore
-- risponde alla mail, e qualcuno ricopia il numero nell'app. Da qui la nuova
-- Edge Function `preventivi`, che AI Mail chiama per registrarlo al volo.
--
-- Il punto delicato non è scrivere la riga: è **poter risalire al numero**.
-- Un importo comparso nell'app senza dire da dove viene è un numero di cui non
-- ci si fida, e alla prima discussione col fornitore si torna a cercare la mail
-- a mano — cioè il lavoro che questa integrazione doveva togliere.
alter table preventivi add column if not exists origine text;
alter table preventivi add column if not exists fornitore_email text;
alter table preventivi add column if not exists mail_ref text;

-- `origine`: chi ha scritto la riga. NULL = a mano dentro Scout (tutte quelle
-- che esistono oggi), 'mail' = arrivata da AI Mail. Non è un booleano perché
-- domani potrebbero esserci altre strade (un form, un'altra app), e un
-- booleano `da_mail` andrebbe riscritto al primo caso nuovo.
comment on column preventivi.origine is
  'Da dove arriva la riga: NULL = inserita a mano in Scout, ''mail'' = registrata da AI Mail.';

comment on column preventivi.fornitore_email is
  'Indirizzo da cui è arrivato il prezzo. Serve a ricontattare chi l''ha fatto: il campo `fornitore` è solo un nome.';

-- ⚠️ È l'id INTERNO del messaggio in AI Mail (quello che apre /messaggio/<id>),
-- non il Message-ID della posta: la stessa distinzione già pagata sui `leads`
-- con la 0064, dove il Message-ID salvato non apriva niente.
comment on column preventivi.mail_ref is
  'Id interno del messaggio in AI Mail: apre la mail da cui è stato preso il prezzo.';
