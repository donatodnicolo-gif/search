-- 27/08/2026 — I TEMPLATE DEI DOCUMENTI, UNO PER BRAND (richiesta dell'utente:
-- «crea una sezione template dove possiamo fare i template delle pro-forme per
-- i vari brand utilizzando logo, dati societari»).
--
-- Fin qui l'intestazione della pro-forma veniva da QUATTRO righe della tabella
-- `Impostazione` (azienda.intestazione, .indirizzo, .piva, .contatti): una
-- sola, uguale per tutti, senza logo. Ma i brand del gruppo sono tre —
-- deluxy.it, deluxyflowers.com, cakedesign.me — e un documento che esce con
-- l'intestazione del brand sbagliato è un documento che il cliente non
-- riconosce.
--
-- ⚠️ Le vecchie impostazioni NON si cancellano e NON si migrano a forza: chi
-- non ha template continua a vedere quello che vedeva. Il template è un
-- sovrascrittore, non un obbligo. (Le quattro chiavi restano il ripiego, e la
-- sezione Impostazioni continua a mostrarle.)
--
-- Applicato a mano (non con `prisma db push`): su un database condiviso da 14
-- app il push confronta TUTTO lo schema e può proporre di cancellare ciò che
-- non è nel file. Qui si scrive solo ciò che serve.

create table if not exists public."TemplateDocumento" (
  id                text primary key,
  -- Come si chiama il template per chi lo sceglie: di regola il brand.
  nome              text not null,
  -- Il brand a cui corrisponde (deluxy.it, deluxyflowers.com, cakedesign.me).
  -- Serve a farlo scegliere DA FUORI per nome, senza conoscerne l'id: è così
  -- che Scout chiede «emetti con l'intestazione di cakedesign.me».
  brand             text,
  attivo            boolean not null default true,
  -- Uno solo predefinito: è quello che si usa quando nessuno dice quale.
  predefinito       boolean not null default false,

  -- ── Chi emette ─────────────────────────────────────────────────────────────
  -- Sono i dati che la legge chiede in testa a una pro-forma: denominazione,
  -- indirizzo, partita IVA o codice fiscale, ed eventuale REA.
  "ragioneSociale"  text not null,
  indirizzo         text,
  piva              text,
  "codiceFiscale"   text,
  rea               text,
  contatti          text, -- telefono · email · sito, su una riga

  -- Il logo come data URI (`data:image/png;base64,…`) o URL assoluto.
  -- ⚠️ Data URI di proposito: il documento si stampa, e un logo che vive su un
  -- host esterno sparisce dal PDF il giorno che quell'host cambia.
  "logoDataUrl"     text,

  -- ── Come si paga ───────────────────────────────────────────────────────────
  -- Un documento che chiede soldi senza dire dove mandarli fa perdere un giro
  -- di mail: l'IBAN e la modalità stanno sul documento.
  iban              text,
  "intestatarioConto" text,
  "modalitaPagamento" text,

  -- ── Cosa c'è scritto in calce ──────────────────────────────────────────────
  -- Condizioni predefinite (quelle che finiscono in `ProForma.note` quando il
  -- documento nasce da un'automazione e nessuno le scrive a mano).
  "noteDefault"     text,
  -- La formula di legge. Ha un default nel codice: qui si può cambiare senza
  -- toccare il codice, perché è un testo che il commercialista può voler
  -- riscrivere.
  disclaimer        text,

  "aliquotaIvaDefault" double precision not null default 22,
  "createdAt"       timestamp(3) not null default now(),
  "updatedAt"       timestamp(3) not null default now()
);

create unique index if not exists "TemplateDocumento_nome_key"
  on public."TemplateDocumento" (nome);
-- ⚠️ Un brand ha UN template: due intestazioni per lo stesso brand vorrebbero
-- dire che il documento esce diverso a seconda di chi lo emette.
create unique index if not exists "TemplateDocumento_brand_key"
  on public."TemplateDocumento" (brand) where brand is not null;
-- Il predefinito è uno solo, e lo impone il database: «ne ho spuntati due»
-- altrimenti è un bug che si scopre dal documento sbagliato.
create unique index if not exists "TemplateDocumento_predefinito_key"
  on public."TemplateDocumento" (predefinito) where predefinito;

comment on table public."TemplateDocumento" is
  'Intestazione dei documenti emessi (pro-forma e preventivi), una per brand: logo, dati societari, coordinate di pagamento e testo di legge.';

-- Il documento ricorda con quale template e'' stato emesso. ⚠️ `set null` e non
-- `cascade`: cancellare un template non deve cancellare i documenti che ha
-- generato — quelli restano, e tornano a mostrare l''intestazione generale.
alter table public."ProForma" add column if not exists "templateId" text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ProForma_templateId_fkey'
  ) then
    alter table public."ProForma"
      add constraint "ProForma_templateId_fkey"
      foreign key ("templateId") references public."TemplateDocumento"(id) on delete set null;
  end if;
end $$;

create index if not exists "ProForma_templateId_idx" on public."ProForma" ("templateId");

comment on column public."ProForma"."templateId" is
  'Con quale intestazione e'' stato emesso. Null = intestazione generale delle Impostazioni.';
