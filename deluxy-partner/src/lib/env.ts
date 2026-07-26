// Chiavi e URL presi dalle variabili d'ambiente, ripuliti prima dell'uso.
//
// PERCHE' ESISTE QUESTO FILE. Un valore infilato in un header HTTP deve essere
// ASCII: `fetch` rifiuta l'intera richiesta se il valore contiene un carattere
// > 255, e il messaggio non nomina ne' la variabile ne' l'app --
//   «Cannot convert argument to a ByteString because the character at index 0
//    has a value of 65279 which is greater than 255»
// E' successo davvero il 26/07/2026 sulla sync ordini: 65279 e' U+FEFF, il BOM
// che si porta dietro un copia-incolla da un file salvato in UTF-8 con BOM. E'
// INVISIBILE, quindi la chiave incollata su Vercel «sembra» giusta e si finisce
// a cercare il problema dalla parte sbagliata (chiave revocata? app giu'?).
// Stessa storia per un a-capo finale o per le virgolette rimaste attaccate
// incollando `CHIAVE="valore"`.
//
// Regola: ogni variabile che finisce in un header o in un URL passa da qui.

// Scritti con la sequenza di escape apposta: messi come caratteri veri sarebbero
// invisibili anche in questo file e nessuno capirebbe cosa fa la riga.
// U+200B..U+200D zero-width, U+FEFF BOM, U+00A0 spazio unificatore.
const INVISIBILI = new RegExp("[\u200B-\u200D\uFEFF\u00A0]", "g");

/** Ripulisce un valore: caratteri invisibili, spazi/a-capo ai bordi, virgolette
 *  di troppo. Torna `undefined` se non resta niente, cosi' `Boolean(...)` sulla
 *  configurazione non si fa ingannare da una variabile fatta di soli spazi. */
export function pulisci(valore: string | undefined | null): string | undefined {
  if (valore == null) return undefined;
  const s = valore
    .replace(INVISIBILI, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  return s || undefined;
}

/** Variabile d'ambiente ripulita. Non lancia mai: usala per i controlli di
 *  «e' configurato?» e per gli URL. */
export function env(nome: string): string | undefined {
  return pulisci(process.env[nome]);
}

/** Variabile d'ambiente destinata a un header HTTP. Come `env`, ma se dopo la
 *  pulizia restano caratteri fuori dall'ASCII stampabile si ferma qui con un
 *  messaggio che dice QUALE variabile e cosa fare -- meglio un errore leggibile
 *  che il ByteString di `fetch`. Il valore non viene mai stampato. */
export function chiave(nome: string): string | undefined {
  const v = env(nome);
  if (v && /[^\x20-\x7E]/.test(v)) {
    throw new Error(
      `${nome} contiene caratteri non validi per un header HTTP: ricopiala dall'app che l'ha emessa, senza formattazione (niente BOM, a-capo o virgolette).`
    );
  }
  return v;
}
