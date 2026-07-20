-- ============================================================
--  Utente MySQL in SOLA LETTURA per deluxy-platform-next
--  Da eseguire sul server di produzione con un utente admin.
--  Serve solo a leggere/introspezionare: nessun rischio per i dati.
--  Sostituisci <PASSWORD_FORTE> e <NOME_DB> con i valori reali.
-- ============================================================

CREATE USER 'deluxy_next_ro'@'%' IDENTIFIED BY '<PASSWORD_FORTE>';

-- Solo lettura sull'intero database Deluxy
GRANT SELECT ON `<NOME_DB>`.* TO 'deluxy_next_ro'@'%';

FLUSH PRIVILEGES;

-- Nota: '%' consente la connessione da qualsiasi host. Se possibile,
-- restringi all'IP della macchina che esegue l'app:
--   CREATE USER 'deluxy_next_ro'@'<IP_CONSENTITO>' IDENTIFIED BY '...';
--   GRANT SELECT ON `<NOME_DB>`.* TO 'deluxy_next_ro'@'<IP_CONSENTITO>';
