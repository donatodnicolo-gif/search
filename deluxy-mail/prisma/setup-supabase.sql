-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSicuro" BOOLEAN NOT NULL DEFAULT true,
    "imapUtente" TEXT NOT NULL,
    "imapPassword" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSicuro" BOOLEAN NOT NULL DEFAULT true,
    "smtpUtente" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "cartella" TEXT NOT NULL DEFAULT 'INBOX',
    "cartellaInviata" TEXT,
    "ultimoUid" INTEGER NOT NULL DEFAULT 0,
    "primoUid" INTEGER NOT NULL DEFAULT 0,
    "storicoFinito" BOOLEAN NOT NULL DEFAULT false,
    "ultimoSync" TIMESTAMP(3),
    "ultimoErrore" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sezione" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "colore" TEXT NOT NULL DEFAULT 'blue',
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sezione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regola" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT true,
    "priorita" INTEGER NOT NULL DEFAULT 0,
    "seMittente" TEXT,
    "seOggetto" TEXT,
    "seContiene" TEXT,
    "istruzioneAI" TEXT,
    "sezioneId" TEXT,
    "creaAttivita" BOOLEAN NOT NULL DEFAULT false,
    "creaBozza" BOOLEAN NOT NULL DEFAULT false,
    "segnaLetta" BOOLEAN NOT NULL DEFAULT false,
    "archivia" BOOLEAN NOT NULL DEFAULT false,
    "fermaQui" BOOLEAN NOT NULL DEFAULT false,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Regola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Messaggio" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "messageId" TEXT,
    "thread" TEXT,
    "direzione" TEXT NOT NULL DEFAULT 'entrata',
    "mittente" TEXT NOT NULL,
    "mittenteNome" TEXT,
    "destinatari" TEXT NOT NULL,
    "oggetto" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "anteprima" TEXT NOT NULL,
    "corpoTesto" TEXT NOT NULL,
    "corpoHtml" TEXT,
    "allegati" INTEGER NOT NULL DEFAULT 0,
    "letto" BOOLEAN NOT NULL DEFAULT false,
    "archiviato" BOOLEAN NOT NULL DEFAULT false,
    "cestinato" BOOLEAN NOT NULL DEFAULT false,
    "cestinatoIl" TIMESTAMP(3),
    "sezioneId" TEXT,
    "smistatoDa" TEXT,
    "regolaId" TEXT,
    "priorita" TEXT,
    "prioritaDa" TEXT,
    "riassunto" TEXT,
    "serveRisposta" BOOLEAN NOT NULL DEFAULT false,
    "analizzatoIl" TIMESTAMP(3),
    "erroreAI" TEXT,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Messaggio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attivita" (
    "id" TEXT NOT NULL,
    "messaggioId" TEXT,
    "contattoEmail" TEXT,
    "rapportoId" TEXT,
    "titolo" TEXT NOT NULL,
    "dettaglio" TEXT,
    "scadenza" TIMESTAMP(3),
    "priorita" TEXT NOT NULL DEFAULT 'P2',
    "fatta" BOOLEAN NOT NULL DEFAULT false,
    "fattaIl" TIMESTAMP(3),
    "creataDaAI" BOOLEAN NOT NULL DEFAULT true,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attivita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bozza" (
    "id" TEXT NOT NULL,
    "messaggioId" TEXT,
    "accountId" TEXT,
    "origine" TEXT NOT NULL DEFAULT 'ai',
    "modo" TEXT NOT NULL DEFAULT 'rispondi',
    "a" TEXT NOT NULL DEFAULT '',
    "cc" TEXT NOT NULL DEFAULT '',
    "oggetto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "corpoAI" TEXT NOT NULL DEFAULT '',
    "modificata" BOOLEAN NOT NULL DEFAULT false,
    "inviata" BOOLEAN NOT NULL DEFAULT false,
    "inviataIl" TIMESTAMP(3),
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bozza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiassuntoContatto" (
    "email" TEXT NOT NULL,
    "situazione" TEXT NOT NULL,
    "taskAperti" TEXT NOT NULL DEFAULT '',
    "messaggiVisti" INTEGER NOT NULL DEFAULT 0,
    "azioniCreate" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiassuntoContatto_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "RapportoAI" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "riassunto" TEXT NOT NULL,
    "messaggiVisti" INTEGER NOT NULL DEFAULT 0,
    "troncato" BOOLEAN NOT NULL DEFAULT false,
    "attivitaCreate" INTEGER NOT NULL DEFAULT 0,
    "generatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RapportoAI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropostaArchivio" (
    "id" TEXT NOT NULL,
    "rapportoId" TEXT NOT NULL,
    "messaggioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "applicata" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PropostaArchivio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impostazione" (
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "aggiornataIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Impostazione_pkey" PRIMARY KEY ("chiave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE INDEX "Account_attivo_idx" ON "Account"("attivo");

-- CreateIndex
CREATE UNIQUE INDEX "Sezione_nome_key" ON "Sezione"("nome");

-- CreateIndex
CREATE INDEX "Regola_attiva_priorita_idx" ON "Regola"("attiva", "priorita");

-- CreateIndex
CREATE INDEX "Messaggio_data_idx" ON "Messaggio"("data");

-- CreateIndex
CREATE INDEX "Messaggio_sezioneId_data_idx" ON "Messaggio"("sezioneId", "data");

-- CreateIndex
CREATE INDEX "Messaggio_analizzatoIl_idx" ON "Messaggio"("analizzatoIl");

-- CreateIndex
CREATE UNIQUE INDEX "Messaggio_accountId_uid_key" ON "Messaggio"("accountId", "uid");

-- CreateIndex
CREATE INDEX "Attivita_fatta_scadenza_idx" ON "Attivita"("fatta", "scadenza");

-- CreateIndex
CREATE INDEX "Bozza_inviata_aggiornataIl_idx" ON "Bozza"("inviata", "aggiornataIl");

-- CreateIndex
CREATE INDEX "Bozza_messaggioId_idx" ON "Bozza"("messaggioId");

-- CreateIndex
CREATE INDEX "RapportoAI_generatoIl_idx" ON "RapportoAI"("generatoIl");

-- CreateIndex
CREATE INDEX "PropostaArchivio_rapportoId_idx" ON "PropostaArchivio"("rapportoId");

-- AddForeignKey
ALTER TABLE "Regola" ADD CONSTRAINT "Regola_sezioneId_fkey" FOREIGN KEY ("sezioneId") REFERENCES "Sezione"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Messaggio" ADD CONSTRAINT "Messaggio_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Messaggio" ADD CONSTRAINT "Messaggio_sezioneId_fkey" FOREIGN KEY ("sezioneId") REFERENCES "Sezione"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attivita" ADD CONSTRAINT "Attivita_messaggioId_fkey" FOREIGN KEY ("messaggioId") REFERENCES "Messaggio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attivita" ADD CONSTRAINT "Attivita_rapportoId_fkey" FOREIGN KEY ("rapportoId") REFERENCES "RapportoAI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bozza" ADD CONSTRAINT "Bozza_messaggioId_fkey" FOREIGN KEY ("messaggioId") REFERENCES "Messaggio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaArchivio" ADD CONSTRAINT "PropostaArchivio_rapportoId_fkey" FOREIGN KEY ("rapportoId") REFERENCES "RapportoAI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaArchivio" ADD CONSTRAINT "PropostaArchivio_messaggioId_fkey" FOREIGN KEY ("messaggioId") REFERENCES "Messaggio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

