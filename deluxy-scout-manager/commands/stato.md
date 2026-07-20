---
description: Mostra lo stato di Deluxy Scout — cosa è fatto, cosa manca, prossimi passi.
---

Riepiloga lo stato del progetto Deluxy Scout leggendo la skill.

1. Leggi `skills/deluxy-scout/reference/STATO_E_HANDOFF.md` (accanto a questa skill nel plugin).
2. Verifica al volo che l'ambiente sia pronto (PowerShell):
   ```powershell
   $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
   node --version
   Set-Location 'C:\Users\nicol\app\deluxy-scout'; Test-Path node_modules; Test-Path .env
   ```
3. (Opzionale) Verifica che il backend risponda, se hai un `SUPABASE_PAT`:
   ```powershell
   node scripts/mgmt-query.mjs -e "select (select count(*) from places) as places, (select count(*) from lines) as linee;"
   ```
4. Presenta all'utente: ✅ fatto (codice validato, Supabase live, HubSpot live) · ⏳ manca (utente login, chiavi Google Maps, build EAS, test end-to-end) · e i prossimi passi consigliati.
