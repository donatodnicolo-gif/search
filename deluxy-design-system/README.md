# Deluxy Design System — guida all'adozione

Questa cartella è la **fonte unica** del linguaggio visivo Deluxy e ospita anche i due Libri (UX e Sicurezza) e i loro registri:

```
deluxy-design-system/
├── DESIGN-SYSTEM.md            ← la specifica UI (principi → token → componenti → pattern)
├── LIBRO-UX-UI.md             ← i pattern d'interfaccia vincolanti + custode (architetto-ux)
├── LIBRO-SICUREZZA.md         ← le regole di sicurezza vincolanti + custode (architetto-sicurezza)
├── SEGNALAZIONI-UX.md         ← registro del custode del layout
├── SEGNALAZIONI-SICUREZZA.md  ← registro del custode della sicurezza
├── README.md                  ← questa guida
└── tokens/
    ├── tokens.json       ← valori canonici (machine-readable)
    ├── tokens.css        ← per app web (CSS custom properties)
    └── theme.ts          ← per app React Native / Expo
```

> **I due Libri e i loro custodi.** L'UI segue il [Libro UX&UI](LIBRO-UX-UI.md) (custode: agente `architetto-ux`); la sicurezza segue il [Libro della Sicurezza](LIBRO-SICUREZZA.md) (custode: `architetto-sicurezza`, con verifica ostile `sicurezza-ostile`). Errori e cambiamenti si registrano nei rispettivi `SEGNALAZIONI-*.md`, non si risolvono in autonomia; il custode decide se è una correzione locale, una regola nuova valida per tutte le app, o una deroga da annotare.

## Come si adotta, app per app

| App | Azione |
|---|---|
| **deluxy-platform-next** (web) | Già conforme — è l'implementazione di riferimento (`web/src/styles.css`). |
| **deluxy-scout** (Expo) | Sostituire gradualmente i token di `lib/theme.ts` con quelli di `tokens/theme.ts` (o importarli direttamente). Le deroghe (mappa, pin) vanno annotate. |
| **deluxy-suppliers / search** (web) | Importare `tokens/tokens.css` come primo CSS e allineare bottoni/card/badge ai componenti della specifica. |
| **Siti Shopify** (sviluppi-siti-deluxy) | Portare colori/tipografia/radius nelle variabili del tema. Contesto marketing: l'oro può essere più presente, ma scala tipografica, spazio e forme restano queste. |
| **Nuove app** | Giorno zero: copiare `tokens/` e linkare `DESIGN-SYSTEM.md` nel README dell'app. |

## Come viene comunicato (automatico)

1. **`CLAUDE.md` alla radice del repo** — ogni sessione di sviluppo con Claude in questo repo carica quel file, che rimanda qui: qualunque lavoro di UI parte da questa specifica senza doverlo ricordare.
2. **README delle singole app** — ogni app linka la specifica nella sezione "Design".
3. **Per le persone** — condividere `DESIGN-SYSTEM.md` (o esportarlo in PDF/docx) con chiunque metta mano alla UI; la regola operativa è una sola: *"prima di disegnare, apri la specifica; se manca qualcosa, aggiungila lì prima di usarla"*.

## Regole di governance

- Le modifiche si fanno **prima** qui (bump versione in testa a `DESIGN-SYSTEM.md`), poi nelle app.
- Le copie dei token dentro le app sono implementazioni: se divergono, vince `tokens/tokens.json`.
- Ogni commit di UI deve poter rispondere: *"quale sezione del design system sto applicando?"*
