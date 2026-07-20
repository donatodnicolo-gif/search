-- Token privato per-utente per il feed iCal del calendario (sottoscrivibile da
-- Google/Apple/Outlook con un URL segreto). Non è un JWT: identifica solo il
-- feed di quell'utente, che espone i suoi task/follow-up datati (sola lettura).
alter table profiles add column if not exists cal_token uuid default gen_random_uuid();
update profiles set cal_token = gen_random_uuid() where cal_token is null;
