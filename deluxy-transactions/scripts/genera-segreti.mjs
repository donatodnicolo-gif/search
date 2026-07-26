import { randomBytes } from "node:crypto";

// Genera i segreti da mettere in .env (in locale) e su Vercel (in produzione).
// Stampa e basta: non scrive niente su disco, così non finiscono in un file per
// sbaglio. `npm run segreti`

console.log("");
console.log("Incolla questi valori in .env (locale) e nelle variabili di Vercel:");
console.log("");
console.log(`TRANSACTIONS_ENC_KEY=${randomBytes(32).toString("hex")}`);
console.log(`APP_SECRET=${randomBytes(32).toString("base64url")}`);
console.log(`CRON_SECRET=${randomBytes(24).toString("base64url")}`);
console.log("");
console.log("⚠️  TRANSACTIONS_ENC_KEY non si cambia più: i segreti già cifrati");
console.log("    (secondi fattori, chiavi HMAC delle app) non si rileggerebbero.");
console.log("");
