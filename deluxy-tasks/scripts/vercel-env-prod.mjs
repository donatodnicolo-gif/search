// Copia DATABASE_URL e DIRECT_URL dal .env locale alle variabili d'ambiente di
// PRODUZIONE del progetto Vercel collegato (cartella .vercel), poi rilancia il
// deploy di produzione perché le variabili entrino in vigore.
// Non stampa mai le stringhe di connessione.
//
// Uso: npm run vercel:env
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
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

// Le variabili entrano in vigore solo al deploy successivo, quindi si pubblica
// il codice che c'è ORA su disco. Il deploy si lancia dalla RADICE DEL REPO:
// il progetto Vercel ha Root Directory = "deluxy-tasks", quindi partendo dalla
// cartella dell'app andrebbe a cercare "deluxy-tasks/deluxy-tasks" e fallisce
// in un secondo.
//
// NON si usa `vercel redeploy`: rimette in produzione il CODICE di quel vecchio
// deploy. È già successo che riportasse online una versione senza le rotte
// aggiunte dopo (la /api/sso sparita, 404 dal Hub).
const radice = fileURLToPath(new URL("../..", import.meta.url));
console.log(`Pubblico in produzione da ${radice}…`);
const dep = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
  cwd: radice,
  shell: true,
  stdio: "inherit",
});
process.exit(dep.status ?? 0);
