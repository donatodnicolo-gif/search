# Sviluppi Siti Deluxy srl — Plugin Claude Code

Istruzioni operative per lavorare in sicurezza sui **temi Shopify dei siti Deluxy**
(deluxyflowers.com, deluxy.it, cakedesign.me) da qualsiasi Claude Code.

## Cosa contiene
- **Skill `sviluppi-siti-deluxy`** — workflow completo: sviluppo solo sul tema
  "Version to work on" (mai il live), tecniche di modifica sicura dei file Liquid,
  validazione sintassi, test simulati e in anteprima.
- **`reference/REGOLE_BRAND.md`** — le regole ufficiali di consegna per ogni brand
  (cutoff 16:00 / 22:00 di deluxyflowers.com, fasce orarie). Fonte di verità del business.
- **`reference/TEMA_DELUXYFLOWERS.md`** — mappa tecnica del tema: quali file gestiscono il
  date picker (carrello, header, prodotto, home), chiavi localStorage, insidie note.

## Regole chiave
1. **Mai scrivere sul tema live**: sempre su "Version to work on" (role UNPUBLISHED),
   con verifica del role prima di ogni scrittura. Pubblica solo l'utente.
2. Orari sempre in **ora italiana** (`Europe/Rome` via `Intl.DateTimeFormat`), mai l'ora
   del device del cliente, mai il `now` di Liquid (cachato).
3. Modifiche chirurgiche con anchor univoci + **validazione sintassi** dei blocchi `<script>`
   prima dell'upload + verifica round-trip dopo.
4. A fine lavoro **chiedere all'utente di verificare** visivamente sul sito.

## Installazione
```
/plugin install ./sviluppi-siti-deluxy
```
oppure dal repo `donatodnicolo-gif/search` → cartella `sviluppi-siti-deluxy/`.

## Uso rapido
- "Cambia le regole di consegna di deluxyflowers" → Claude aggiorna prima REGOLE_BRAND.md,
  poi il codice del tema dev secondo TEMA_DELUXYFLOWERS.md, testa e ti chiede verifica.
- "Il carrello non mostra la data" → prima ipotesi: SyntaxError in
  `snippets/delivery_date_hour_c.liquid` (vedi Insidie note).
