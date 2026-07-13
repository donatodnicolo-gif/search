---
description: Deploya (o ri-deploya) la Edge Function HubSpot `hubspot-sync` di Deluxy Scout su Supabase.
---

Deploya la Edge Function `hubspot-sync`. Non serve Docker: la CLI Supabase bundla via API.

Prerequisito: **`SUPABASE_ACCESS_TOKEN`** = un Personal Access Token Supabase. Chiedilo all'utente; NON inventarlo.

Passi (PowerShell):
```powershell
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
$env:SUPABASE_ACCESS_TOKEN = "<pat>"
Set-Location 'C:\Users\nicol\app\deluxy-scout'

npx -y supabase@latest functions deploy hubspot-sync --project-ref fdsziebgkljfsugqqbqd
```

Impostare/aggiornare il secret HubSpot (se cambia il token):
```powershell
npx -y supabase@latest secrets set HUBSPOT_TOKEN=<token> --project-ref fdsziebgkljfsugqqbqd
```

Verifica che l'endpoint sia su e protetto (deve rispondere **401** senza auth):
```powershell
node -e "fetch('https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/hubspot-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>console.log(r.status, await r.text()))"
```

Ricorda: l'URL della funzione è già in `deluxy-scout/.env` (`EXPO_PUBLIC_HUBSPOT_SYNC_URL`). Se cambia il project ref, aggiornalo.
