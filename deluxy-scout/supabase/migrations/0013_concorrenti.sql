-- Deluxy Scout — 0013: campo "concorrenti" sulla visita.
-- Testo libero rilevato sul campo (chi serve già il negozio per le linee di
-- interesse). Per ora libero: lo riconcilieremo in seguito con un elenco
-- strutturato quando avremo la lista dei concorrenti per linea.
alter table visits add column if not exists concorrenti text;
