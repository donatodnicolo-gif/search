// Client di esempio: come un'app Deluxy chiede un pagamento.
// Copia queste 25 righe nell'app che deve integrarsi (es. deluxy-messaging).
//
//   node docs/esempio-client.mjs
//
// Variabili attese:
//   TRANSACTIONS_URL          es. https://deluxy-transactions.vercel.app
//   TRANSACTIONS_API_KEY      la chiave (header x-api-key)
//   TRANSACTIONS_HMAC_SECRET  il segreto con cui si firma il corpo

import { createHash, createHmac, randomUUID } from "node:crypto";

const BASE = (process.env.TRANSACTIONS_URL || "http://localhost:3160").replace(/\/$/, "");
const CHIAVE = process.env.TRANSACTIONS_API_KEY || "";
const SEGRETO = process.env.TRANSACTIONS_HMAC_SECRET || "";

/** Chiamata firmata alle API di Deluxy Transactions. */
export async function chiamata(metodo, percorso, corpoOggetto, idempotenza) {
  const corpo = corpoOggetto ? JSON.stringify(corpoOggetto) : "";
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const impronta = createHash("sha256").update(corpo).digest("hex");
  const daFirmare = [metodo.toUpperCase(), percorso, timestamp, nonce, impronta].join("\n");
  const firma = createHmac("sha256", SEGRETO).update(daFirmare).digest("hex");

  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-api-key": CHIAVE,
      "x-deluxy-timestamp": timestamp,
      "x-deluxy-nonce": nonce,
      "x-deluxy-signature": `sha256=${firma}`,
      ...(idempotenza ? { "x-idempotency-key": idempotenza } : {}),
    },
    ...(corpo ? { body: corpo } : {}),
  });
  return { stato: res.status, dati: await res.json().catch(() => null) };
}

// --- esempio d'uso ---------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const esito = await chiamata(
    "POST",
    "/api/v1/richieste",
    {
      importo: "249,90",
      beneficiario: "Fioreria Bianchi SRL",
      iban: "IT60X0542811101000000123456",
      causale: "Ordine DLX-10422 consegna 12/08",
      riferimentoEsterno: "conversazione-8842", // rende la chiamata ripetibile
      note: "Richiesto in chat dal fornitore",
      urlNotifica: "https://deluxy-messaging.vercel.app/api/pagamenti/notifica",
    },
    randomUUID(), // chiave di idempotenza: un retry non crea un secondo pagamento
  );
  console.log(esito.stato, esito.dati);
}
