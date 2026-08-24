// Le credenziali fuori dalla tabella `Impostazione`.
//
//   node scripts/segreti-fuori-dal-db.mjs              # cosa c'è, senza mostrarlo
//   node scripts/segreti-fuori-dal-db.mjs --scrivi .env.segreti
//   node scripts/segreti-fuori-dal-db.mjs --togli      # cancella le righe
//
// ⚠️⚠️ PERCHÉ. Il Postgres è **condiviso fra quattordici app** con un solo
// utente: chiunque abbia la stringa di connessione di una qualunque di quelle
// app può fare una SELECT su `marketing."Impostazione"` e leggersi la chiave
// privata dell'account di servizio Google e la chiave dell'API Anthropic. Non
// è un rischio teorico, è una query. Il codice adesso legge **prima
// l'ambiente** (`src/lib/segreti.ts`), quindi il posto giusto è lì.
//
// ⚠️ ORDINE OBBLIGATO, e `--togli` lo fa rispettare: prima la variabile
// d'ambiente su Vercel, poi la cancellazione. Al contrario si spegne Drive e
// l'AI finché qualcuno non se ne accorge.
//
// ⚠️ NON STAMPA MAI I VALORI. Un segreto che finisce in un terminale finisce
// nella cronologia della shell, nei log e negli appunti. `--scrivi` lo mette
// in un file che si cancella dopo averlo incollato su Vercel — e quel nome di
// file è già in `.gitignore`.
//
// ⚠️⚠️ E COMUNQUE VANNO RUOTATE. Sono state in chiaro per settimane su un
// database condiviso: spostarle non annulla il passato. Chiave Google Drive e
// account di servizio dalla Google Cloud Console, chiave Anthropic dalla
// console Anthropic.
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deve restare allineato a SEGRETI in src/lib/segreti.ts.
const SEGRETI = {
  "drive.service_account": "GOOGLE_SERVICE_ACCOUNT",
  "drive.apikey": "GOOGLE_DRIVE_API_KEY",
  ai_chiave_anthropic: "ANTHROPIC_API_KEY",
  ai_chiave_openai: "OPENAI_API_KEY",
  "drive.oauth_client_secret": "GOOGLE_OAUTH_CLIENT_SECRET",
  "drive.oauth_refresh": "GOOGLE_OAUTH_REFRESH",
};

const argomenti = process.argv.slice(2);
const togli = argomenti.includes("--togli");
const iScrivi = argomenti.indexOf("--scrivi");
const fileUscita = iScrivi >= 0 ? argomenti[iScrivi + 1] : null;

try {
  const righe = await prisma.impostazione.findMany({
    where: { chiave: { in: Object.keys(SEGRETI) } },
    select: { chiave: true, valore: true, aggiornataIl: true },
  });

  if (righe.length === 0) {
    console.log("Nessuna credenziale nella tabella Impostazione: già a posto.");
    process.exit(0);
  }

  console.log("Credenziali ancora nel database (il valore non si stampa):\n");
  for (const r of righe) {
    const nomeEnv = SEGRETI[r.chiave];
    const inAmbiente = Boolean((process.env[nomeEnv] ?? "").trim());
    console.log(
      `  ${r.chiave.padEnd(28)} → ${nomeEnv.padEnd(28)} ` +
        `${String(r.valore.length).padStart(5)} caratteri · ` +
        `${inAmbiente ? "già nell'ambiente ✓" : "NON nell'ambiente"}`,
    );
  }

  if (fileUscita) {
    // Una riga per variabile. Il JSON dell'account di servizio va su una riga
    // sola, con gli a-capo della chiave privata come \n letterali: è la forma
    // che JSON.parse ritrova identica dall'altra parte.
    const testo = righe
      .map((r) => `${SEGRETI[r.chiave]}=${JSON.stringify(r.valore)}`)
      .join("\n");
    fs.writeFileSync(fileUscita, testo + "\n", "utf8");
    console.log(
      `\nScritte ${righe.length} variabili in ${fileUscita}.` +
        `\nIncollarle su Vercel (Settings → Environment Variables), poi CANCELLARE il file,` +
        `\npoi rilanciare questo script con --togli.`,
    );
  }

  if (togli) {
    // Si cancella solo ciò che è già al sicuro altrove: togliere una riga la
    // cui variabile non esiste vuol dire spegnere Drive o l'AI in silenzio.
    const pronte = righe.filter((r) => (process.env[SEGRETI[r.chiave]] ?? "").trim());
    const nonPronte = righe.filter((r) => !(process.env[SEGRETI[r.chiave]] ?? "").trim());
    if (nonPronte.length > 0) {
      console.log("\nNON tolgo queste, perché la variabile d'ambiente non c'è:");
      for (const r of nonPronte) console.log(`  ${r.chiave} → manca ${SEGRETI[r.chiave]}`);
    }
    if (pronte.length > 0) {
      const n = await prisma.impostazione.deleteMany({
        where: { chiave: { in: pronte.map((r) => r.chiave) } },
      });
      console.log(`\nTolte dal database ${n.count} credenziali: ${pronte.map((r) => r.chiave).join(", ")}`);
    }
    console.log("\n⚠️ Restano da RUOTARE: sono state in chiaro, spostarle non cancella il passato.");
  }

  if (!togli && !fileUscita) {
    console.log("\n--scrivi <file> per prepararle, --togli per cancellarle dal database.");
  }
} finally {
  await prisma.$disconnect();
}
