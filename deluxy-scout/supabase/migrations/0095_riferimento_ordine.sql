-- Deluxy Scout — 0095: IL RIFERIMENTO DELL'ORDINE (SCOUT001, SCOUT002, …).
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0095_riferimento_ordine.sql
--
-- Richiesta dell'utente (28/08/2026): «crea un identificativo ordine esempio
-- SCOUT001 progressivo … questo progressivo deve essere messo come ddt
-- all'interno dell'app delivery».
--
-- ⭐ **PERCHÉ ALLA CREAZIONE E NON ALLA CHIUSURA.** La richiesta diceva «alla
-- chiusura degli ordini», ma il numero deve finire come DDT sulla consegna, e
-- la consegna si fa PRIMA che l'ordine si chiuda: un numero che nasce alla
-- chiusura non esiste ancora nel momento in cui servirebbe scriverlo. Nasce
-- quindi con l'ordine, ed è pronto quando si apre la consegna.
--
-- ⭐ **PERCHÉ UN TRIGGER E NON IL CODICE DELL'APP.** Un ordine oggi nasce da
-- tre strade (trattativa vinta, richiesta cliente, form) e domani da una
-- quarta: se il numero lo assegna l'app, la strada nuova nasce senza. Qui è il
-- database a garantirlo — chiunque scriva, il numero c'è.
--
-- ⭐ **PERCHÉ UNA SEQUENZA.** Due ordini creati nello stesso istante devono
-- avere due numeri diversi: `nextval` lo garantisce, un `max(numero)+1` no
-- (due letture concorrenti vedono lo stesso massimo). Il prezzo è che un
-- inserimento fallito **lascia un buco** nella numerazione: è il male minore,
-- perché il buco si spiega mentre un numero doppio su due consegne diverse
-- sballerebbe il DDT e — nella piattaforma — la paga del valet.
--
-- ⚠️ **NON RIPARTE DA 1 OGNI ANNO.** L'esempio dell'utente è «SCOUT001» senza
-- anno: un contatore che riazzera farebbe rinascere SCOUT001 nel 2027, cioè
-- due ordini diversi con lo stesso DDT. Il progressivo è unico e continua. Se
-- un giorno lo si vuole per anno, l'anno va nel prefisso (SCOUT26-001), non
-- nel contatore.

create sequence if not exists ordini_riferimento_seq;
grant usage on sequence ordini_riferimento_seq to authenticated;

alter table ordini add column if not exists riferimento text;
comment on column ordini.riferimento is
  'Riferimento progressivo dell''ordine (SCOUT001). Si scrive come DDT sulla consegna nella piattaforma. Immutabile.';

-- Unico: è la chiave con cui la consegna, in un''altra app, dice a quale
-- ordine appartiene. Due uguali romperebbero proprio quel collegamento.
create unique index if not exists ordini_riferimento_uix on ordini (riferimento) where riferimento is not null;

create or replace function assegna_riferimento_ordine() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- ⚠️ IMMUTABILE. Il numero è già scritto come DDT su consegne che stanno in
    -- un'altra app: cambiarlo qui le lascerebbe puntare al vuoto senza che
    -- nessuno se ne accorga. Meglio un errore forte che un legame rotto in
    -- silenzio.
    if old.riferimento is not null and new.riferimento is distinct from old.riferimento then
      raise exception 'Il riferimento dell''ordine (%) non si cambia: è già il DDT della consegna.', old.riferimento;
    end if;
    return new;
  end if;
  if new.riferimento is null or btrim(new.riferimento) = '' then
    new.riferimento := 'SCOUT' || lpad(nextval('ordini_riferimento_seq')::text, 3, '0');
  end if;
  return new;
end
$$;

revoke execute on function assegna_riferimento_ordine() from public, anon;

drop trigger if exists ordini_riferimento_tg on ordini;
create trigger ordini_riferimento_tg
  before insert or update on ordini
  for each row execute function assegna_riferimento_ordine();

-- Gli ordini che c'erano già: numerati in ordine di nascita, così il
-- progressivo racconta la storia vera invece dell'ordine in cui il database
-- li ha restituiti.
do $$
declare r record;
begin
  for r in select id from ordini where riferimento is null order by created_at, id loop
    update ordini set riferimento = 'SCOUT' || lpad(nextval('ordini_riferimento_seq')::text, 3, '0') where id = r.id;
  end loop;
end
$$;
