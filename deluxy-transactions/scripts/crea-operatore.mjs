import { PrismaClient } from "@prisma/client";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

// Crea il primo operatore (o un altro, se serve dalla riga di comando).
//
//   npm run operatore -- --email a@b.it --nome "Nome Cognome" --password "…" [--ruolo admin]
//
// Le funzioni crittografiche sono ripetute qui invece di importarle da
// src/lib/crypto.ts perché questo è uno script Node puro e quello è TypeScript
// dentro il bundle di Next. Se cambia l'algoritmo là, va cambiato anche qui:
// il commento serve a ricordarlo.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const GIRI = 210_000;

function argomento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function segretoTotp() {
  const b = randomBytes(20);
  let bit = 0;
  let valore = 0;
  let out = "";
  for (const byte of b) {
    valore = (valore << 8) | byte;
    bit += 8;
    while (bit >= 5) {
      out += ALFABETO[(valore >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ALFABETO[(valore << (5 - bit)) & 31];
  return out;
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

const email = (argomento("email") ?? "").trim().toLowerCase();
const nome = (argomento("nome") ?? "").trim();
const password = argomento("password") ?? "";
const ruolo = (argomento("ruolo") ?? "admin").trim();

if (!email || !nome || !password) {
  console.error('Uso: npm run operatore -- --email a@b.it --nome "Nome Cognome" --password "…" [--ruolo admin]');
  process.exit(1);
}
if (password.length < 12) {
  console.error("La password deve avere almeno 12 caratteri.");
  process.exit(1);
}
if (!["admin", "approvatore", "osservatore"].includes(ruolo)) {
  console.error("Ruolo ammesso: admin | approvatore | osservatore");
  process.exit(1);
}

const prisma = new PrismaClient();

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, salt, GIRI, 32, "sha256").toString("hex");
const totp = segretoTotp();

try {
  const o = await prisma.operatore.create({
    data: {
      email,
      nome,
      ruolo,
      passwordHash: hash,
      passwordSalt: salt,
      totpSegreto: cifra(totp),
      totpAttivo: true,
    },
  });
  console.log("");
  console.log(`Operatore creato: ${o.nome} <${o.email}> — ruolo ${o.ruolo}`);
  console.log("");
  console.log("Segreto per l'app di autenticazione (si vede una volta sola):");
  console.log(`   ${totp}`);
  console.log("");
  console.log(`   otpauth://totp/Deluxy%20Transactions:${encodeURIComponent(email)}?secret=${totp}&issuer=Deluxy%20Transactions`);
  console.log("");
  console.log("Senza questo codice non si entra e non si firma. Salvalo adesso.");
} catch (e) {
  console.error("Errore:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
