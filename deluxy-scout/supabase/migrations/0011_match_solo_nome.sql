-- Deluxy Scout — 0011: match HubSpot sul NOME "pulito" (niente falsi positivi).
-- Problemi risolti:
--  - il match scattava col solo indirizzo simile (stessa via) → Moncler ↔ Pisa 1940;
--  - i nomi Google contengono la località ("Moncler MILANO MONTENAPOLEONE") che
--    faceva matchare qualunque azienda con "Milano" nel nome.
-- Soluzione: si normalizza il nome togliendo le parole di località/generiche, poi
-- si confronta per similarità trigram sul brand. L'indirizzo resta solo un bonus.

create or replace function norm_nome(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      lower(coalesce(t, '')),
      '\y(milano|milan|montenapoleone|monte|napoleone|boutique|flagship|store|the|srl|spa)\y',
      ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

create or replace function cerca_azienda_hubspot(p_nome text, p_indirizzo text default null, p_limit int default 5)
returns table (hubspot_id text, nome text, indirizzo text, citta text, dominio text, telefono text, somiglianza real)
language sql
stable
as $$
  select c.hubspot_id, c.nome, c.indirizzo, c.citta, c.dominio, c.telefono,
         least(
           1.0,
           similarity(norm_nome(c.nome), norm_nome(p_nome))
           + 0.12 * case when p_indirizzo is not null and p_indirizzo <> ''
                         then similarity(coalesce(c.indirizzo, ''), p_indirizzo) else 0 end
         )::real as somiglianza
  from hubspot_companies c
  where norm_nome(p_nome) <> ''
    and similarity(norm_nome(c.nome), norm_nome(p_nome)) >= 0.45
  order by somiglianza desc
  limit p_limit;
$$;
