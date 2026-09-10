# deluxy.it — le date e le fasce di consegna dal Customer Service (10/09/2026)

Tema di lavoro Shopify `207333458250` («Version to work on»). Le regole vivono nel Customer Service
(deluxy-messaging → Orari negozi); il tema le legge da `/api/pubblico/consegna`.

- `originali/` — i sei file come stavano sul tema di lavoro prima delle modifiche (md5 verificati).
- `patchati/` — i sei file dopo `patch-tema.mjs`. **Tutti e sei sono sul tema** (md5 in `md5-attesi.json`):
  cinque via connettore, `snippets__product-delivery-date.liquid` incollato a mano dall'utente nell'editor
  del tema (il connettore rifiuta i 59 KB) la notte del 10/09, md5 verificato `6f405ef27f9bde7ffa94bac74692c4bb`.
  Per rifarlo: Online Store → Temi → Version to work on → Modifica codice → il file → Ctrl+A, Ctrl+V, Salva.
- `patch-tema.mjs` — rigenera `out/` dagli originali con sostituzioni ancorate e controlla la sintassi.
- `prova-carrello.mjs` — sandbox del carrello (serve `../consegna.json`, una risposta dell'API).
- `payload.mjs` — produce le stringhe JSON (non-ASCII in \uXXXX) da passare a `themeFilesUpsert`.

- Test di acquisto con agenti (10/09 sera, desktop + HTTP + mobile 375 px): flusso fino al checkout OK.
  Dai test sono nati i passi `c2` (prima data · data scelta), `segnaFonte('tema')`, `e2` (trattino «–»
  anche nel ripiego), il datepicker del carrello in italiano dal lunedì e il blocco
  `@media (pointer: coarse)` (bersagli 44 px). I difetti mobile preesistenti del tema stanno in
  STATO-DELUXY-IT.md §6.

Regole: `skills/sviluppi-siti-deluxy/reference/REGOLE_BRAND.md`. Mappa tecnica: `TEMA_DELUXY_IT.md`.
