// Copia DATABASE_URL e DIRECT_URL dal .env locale alle variabili d'ambiente di
// PRODUZIONE del progetto Vercel collegato (cartella .vercel), poi rilancia il
// deploy di produzione perché le variabili entrino in vigore.
// Non stampa mai le stringhe di connessione.
//
// Uso: npm run vercel:env
import { readFileSync } from "fs";
import { spawnSync } from "child_process";

const righe = readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/);

function prendi(nome) {
  const riga = righe.find((r) => r.startsWith(nome + "="));
  if (!riga) return null;
  let v = riga.slice(nome.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v || null;
}

function vercel(args, input) {
  return spawnSync("npx", ["vercel", ...args], {
    input,
    shell: true,
    encoding: "utf8",
  });
}

const variabili = ["DATABASE_URL", "DIRECT_URL"];
for (const nome of variabili) {
  const valore = prendi(nome);
  if (!valore) {
    console.error(`${nome} manca nel .env — lancia prima: npm run db:condiviso -- <env-di-un'altra-app>`);
    process.exit(1);
  }
  // Rimuove l'eventuale valore già presente (se non c'è, l'errore è innocuo).
  vercel(["env", "rm", nome, "production", "--yes"]);
  const r = vercel(["env", "add", nome, "production"], valore);
  if (r.status !== 0) {
    console.error(`Non sono riuscito a impostare ${nome} su Vercel.`);
    console.error(r.stderr?.split("\n").slice(-5).join("\n"));
    process.exit(1);
  }
  console.log(`${nome} impostata in produzione (valore non mostrato).`);
}

// Le variabili entrano in vigore solo al deploy successivo: si rilancia
// l'ultimo deploy di produzione (stesso codice, nuove variabili).
const elenco = vercel(["ls", "deluxy-tasks"]);
const riga = (elenco.stdout + elenco.stderr)
  .split("\n")
  .find((l) => l.includes("Production") && l.includes("Ready"));
const url = riga?.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/)?.[0];
if (!url) {
  console.log("Variabili impostate. Ora rilancia a mano il deploy di produzione (npx vercel redeploy <url>).");
  process.exit(0);
}
console.log(`Rilancio il deploy di produzione (${url})…`);
const dep = spawnSync("npx", ["vercel", "redeploy", url.replace("https://", "")], {
  shell: true,
  stdio: "inherit",
});
process.exit(dep.status ?? 0);
