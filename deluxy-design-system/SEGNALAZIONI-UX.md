# Segnalazioni UX — il registro del custode

**Dal 27/08/2026 il layout di tutte le app Deluxy ha un custode: l'agente `architetto-ux`** (`.claude/agents/architetto-ux.md`), che applica il [Libro UX&UI](LIBRO-UX-UI.md) e il [Design System](DESIGN-SYSTEM.md).

## Come funziona

1. **Chi trova un errore di interfaccia o vuole un cambiamento di layout NON lo risolve in autonomia**: lo scrive qui sotto (una riga nella tabella «In attesa») oppure interpella direttamente l'agente `architetto-ux` in sessione.
2. **Il custode valuta** ogni segnalazione contro il Libro e decide una di tre cose:
   - **correzione locale** (l'app era fuori canone: si adegua, citando la voce del Libro);
   - **regola nuova del Libro** (il caso non era coperto: la voce entra nel Libro con bump di versione e **vale anche per le altre app** — il custode elenca quali app sono toccate);
   - **respinta** (non è un difetto, o è una deroga legittima: si annota il perché).
3. L'esito si sposta nella tabella «Decise», con la data e la voce del Libro citata o creata.
4. Le **deroghe** concesse a un'app si annotano ANCHE nel README di quell'app.

> Formato della segnalazione: `app · schermata/percorso · cosa succede o cosa si vorrebbe · chi la segnala/data`. Meglio un sintomo osservato («il bottone Salva finisce sotto la tastiera su Android») che una diagnosi («manca il KeyboardAvoidingView»).

## In attesa

| Data | App | Segnalazione | Fonte |
|---|---|---|---|
| 27/08 | search-supplier | Propagare i token v1.4 (inline in `index.html:9-22`, si sviluppa su `main`: da fare in una sessione su quel branch) | custode |
| 27/08 | Scout | Migrare `lib/theme.ts` ai token DS **rinominando prima le chiavi in collisione** (`spacing.md` 16≠12) — mai swap secco (Libro cap. 12) | custode |
| 27/08 | scoutwt | Allineare la copia del DS in `scoutwt/deluxy-design-system` alla v1.4 (oggi ferma alla 1.3) e valutare se copiarvi il Libro (repo PUBBLICO) | custode |

## Decise

| Data | App | Segnalazione | Esito |
|---|---|---|---|
| 27/08 | tutte | Nasce il Libro UX&UI: ~140 divergenze censite su 10 app, giuria a 3 lenti + revisione ostile | Libro v1.0 + DS v1.4 + piano P0/P1/P2 (Libro, Appendice B); i 3 P0 lanciati come task |
| 27/08 | 10 app web | Copie `tokens.css` ferme alla v1.0 | Propagata la v1.4 a hub, partner, tasks, fondo, anagrafiche, mail, crm, personale, acquisti, calendario + token v1.4 aggiunti a `platform-next/web/styles.css` |
