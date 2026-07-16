-- Deluxy Scout — 0015: "ultimo accesso" all'app per profilo.
-- Serve alla dashboard di Team per mostrare "ultima volta attivo" anche per i
-- venditori che non hanno ancora registrato visite (si basa sul login).

alter table profiles add column if not exists ultimo_accesso timestamptz;

-- Backfill iniziale dai dati di autenticazione (ultimo login noto).
update profiles p
set ultimo_accesso = u.last_sign_in_at
from auth.users u
where u.id = p.id and p.ultimo_accesso is null;
