-- 0084 — LA LAVAGNA DELL'IMPORT AUTOMATICO DELLA POSTA (27/08/2026).
--
-- Richiesta dell'utente sulla pagina Lead: «import automatico ogni giorno o
-- ogni volta che si apre la pagina».
--
-- Serve un posto dove segnare QUANDO la casella è stata letta l'ultima volta,
-- perché aprendo la pagina dieci volte in un'ora non si legge la casella dieci
-- volte, e perché tre persone che la aprono nello stesso minuto non devono
-- leggerla in tre.
--
-- ⚠️ NON sta in `impostazioni`: quella tabella la scrive solo l'amministratore
-- (policy `impostazioni_write`, migr. 0043), e l'import automatico che non
-- riesce a segnare il proprio passaggio non parte affatto. Per un venditore
-- sarebbe rimasto un bottone da premere a mano, cioè esattamente la cosa che
-- questa richiesta toglie di mezzo.
--
-- ⚠️ E non sta sul dispositivo: il conto è UNO per la squadra.
create table if not exists import_posta (
  -- Riga sola per costruzione: la lavagna è una.
  id boolean primary key default true check (id),
  ultimo_tentativo timestamptz,
  ultimo_esito text,
  ultimo_ok boolean,
  aggiornato_da uuid references auth.users(id) on delete set null
);

insert into import_posta (id) values (true) on conflict (id) do nothing;

alter table import_posta enable row level security;

do $$ begin
  create policy import_posta_select on import_posta for select to authenticated using (true);
exception when duplicate_object then null; end $$;

comment on table import_posta is
  'Quando la casella commerciale è stata letta l''ultima volta dall''import automatico (pagina Lead). Si scrive solo dalle funzioni prenota/chiudi/rilascia.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PRENOTARE il giro.
--
-- ⚠️ È una UPDATE sola con la condizione dentro, e questo è il punto: leggere
-- «quando è stata letta» e poi scrivere «adesso» in due passi lascia aperta la
-- finestra in cui due persone leggono lo stesso «mai» e partono entrambe. Qui
-- la seconda trova la riga già presa — Postgres rivaluta la condizione dopo il
-- lock — e torna false.
--
-- ⚠️ L'orologio è quello del SERVER (`now()`): il telefono di chi apre la
-- pagina può essere indietro di un'ora, e con la sua ora deciderebbe che sono
-- passati i minuti d'attesa quando non è vero.
create or replace function prenota_lettura_posta(attesa_minuti int default 15)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  righe int;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  update import_posta
     set ultimo_tentativo = now(),
         aggiornato_da = auth.uid()
   where id
     and (ultimo_tentativo is null
          or ultimo_tentativo < now() - make_interval(mins => greatest(attesa_minuti, 0)));
  get diagnostics righe = row_count;
  return righe > 0;
end;
$$;

-- Com'è andata: si scrive per tutti, così chi apre la pagina dopo legge che la
-- posta è già stata letta invece di chiedersi se funziona.
create or replace function chiudi_lettura_posta(esito text, ok boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  update import_posta
     set ultimo_esito = left(coalesce(esito, ''), 500),
         ultimo_ok = ok,
         aggiornato_da = auth.uid()
   where id;
end;
$$;

-- Se il giro è fallito, l'orologio torna indietro: un guasto di un minuto non
-- deve costare il quarto d'ora successivo.
create or replace function rilascia_lettura_posta(precedente timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  update import_posta set ultimo_tentativo = precedente where id;
end;
$$;

revoke all on function prenota_lettura_posta(int) from public;
revoke all on function chiudi_lettura_posta(text, boolean) from public;
revoke all on function rilascia_lettura_posta(timestamptz) from public;
grant execute on function prenota_lettura_posta(int) to authenticated;
grant execute on function chiudi_lettura_posta(text, boolean) to authenticated;
grant execute on function rilascia_lettura_posta(timestamptz) to authenticated;
