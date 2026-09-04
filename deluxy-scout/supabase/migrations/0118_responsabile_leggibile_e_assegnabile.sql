-- Deluxy Scout — 0118: il flag `responsabile` si LEGGE e si ASSEGNA davvero.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0118_responsabile_leggibile_e_assegnabile.sql
--
-- Segnalazione dell'utente (04/09/2026): salvando la pianificazione
-- «permission denied for table profiles».
--
-- CAUSA. La 0085 ha tolto il SELECT di tabella su `profiles` e l'ha ridato per
-- COLONNE (id, email, nome, created_at, ultimo_accesso, proforma_default). La
-- 0106 ha aggiunto `responsabile` senza concederne la lettura, quindi:
--   1. le policy di `pianificazioni_commerciali` (`exists (select 1 from profiles
--      p where p.id = auth.uid() and p.responsabile)`) leggono una colonna che
--      `authenticated` non può leggere → l'errore, PER TUTTI, amministratore
--      compreso: la sottoquery si valuta prima dell'OR sull'email;
--   2. `fetchProfiles` ripiegava sulla select senza il flag → nell'app nessuno
--      risultava responsabile e la bandierina del Team non si vedeva;
--   3. `aggiornaResponsabile` faceva un UPDATE diretto di una colonna senza
--      grant → anche l'assegnazione falliva. Il flag non è MAI stato assegnabile.
--
-- ⚠️ NON si dà `grant update (responsabile)`: con la policy `profiles_update_own`
-- ogni utente potrebbe nominarsi responsabile da solo. L'assegnazione passa da
-- una funzione `security definer` che controlla `is_admin()` (0085).

-- 1. La lettura del flag a tutti gli autenticati: è un booleano di ruolo, non un dato riservato.
grant select (responsabile) on public.profiles to authenticated;

-- 2. L'assegnazione: solo l'amministratore, dentro la funzione.
create or replace function imposta_responsabile(p_id uuid, p_flag boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not is_admin() then
    raise exception 'Solo l''amministratore può assegnare il flag responsabile.';
  end if;
  update profiles set responsabile = p_flag where id = p_id;
  if not found then
    raise exception 'Profilo non trovato.';
  end if;
end;
$fn$;
revoke all on function imposta_responsabile(uuid, boolean) from public, anon;
grant execute on function imposta_responsabile(uuid, boolean) to authenticated;
comment on function imposta_responsabile(uuid, boolean) is
  'Assegna o toglie il flag responsabile commerciale (migr. 0106) a un profilo. Solo is_admin(): la colonna non ha grant di update per authenticated, di proposito.';
