-- L'ultimo accesso dell'utente: base della regola «un valet che non si
-- collega per piu' di 90 giorni passa inattivo» (corsa notturna).
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
