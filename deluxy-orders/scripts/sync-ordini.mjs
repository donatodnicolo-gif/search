// Avvia lo scarico ordini chiamando l'endpoint dell'app (utile per cron esterni).
// Uso:  ORDERS_URL=https://... ORDERS_API_KEY=dlxo_... npm run sync -- [giorni]
// Richiede una chiave di SCRITTURA (creata con `npm run chiave -- <app> --scrittura`).
const base = process.env.ORDERS_URL || "http://localhost:3150";
const chiave = process.env.ORDERS_API_KEY;
const giorni = process.argv.slice(2).find((a) => /^\d+$/.test(a)) || "90";

if (!chiave) {
  console.error("Manca ORDERS_API_KEY (chiave di scrittura). Vedi: npm run chiave -- <app> --scrittura");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/v1/sync?giorni=${giorni}`;
const res = await fetch(url, { method: "POST", headers: { "x-api-key": chiave } });
const testo = await res.text();
if (!res.ok) {
  console.error(`Sync fallita (HTTP ${res.status}): ${testo}`);
  process.exit(1);
}
console.log(testo);
