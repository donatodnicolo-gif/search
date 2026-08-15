// **Il calendario dell'app è quello italiano.**
//
// Il codice gira in due fusi diversi — il PC di sviluppo (Europe/Rome) e Vercel
// (UTC) — ma il giorno di una vendita, i confini di una finestra («ultimi 28
// giorni») e le etichette delle serie devono essere gli stessi ovunque: Deluxy
// vende in Italia, e «oggi» è l'oggi di Roma. Senza questo helper ogni
// `setHours(0,0,0,0)`, `getDate()` o `toLocaleDateString()` senza timeZone
// racconta un giorno diverso a seconda di dove gira — è già successo con la
// data di freschezza del venduto («fermi a ieri» in produzione, «di oggi» in
// locale) e con gli ordini delle 00:00–02:00 salvati nel giorno sbagliato.

const FUSO = "Europe/Rome";

// sv-SE dà "YYYY-MM-DD", il formato che si riordina e si confronta da solo.
const formatoGiorno = new Intl.DateTimeFormat("sv-SE", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" del momento dato, nel calendario di Roma. */
export function isoRoma(d: Date): string {
  return formatoGiorno.format(d);
}

/**
 * La **mezzanotte di Roma** del giorno in cui cade il momento dato, come Date.
 *
 * È il valore che si salva su `Vendita.data`: un punto nel tempo preciso e
 * uguale ovunque, ricavato dal giorno italiano. (Roma è UTC+1 o UTC+2: si
 * prova l'offset e si verifica col calendario, senza librerie esterne.)
 */
export function giornoRoma(d: Date): Date {
  const giorno = isoRoma(d); // es. "2026-08-15"
  for (const offset of ["+02:00", "+01:00"]) {
    const candidata = new Date(`${giorno}T00:00:00${offset}`);
    if (isoRoma(candidata) === giorno) return candidata;
  }
  // Irraggiungibile con i due offset di Roma; il fallback resta onesto.
  return new Date(`${giorno}T00:00:00Z`);
}

/** Numero del giorno e mese (1-12) nel calendario di Roma, per le etichette. */
export function giornoMeseRoma(d: Date): { giorno: number; mese: number; anno: number } {
  const [anno, mese, giorno] = isoRoma(d).split("-").map(Number);
  return { giorno, mese, anno };
}

/**
 * La mezzanotte di Roma **n giorni dopo** (o prima, con n negativo) il giorno
 * in cui cade `d`. Non si somma `n × 24h` e basta: nei giorni del cambio d'ora
 * il giorno italiano dura 23 o 25 ore, e l'aritmetica in millisecondi sposterebbe
 * il calendario di un'ora — qui si passa dal **mezzogiorno** del giorno
 * bersaglio, che resta nel giorno giusto con qualunque deriva di ±1h.
 */
export function sommaGiorniRoma(d: Date, n: number): Date {
  const mezzanotte = giornoRoma(d);
  const versoIlBersaglio = new Date(mezzanotte.getTime() + (n * 24 + 12) * 60 * 60 * 1000);
  return giornoRoma(versoIlBersaglio);
}

// I formattatori delle pagine: SEMPRE col fuso dichiarato. Un
// `toLocaleDateString("it-IT")` senza timeZone su Vercel mostra il giorno UTC:
// una vetrina curata alle 00:30 risultava «modificata ieri».
export function dataIt(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });
}

export function dataOraIt(d: Date): string {
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}
