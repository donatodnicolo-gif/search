# deluxy.it — le date e le fasce di consegna dal Customer Service (10/09/2026)

Tema di lavoro Shopify `207333458250` («Version to work on»). Le regole vivono nel Customer Service
(deluxy-messaging → Orari negozi); il tema le legge da `/api/pubblico/consegna`.

- `originali/` — i sei file come stavano sul tema di lavoro prima delle modifiche (md5 verificati).
- `patchati/` — i sei file dopo `patch-tema.mjs`. Cinque sono già sul tema (md5 in `md5-attesi.json`);
  **`snippets__product-delivery-date.liquid` NO**: il connettore ha rifiutato il caricamento (59 KB).
  Va incollato a mano nell'editor del tema (Online Store → Temi → Version to work on → Modifica codice →
  `snippets/product-delivery-date.liquid`), poi controllare che l'md5 del file sul tema sia
  `6f405ef27f9bde7ffa94bac74692c4bb`.
- `patch-tema.mjs` — rigenera `out/` dagli originali con sostituzioni ancorate e controlla la sintassi.
- `prova-carrello.mjs` — sandbox del carrello (serve `../consegna.json`, una risposta dell'API).
- `payload.mjs` — produce le stringhe JSON (non-ASCII in \uXXXX) da passare a `themeFilesUpsert`.

Regole: `skills/sviluppi-siti-deluxy/reference/REGOLE_BRAND.md`. Mappa tecnica: `TEMA_DELUXY_IT.md`.
