-- Deluxy Scout — 0098: il numero d'ordine si assegna ALLA CHIUSURA.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0098_riferimento_alla_chiusura.sql
--
-- Decisione dell'utente (28/08/2026, dopo la 0095): «assegna il numero
-- d'ordine anche agli ordini esistenti, ma assegna il numero d'ordine solo
-- alla chiusura, il resto sono draft».
--
-- ⭐ **COSA CAMBIA.** Prima il numero nasceva con l'ordine; adesso l'ordine
-- nasce SENZA — è una bozza — e prende `SCOUT00N` nel momento in cui viene
-- chiuso. Il progressivo racconta quindi gli ordini CHIUSI in ordine di
-- chiusura, non le trattative aperte: non ci sono buchi lasciati da pratiche
-- morte per strada.
--
-- ⭐ **I 5 ORDINI CHE C'ERANO SI TENGONO IL NUMERO** (SCOUT001…SCOUT005,
-- assegnato dalla 0095), anche quelli non ancora chiusi: l'utente ha chiesto
-- espressamente di numerare «anche gli ordini esistenti». Toglierglielo adesso
-- vorrebbe dire cancellare un numero che è già stato letto, scritto su un DDT
-- o copiato in una mail — e un identificativo che sparisce è peggio di un
-- identificativo assegnato presto.
--
-- ⚠️ **RIAPRIRE UN ORDINE NON GLI TOGLIE IL NUMERO** e richiuderlo non gliene
-- dà uno nuovo: il numero resta immutabile (lo garantisce lo stesso trigger).
-- Un ordine che cambia numero fra due riaperture sarebbe irriconoscibile per
-- chi lo ha già annotato altrove.

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
    -- ⭐ IL MOMENTO: si chiude adesso e non ha ancora un numero → gliene tocca
    -- uno. La condizione guarda `new.chiuso_il`, non il passaggio da null:
    -- così anche un ordine chiuso da una strada diversa (import, correzione a
    -- mano) esce da qui con il suo numero.
    if new.riferimento is null and new.chiuso_il is not null then
      new.riferimento := 'SCOUT' || lpad(nextval('ordini_riferimento_seq')::text, 3, '0');
    end if;
    return new;
  end if;
  -- INSERT: l'ordine nasce BOZZA, senza numero. Se però chi lo crea lo crea
  -- già chiuso, il numero glielo diamo subito: la regola è «chiuso = ha un
  -- numero», non «l'ha preso in un secondo momento».
  if (new.riferimento is null or btrim(new.riferimento) = '') and new.chiuso_il is not null then
    new.riferimento := 'SCOUT' || lpad(nextval('ordini_riferimento_seq')::text, 3, '0');
  end if;
  return new;
end
$$;

revoke execute on function assegna_riferimento_ordine() from public, anon;
