-- 0115 — UN TEMPLATE PER TIPO E PER BRAND (03/09/2026).
--
-- Trovato aggiungendo il «modulo di servizio»: l'unicità era su `brand` DA
-- SOLO (`template_documento_brand_ux`, where brand is not null). Voleva dire
-- che un'insegna poteva avere UN template e basta — quindi, appena avesse
-- avuto la sua pro-forma, il modulo di servizio per lo stesso brand sarebbe
-- stato rifiutato dal database con un errore di duplicato. Il tipo nuovo
-- sarebbe stato inutilizzabile proprio dove serve.
--
-- La regola giusta è quella che il nome del vincolo già suggeriva altrove
-- (`predefinito_uix` è su tipo + brand): **un template per ogni tipo di
-- documento e per ogni insegna**. Due pro-forma per Cake Design restano
-- impossibili — ed è il punto: era per quello che il vincolo esisteva.
--
-- ⚠️ Nessuna riga da sistemare prima: al momento della migrazione la tabella è
-- VUOTA (verificato). Anche piena sarebbe passata: chi era unico per brand
-- resta unico per (tipo, brand).
drop index if exists template_documento_brand_ux;
create unique index if not exists template_documento_tipo_brand_ux
  on template_documento (tipo, brand) where brand is not null;
