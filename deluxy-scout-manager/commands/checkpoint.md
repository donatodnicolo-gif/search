---
description: Fai un "checkpoint" di Deluxy Scout — aggiorna i documenti di handoff del plugin (stato, architettura) e la memoria per riflettere lo stato attuale, poi dai un recap.
---

Usa questo quando l'utente chiede un "checkpoint"/"aggiorna handoff", **oppure ogni volta che stai per fermarti dopo aver lavorato su Deluxy Scout**. Serve a tenere il plugin sempre allineato allo stato reale, così un altro agente può riprendere.

Passi:
1. Ricostruisci cosa è cambiato in questa sessione: codice in `deluxy-scout/` (nuove schermate/funzioni/componenti), migrazioni Supabase, deploy Edge Function, config, `.env`.
2. Aggiorna `skills/deluxy-scout/reference/STATO_E_HANDOFF.md`:
   - sezione **✅ Fatto e verificato** (aggiungi le novità),
   - sezione **⏳ Cosa manca** (togli ciò che è stato completato),
   - la **data** in alto.
3. Aggiorna `skills/deluxy-scout/reference/ARCHITETTURA.md` se sono cambiati struttura cartelle, rotte, modello dati o mappature.
4. Aggiorna la memoria `progetto-deluxy-scout.md` con i fatti nuovi **non** deducibili dal codice (decisioni, id, stato dei servizi esterni).
5. Verifica rapida (Node nel PATH): `npx tsc --noEmit` e `npx jest`.
6. Dai un **recap conciso**: cosa fatto in questa sessione · cosa resta · prossimo passo.

Regole: **non committare** a meno che l'utente non lo chieda; **mai segreti** nei file del plugin (solo in `deluxy-scout/.env`).
