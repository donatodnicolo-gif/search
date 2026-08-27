-- 0079 — I TEMPLATE DEI DOCUMENTI ABITANO QUI (27/08/2026 sera).
--
-- Decisione dell'utente: «Scout sarà l'owner dei template, a Finance vengono
-- comunicate solo le pro-forme».
--
-- Un template è l'intestazione con cui esce un documento: logo, ragione
-- sociale, P. IVA, coordinate di pagamento, testo di legge. Ce n'è uno per
-- insegna — deluxy.it, deluxyflowers.com, cakedesign.me — perché un cliente di
-- Cake Design non deve ricevere un foglio intestato Deluxy.
--
-- ⚠️ FINANCE non ne tiene una copia: quando Scout emette una pro-forma manda
-- l'intestazione INSIEME al documento, e di là viene salvata sul documento come
-- fotografia. Non è solo una questione di proprietà del dato — è anche l'unico
-- modo perché un documento già mandato al cliente non cambi aspetto il giorno
-- che qualcuno ritocca il template.
create table if not exists template_documento (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users(id) on delete set null default auth.uid(),

  -- Come si chiama per chi lo sceglie, e a quale insegna corrisponde.
  nome text not null,
  brand text,
  attivo boolean not null default true,
  predefinito boolean not null default false,

  -- Chi emette: i dati che la prassi chiede in testa a una pro-forma.
  ragione_sociale text not null,
  indirizzo text,
  piva text,
  codice_fiscale text,
  rea text,
  contatti text,
  -- Il logo come data URI: il documento si stampa e viaggia via email, e un
  -- logo ospitato su un host esterno sparisce dal PDF il giorno che quell'host
  -- cambia.
  logo_data_url text,

  -- Come si paga: un documento che chiede soldi senza dire dove mandarli fa
  -- perdere un giro di mail.
  iban text,
  intestatario_conto text,
  modalita_pagamento text,

  -- In calce: condizioni predefinite e la formula di legge (vuota = quella
  -- standard, che sta nel codice).
  note_default text,
  disclaimer text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists template_documento_nome_ux on template_documento (nome);
-- Un'insegna ha UN'intestazione: due vorrebbero dire che il documento esce
-- diverso a seconda di chi lo emette.
create unique index if not exists template_documento_brand_ux
  on template_documento (brand) where brand is not null;
-- Il predefinito è uno solo, e lo impone il database: «ne ho spuntati due» è un
-- guasto che si scopre dal documento sbagliato, cioè troppo tardi.
create unique index if not exists template_documento_predefinito_ux
  on template_documento (predefinito) where predefinito;

alter table template_documento enable row level security;

-- Come le altre tabelle di configurazione dell'app: chi è dentro Scout legge e
-- scrive. Non è un dato personale — è l'intestazione dell'azienda.
drop policy if exists template_documento_select on template_documento;
create policy template_documento_select on template_documento for select to authenticated using (true);
drop policy if exists template_documento_insert on template_documento;
create policy template_documento_insert on template_documento for insert to authenticated with check (true);
drop policy if exists template_documento_update on template_documento;
create policy template_documento_update on template_documento for update to authenticated using (true) with check (true);
drop policy if exists template_documento_delete on template_documento;
create policy template_documento_delete on template_documento for delete to authenticated using (true);

comment on table template_documento is
  'L''intestazione con cui escono pro-forma e preventivi, una per insegna. Scout ne è il proprietario: a FINANCE viaggia insieme al documento.';
