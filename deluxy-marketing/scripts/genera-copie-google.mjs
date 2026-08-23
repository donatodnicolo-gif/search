// Rigenera le copie dello script di Google Ads, una per lavoro, pronte da
// incollare negli account.
//
//   node scripts/genera-copie-google.mjs [cartella]
//
// Una copia è il sorgente `scripts/google-ads-script.js` con una riga cambiata:
// `var AZIONE = "<lavoro>"`. Google Ads esegue sempre `main()`, è AZIONE che
// decide cosa fa.
//
// ⚠️ PERCHÉ ESISTE. Fino al 23/08/2026 le copie si rifacevano a mano ogni
// volta, e l'handoff è pieno di righe come «copie rigenerate alle 15:57»: un
// passo a memoria, in mezzo a un lavoro fatto di fretta, su dieci file che
// devono essere identici tranne una riga. Un lavoro nuovo (come `negative`)
// non aveva nemmeno un file, e nessuno se ne accorgeva finché non mancavano
// i dati.
//
// ⚠️ CHIAVE_API e BRAND restano VUOTI apposta: sono segreti e vanno rimessi a
// mano dentro Google Ads. Un file con la chiave dentro finirebbe in Downloads,
// nei backup e prima o poi in un allegato.
import fs from "node:fs";
import path from "node:path";

const sorgente = new URL("./google-ads-script.js", import.meta.url);
const testo = fs.readFileSync(sorgente, "utf8");

// I lavori sono quelli che lo script dichiara: si leggono da LAVORI_LETTURA,
// così aggiungerne uno nel codice basta — se l'elenco vivesse anche qui, le
// due liste divergerebbero al primo lavoro nuovo (ed è esattamente il debito
// che `sync-drive.mjs` sta pagando con `drive.ts`).
const elenco = testo.match(/var LAVORI_LETTURA = \[([^\]]*)\]/);
if (!elenco) {
  console.error("Non trovo LAVORI_LETTURA nello script: la copia non si può generare alla cieca.");
  process.exit(1);
}
const lavori = elenco[1]
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);
// `esegui` e `tutto` non stanno nell'elenco delle letture ma servono come file.
const tutti = [...lavori, "esegui", "tutto"];

const cartella = process.argv[2] ?? path.join(process.env.USERPROFILE ?? ".", "Downloads", "deluxy-google-ads");
fs.mkdirSync(cartella, { recursive: true });

const RIGA = /^var AZIONE = "[^"]*";/m;
if (!RIGA.test(testo)) {
  console.error("Non trovo la riga `var AZIONE = \"…\";`: lo script è cambiato, il generatore va aggiornato.");
  process.exit(1);
}

for (const lavoro of tutti) {
  const copia = testo.replace(RIGA, `var AZIONE = "${lavoro}";`);
  const file = path.join(cartella, `${lavoro}.js`);
  fs.writeFileSync(file, copia, "utf8");
  console.log(`  ${lavoro.padEnd(15)} → ${file} (${Math.round(copia.length / 1024)} KB)`);
}
console.log(`\n${tutti.length} copie in ${cartella}. CHIAVE_API e BRAND vanno rimessi a mano in Google Ads.`);
