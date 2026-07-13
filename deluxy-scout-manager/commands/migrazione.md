---
description: Esegui un file SQL o una query sul database Supabase di Deluxy Scout via Management API (senza password DB, senza SQL Editor del browser).
---

Esegui SQL sul DB di Deluxy Scout in modo affidabile, evitando il SQL Editor del browser (che crasha con Google Translate e soffre della clipboard sovrascritta).

Prerequisito: **`SUPABASE_PAT`** = Personal Access Token Supabase (Dashboard → Account → Access Tokens → Generate). Chiedilo all'utente se non ce l'hai; NON inventarlo.

Passi (PowerShell):
```powershell
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
$env:SUPABASE_PAT = "<pat>"
Set-Location 'C:\Users\nicol\app\deluxy-scout'

# query inline
node scripts/mgmt-query.mjs -e "select count(*) from places;"

# oppure un file di migrazione
node scripts/mgmt-query.mjs supabase/migrations/000X_nome.sql
```

Note:
- Lo script punta al project ref `fdsziebgkljfsugqqbqd` (override con `SUPABASE_REF`).
- I file vengono letti in UTF-8 (accenti corretti).
- Le migrazioni sono idempotenti (`if not exists`, `on conflict do update`): rieseguirle è sicuro.
- Dopo una migrazione, verifica con una `select` mirata.
