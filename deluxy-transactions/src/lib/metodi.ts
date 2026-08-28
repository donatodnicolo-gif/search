// I metodi con cui si può CHIEDERE un pagamento — e le regole che li validano.
//
// Sta in un file senza import (come metodi-fuori.ts) perché lo leggono due
// mondi: i componenti nel browser (che disegnano il select) e il server (che
// rifiuta ciò che non torna). Le regole sono le stesse del Customer Service
// (deluxy-messaging/src/lib/metodo-pagamento.ts), ma QUI sono legge server:
// qualunque chiamante API passa da questi controlli, non solo la UI.
//
// La regola che conta: "iban" è l'UNICO metodo che le vie automatiche
// (distinta SEPA, bonifico Qonto) sanno eseguire. Gli altri si chiudono solo a
// mano («pagata fuori dall'app»): l'automazione dichiara «pagata» soltanto ciò
// di cui possiede la prova d'esecuzione.

export const METODI: Record<string, string> = {
  iban: "Bonifico (IBAN)",
  link: "Link di pagamento",
  paypal: "PayPal",
  carta: "Carta da remoto",
  altro: "Altro accordo",
};

export const AIUTO_METODO: Record<string, string> = {
  iban: "L'unico metodo che l'app sa eseguire da sola (distinta o banca).",
  link: "Un indirizzo web dove pagare. Si paga a mano e si registra qui.",
  paypal: "Indirizzo email o @nome PayPal. Si paga a mano e si registra qui.",
  carta: "La NOSTRA carta usata al telefono o sul sito del beneficiario. Mai scrivere il numero della carta.",
  altro: "Contanti alla consegna, compensazione, accordo a voce: descrivilo.",
};

export const SEGNAPOSTO_METODO: Record<string, string> = {
  link: "https://…",
  paypal: "nome@esempio.com oppure @nome",
  carta: "es. «carta aziendale al telefono, chiedere di Marco»",
  altro: "es. «contanti alla consegna al corriere»",
};

export function metodoValido(metodo: string): boolean {
  return Object.prototype.hasOwnProperty.call(METODI, metodo);
}

/** true se il metodo può entrare in distinta SEPA / bonifico Qonto. */
export function metodoAutomatizzabile(metodo: string): boolean {
  return metodo === "iban";
}

/**
 * Riconosce un numero di carta di pagamento nel testo, per FORMA (13-19 cifre
 * contigue che passano Luhn), non per nome del campo. Un PAN non deve mai
 * finire in chiaro nel Postgres condiviso né negli avvisi.
 */
export function numeroDiCartaNelTesto(testo: string): boolean {
  const sequenze = (testo ?? "").match(/(?:\d[ -]?){13,19}/g);
  if (!sequenze) return false;
  for (const s of sequenze) {
    const cifre = s.replace(/[ -]/g, "");
    if (cifre.length < 13 || cifre.length > 19) continue;
    let somma = 0;
    let doppia = false;
    for (let i = cifre.length - 1; i >= 0; i--) {
      let n = Number(cifre[i]);
      if (doppia) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      somma += n;
      doppia = !doppia;
    }
    if (somma % 10 === 0) return true;
  }
  return false;
}

/** Solo http/https: mai un javascript: o un data: travestito da link. */
export function linkSicuro(testo: string): boolean {
  try {
    const url = new URL(testo);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Valida la coppia (metodo, riferimentoPagamento). Torna il messaggio di
 * errore, o null se va bene. L'IBAN lo valida chi chiama (ha già la sua
 * libreria con il mod-97): qui si decide solo SE serve.
 */
export function validaMetodo(
  metodo: string,
  dati: { iban: string; riferimentoPagamento: string },
): string | null {
  if (!metodoValido(metodo)) {
    return `Metodo di pagamento sconosciuto: ammessi ${Object.keys(METODI).join(", ")}.`;
  }
  const rif = (dati.riferimentoPagamento ?? "").trim();

  if (metodo === "iban") {
    if (!dati.iban) return "IBAN obbligatorio per il metodo «bonifico».";
    return null;
  }

  // Non-IBAN: il riferimento è ciò che permette di pagare.
  if (metodo !== "carta" && !rif) {
    return `Per il metodo «${METODI[metodo]}» serve il riferimento di pagamento (dove/come pagare).`;
  }
  if (rif.length > 500) return "Riferimento di pagamento troppo lungo (max 500 caratteri).";
  if (numeroDiCartaNelTesto(rif)) {
    return "Il riferimento contiene quello che sembra un numero di carta: non si scrive mai. Descrivi la carta senza il numero.";
  }
  if (metodo === "link" && !linkSicuro(rif)) {
    return "Il link di pagamento deve essere un indirizzo completo che comincia con https:// (o http://).";
  }
  return null;
}
