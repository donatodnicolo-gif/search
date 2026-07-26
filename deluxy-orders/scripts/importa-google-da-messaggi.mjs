// Copia le credenziali Google (OAuth del progetto Cloud + refresh token) dall'app
// Deluxy Messaggi, dove sono cifrate nella tabella Impostazione, dentro il .env
// di Orders. Serve a non rifare il consenso OAuth: è lo stesso progetto Google e
// lo stesso ambito (contacts).
//
// Uso: node scripts/importa-google-da-messaggi.mjs [percorso-env-messaggi]
//      (default: ../deluxy-messaging/.env)
//
// Non stampa MAI i valori: solo quali chiavi ha trovato.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const sorgente = process.argv[2] || "../deluxy-messaging/.env";
const righe = readFileSync(resolve(sorgente), "utf8").split(/\r?\n/);

function daEnv(nome) {
  const riga = righe.find((r) => r.startsWith(nome + "="));
  if (!riga) return null;
  let v = riga.slice(nome.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

const urlMessaggi = daEnv("DATABASE_URL");
const appSecret = daEnv("APP_SECRET");
if (!urlMessaggi || !appSecret) {
  console.error(`DATABASE_URL o APP_SECRET mancanti in ${sorgente}`);
  process.exit(1);
}

// Stessa derivazione e stesso formato di deluxy-messaging/src/lib/crypto.ts
const chiave = crypto.scryptSync(appSecret, "deluxy-messaging", 32);
function decifra(cifrato) {
  const [ivB64, tagB64, datiB64] = cifrato.split(".");
  if (!ivB64 || !tagB64 || !datiB64) throw new Error("formato cifrato non valido");
  const d = crypto.createDecipheriv("aes-256-gcm", chiave, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(datiB64, "base64")), d.final()]).toString("utf8");
}

const messaggi = new PrismaClient({ datasources: { db: { url: urlMessaggi } } });
const VOCI = [
  { chiave: "googleClientId", env: "GOOGLE_CLIENT_ID", cifrata: false },
  { chiave: "googleClientSecret", env: "GOOGLE_CLIENT_SECRET", cifrata: true },
  { chiave: "googleRefreshToken", env: "GOOGLE_REFRESH_TOKEN", cifrata: true },
];

// Query diretta: il client Prisma qui è generato dallo schema di Orders, che non
// conosce la tabella Impostazione di Messaggi.
const trovate = [];
for (const v of VOCI) {
  const righeDb = await messaggi.$queryRawUnsafe(
    'SELECT valore FROM "Impostazione" WHERE chiave = $1 LIMIT 1',
    v.chiave,
  );
  const grezzo = righeDb?.[0]?.valore?.trim();
  if (!grezzo) {
    console.log(`- ${v.chiave}: assente`);
    continue;
  }
  let valore;
  try {
    valore = v.cifrata ? decifra(grezzo) : grezzo;
  } catch (e) {
    console.error(`- ${v.chiave}: non decifrabile (${e.message}) — APP_SECRET diverso?`);
    continue;
  }
  trovate.push({ env: v.env, valore });
  console.log(`- ${v.chiave} → ${v.env}: ok (${valore.length} caratteri)`);
}
await messaggi.$disconnect();

if (trovate.length !== VOCI.length) {
  console.error("\nMancano delle credenziali: Google non verrà collegato. Completa il consenso in Messaggi e rilancia.");
  process.exit(1);
}

// Riscrive il .env di Orders conservando tutto il resto
const dest = new URL("../.env", import.meta.url);
const esistenti = existsSync(dest)
  ? readFileSync(dest, "utf8")
      .split(/\r?\n/)
      .filter((r) => r.trim() && !trovate.some((t) => r.startsWith(t.env + "=")))
  : [];

writeFileSync(
  dest,
  [...esistenti, "", "# Google Contacts (copiate da Deluxy Messaggi)", ...trovate.map((t) => `${t.env}="${t.valore}"`), ""].join("\n"),
);
console.log("\nScritte nel .env di Orders (valori non mostrati).");
