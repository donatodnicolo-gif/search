-- 0018 — Recensioni Google sulle attività scoperte.
-- Google Places Nearby restituisce già `rating` (0-5) e `user_ratings_total`:
-- li salviamo per mostrarli nella card della scoperta.
alter table places add column if not exists google_rating numeric(2,1);
alter table places add column if not exists google_reviews integer;
