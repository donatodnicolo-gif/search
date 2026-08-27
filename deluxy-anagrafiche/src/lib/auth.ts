// Protezione della UI con password unica (team interno), come deluxy-partner.
// Le API /api/v1 NON passano da qui: sono protette dalle chiavi API.
//
// ⚠️⚠️ Riscritto il 27/08/2026 dopo una revisione ostile. Com'era:
//   sessionToken = SHA-256("deluxy-anagrafiche::" + password)
// Tre difetti in una riga sola:
//  1. il commento diceva «HMAC», il codice era un digest semplice — nessun
//     segreto separato, nessun salt, nessuna funzione lenta. Chi vedeva il
//     cookie aveva in mano lo SHA-256 di una password scelta da una persona,
//     che si rompe fuori linea a miliardi di tentativi al secondo;
//  2. il valore era lo stesso per tutti e per sempre: non identificava
//     nessuno e non si poteva revocare senza cambiare la password di tutti;
//  3. non scadeva mai lato server: il `maxAge` del browser lo decide il
//     browser, e un cookie copiato vale finché la password non cambia.
//
// Adesso il cookie è «scadenza · HMAC-SHA-256(scadenza, segreto)»:
//  · il segreto è ANAGRAFICHE_SESSION_SECRET quando c'è, altrimenti la
//    password stessa — così l'app continua a funzionare senza variabili nuove,
//    ma ⚠️ con la variabile impostata il cookie NON è più derivato dalla
//    password, e perderlo non espone più niente da rompere fuori linea;
//  · la scadenza è DENTRO il valore firmato, quindi la decide il server;
//  · il confronto è a tempo costante.

export const SESSION_COOKIE = "da_session";

// Quanto dura una sessione. Trenta giorni erano il `maxAge` del cookie; ora è
// la scadenza vera, verificata dal server a ogni richiesta.
export const DURATA_SESSIONE_MS = 30 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

function segreto(password: string): string {
  const s = process.env.ANAGRAFICHE_SESSION_SECRET?.trim();
  return s && s.length >= 16 ? s : password;
}

async function firma(messaggio: string, password: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segreto(password)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chiave, enc.encode(messaggio));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ⚠️ Confronto a tempo costante: un `===` su stringhe esce alla prima
// differenza, e la differenza di tempo racconta quanti caratteri hai indovinato.
function ugualiATempoCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Il valore da mettere nel cookie: scadenza in chiaro + la sua firma.
export async function sessionToken(password: string): Promise<string> {
  const scadenza = String(Date.now() + DURATA_SESSIONE_MS);
  return `${scadenza}.${await firma(scadenza, password)}`;
}

// ⚠️ Vera solo se la firma regge E la scadenza non è passata. Un cookie
// scaduto non è «quasi valido»: è invalido.
export async function sessioneValida(cookie: string, password: string): Promise<boolean> {
  const punto = cookie.indexOf(".");
  if (punto <= 0) return false;
  const scadenza = cookie.slice(0, punto);
  const mac = cookie.slice(punto + 1);
  const t = Number(scadenza);
  if (!Number.isFinite(t) || t <= Date.now()) return false;
  return ugualiATempoCostante(mac, await firma(scadenza, password));
}

// ⚠️ La password si confronta a tempo costante come la firma: è l'unico
// segreto che una persona digita, quindi è l'unico che vale la pena misurare.
export function passwordCorretta(tentativo: string, password: string): boolean {
  return ugualiATempoCostante(tentativo, password);
}
