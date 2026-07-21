import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Cifratura dei valori della pagina /chiavi: AES-256-GCM. GCM autentica oltre a
// cifrare: un valore manomesso sul database non si decifra "sbagliato", proprio
// non si decifra.
//
// La chiave di cifratura deriva da un segreto d'ambiente:
//  1. HUB_CHIAVI_SECRET se impostato (isolamento migliore: dedicato alla cassaforte);
//  2. altrimenti si riusa HUB_SESSION_SECRET, che è già in produzione — così la
//     cassaforte funziona senza configurare nulla di nuovo su Vercel.
// Il prefisso di dominio fa sì che la chiave AES sia comunque diversa dai byte
// usati per firmare i cookie, anche quando la base è la stessa.
//
// Attenzione: cambiare il segreto usato rende illeggibili le chiavi già salvate.
// Se resti sul fallback, ruotare HUB_SESSION_SECRET (che disconnette tutti) le
// azzera: per disaccoppiare, imposta un HUB_CHIAVI_SECRET dedicato.
const DOMINIO = "deluxy-hub/chiavi:v1:";

function chiaveMaster(): Buffer {
  const segreto = process.env.HUB_CHIAVI_SECRET || process.env.HUB_SESSION_SECRET;
  if (!segreto || segreto.length < 32) {
    throw new Error(
      "Nessun segreto per cifrare le chiavi: imposta HUB_CHIAVI_SECRET (o HUB_SESSION_SECRET), minimo 32 caratteri."
    );
  }
  // sha256 porta un segreto di qualsiasi lunghezza ai 32 byte richiesti da AES-256.
  return createHash("sha256").update(DOMINIO).update(segreto).digest();
}

export function cifra(testo: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chiaveMaster(), iv);
  const dati = Buffer.concat([cipher.update(testo, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), dati.toString("hex")].join(":");
}

export function decifra(cifrato: string): string {
  const [iv, tag, dati] = cifrato.split(":");
  if (!iv || !tag || !dati) throw new Error("Valore cifrato malformato");
  const decipher = createDecipheriv("aes-256-gcm", chiaveMaster(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dati, "hex")), decipher.final()]).toString(
    "utf8"
  );
}
