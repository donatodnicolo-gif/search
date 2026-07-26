import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

// Crea la chiave API di un'app Deluxy dalla riga di comando (in alternativa
// alla pagina /chiavi).
//
//   npm run chiave -- --nome deluxy-messaging [--tetto 500] [--tetto-giorno 5000] [--ip 1.2.3.4]
//
// Come per crea-operatore.mjs, la cifratura è ripetuta qui perché è uno script
// Node puro: se cambia in src/lib/crypto.ts, va allineata anche qui.

function argomento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function cent(valore) {
  if (!valore) return 0;
  const n = Number(String(valore).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function cifra(testo) {
  const raw = (process.env.TRANSACTIONS_ENC_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("TRANSACTIONS_ENC_KEY mancante o non valida (64 hex). Generala con: npm run segreti");
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(raw, "hex"), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return ["v1", iv.toString("hex"), c.getAuthTag().toString("hex"), dati.toString("hex")].join(":");
}

const nome = (argomento("nome") ?? "").trim().toLowerCase();
if (!/^[a-z0-9-]{3,40}$/.test(nome)) {
  console.error("Uso: npm run chiave -- --nome deluxy-messaging [--tetto 500] [--tetto-giorno 5000] [--ip 1.2.3.4]");
  process.exit(1);
}

const prisma = new PrismaClient();
const chiave = `trx_${randomBytes(24).toString("base64url")}`;
const segreto = randomBytes(32).toString("base64url");

try {
  await prisma.chiaveApi.create({
    data: {
      nome,
      hash: createHash("sha256").update(chiave).digest("hex"),
      prefisso: chiave.slice(0, 12),
      segretoHmac: cifra(segreto),
      tettoRichiesta: cent(argomento("tetto")),
      tettoGiornaliero: cent(argomento("tetto-giorno")),
      ipConsentiti: (argomento("ip") ?? "").trim(),
    },
  });
  console.log("");
  console.log(`Chiave creata per ${nome}. Si vede una volta sola:`);
  console.log("");
  console.log(`   TRANSACTIONS_API_KEY=${chiave}`);
  console.log(`   TRANSACTIONS_HMAC_SECRET=${segreto}`);
  console.log("");
  console.log("Mettile nella cassaforte del Hub sotto il progetto dell'app che le userà.");
  console.log("Sul database restano solo lo SHA-256 della chiave e il segreto cifrato.");
} catch (e) {
  console.error("Errore:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
