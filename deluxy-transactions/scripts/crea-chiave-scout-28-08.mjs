import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

// Una tantum (28/08/2026): la chiave della piattaforma consegne
// (deluxy-scout-next) per il collettore unico — compensi valet e rimborsi.
// Credenziali su file (da cancellare dopo l'installazione), mai a schermo.

const destinazione = process.argv[2];
if (!destinazione) {
  console.error("Uso: node scripts/crea-chiave-piattaforma-28-08.mjs <file-di-uscita>");
  process.exit(1);
}

function cifra(testo) {
  const raw = (process.env.TRANSACTIONS_ENC_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("TRANSACTIONS_ENC_KEY mancante (64 hex).");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(raw, "hex"), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return ["v1", iv.toString("hex"), c.getAuthTag().toString("hex"), dati.toString("hex")].join(":");
}

const prisma = new PrismaClient();
const nome = "deluxy-scout";
const esistente = await prisma.chiaveApi.findFirst({ where: { nome, attiva: true, revocataIl: null } });
if (esistente) {
  console.error(`Esiste già una chiave attiva per ${nome} (${esistente.prefisso}…).`);
  await prisma.$disconnect();
  process.exit(2);
}

const chiave = `trx_${randomBytes(24).toString("base64url")}`;
const segreto = randomBytes(32).toString("base64url");

await prisma.chiaveApi.create({
  data: {
    nome,
    hash: createHash("sha256").update(chiave).digest("hex"),
    prefisso: chiave.slice(0, 12),
    segretoHmac: cifra(segreto),
    // Gli stipendi valet superano spesso i tetti di Finance: 10.000 € a
    // richiesta / 50.000 € al giorno (la doppia firma di Transactions scatta
    // comunque dalle sue soglie).
    tettoRichiesta: 500000,
    tettoGiornaliero: 2000000,
    urlNotifica: "https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/transactions-esito",
  },
});
writeFileSync(destinazione, `${chiave}\n${segreto}\n`, { encoding: "utf8" });
console.log(`Chiave creata per ${nome} (prefisso ${chiave.slice(0, 12)}…). Credenziali scritte su file.`);
await prisma.$disconnect();
