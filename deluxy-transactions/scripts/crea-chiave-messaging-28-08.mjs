import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

// Una tantum (28/08/2026): la chiave del Customer Service per il collettore
// unico, con il webhook degli esiti già impostato. Chiave e segreto NON si
// stampano: finiscono nel file passato come argomento, che va cancellato
// subito dopo averli messi nell'ambiente del CS.

const destinazione = process.argv[2];
if (!destinazione) {
  console.error("Uso: node scripts/crea-chiave-messaging-28-08.mjs <file-di-uscita>");
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
const nome = "deluxy-messaging";
// La chiave del 26/07 non è mai stata installata sul CS (ultimoUso mai) e il
// valore in chiaro non esiste più: si revoca e se ne emette una nuova.
const revocate = await prisma.chiaveApi.updateMany({
  where: { nome, attiva: true, revocataIl: null },
  data: { attiva: false, revocataIl: new Date() },
});
if (revocate.count > 0) console.log(`Revocate ${revocate.count} chiavi inerti di ${nome}.`);

const chiave = `trx_${randomBytes(24).toString("base64url")}`;
const segreto = randomBytes(32).toString("base64url");

await prisma.chiaveApi.create({
  data: {
    nome,
    hash: createHash("sha256").update(chiave).digest("hex"),
    prefisso: chiave.slice(0, 12),
    segretoHmac: cifra(segreto),
    tettoRichiesta: 500000, // 5.000 € come deluxy-partner
    tettoGiornaliero: 2000000, // 20.000 €
    urlNotifica: "https://deluxy-messaging.vercel.app/api/pagamenti/notifica",
  },
});
writeFileSync(destinazione, `${chiave}\n${segreto}\n`, { encoding: "utf8" });
console.log(`Chiave creata per ${nome} (prefisso ${chiave.slice(0, 12)}…). Credenziali scritte su file.`);
await prisma.$disconnect();
