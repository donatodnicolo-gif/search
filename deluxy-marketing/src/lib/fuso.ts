// I confini dei giorni e dei mesi, in ORA DI ROMA.
//
// ⚠️⚠️ PERCHÉ ESISTE. Su Vercel il runtime è **UTC**: `new Date()` lato server
// non dice che ora è in Italia, e `new Date(anno, mese - 1, 1)` non costruisce
// la mezzanotte italiana ma quella di Greenwich — cioè **le 02:00 di Roma**
// d'estate, l'01:00 d'inverno. Le conseguenze non sono teoriche, sono state
// misurate su agosto 2026:
//
//  · gli ordini fra le 00:00 e le 02:00 del **primo del mese** finivano fuori
//    dal mese (1 ordine, 135 €: non contato da nessuna parte);
//  · quelli fra le 00:00 e le 02:00 di **oggi** entravano dentro il conto dei
//    giorni «già conclusi» (1 ordine, 130 €), cioè dentro un giorno che la
//    stessa pagina dichiarava non concluso;
//  · e per due ore ogni notte «che giorno è» era il giorno prima, quindi il
//    primo settembre alle 00:30 la dashboard mostrava ancora agosto.
//
// In euro sono spiccioli. Ma è la REGOLA a essere sbagliata: il risultato
// cambia con l'ora in cui si guarda, e un numero che cambia da solo non si può
// usare per decidere. Niente librerie: basta `Intl`, che il fuso lo sa già
// (compreso il cambio dell'ora legale, che non va indovinato).

const FUSO = "Europe/Rome";

const PEZZI = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function leggiARoma(istante: Date) {
  const p = Object.fromEntries(PEZZI.formatToParts(istante).map((x) => [x.type, x.value]));
  return {
    anno: Number(p.year),
    mese: Number(p.month),
    giorno: Number(p.day),
    // `Intl` restituisce "24" per la mezzanotte, non "00".
    ora: Number(p.hour) % 24,
    minuti: Number(p.minute),
    secondi: Number(p.second),
  };
}

/** Di quanti minuti Roma è avanti su UTC in quell'istante (60 d'inverno, 120 d'estate). */
function scartoRoma(istante: Date): number {
  const r = leggiARoma(istante);
  const comeSeFosseUtc = Date.UTC(r.anno, r.mese - 1, r.giorno, r.ora, r.minuti, r.secondi);
  return (comeSeFosseUtc - Math.floor(istante.getTime() / 1000) * 1000) / 60_000;
}

/**
 * L'istante esatto della mezzanotte italiana di quel giorno.
 *
 * ⚠️ Lo scarto si calcola DUE volte: la prima con un'ipotesi (l'istante UTC
 * dello stesso orologio), la seconda sul risultato. Nelle due notti del cambio
 * d'ora la prima ipotesi cade dalla parte sbagliata del salto, e senza il
 * secondo giro la «mezzanotte» sarebbe l'01:00 o le 23:00 del giorno prima.
 */
export function mezzanotteRoma(anno: number, mese: number, giorno: number): Date {
  const ipotesi = new Date(Date.UTC(anno, mese - 1, giorno, 0, 0, 0));
  const primo = new Date(ipotesi.getTime() - scartoRoma(ipotesi) * 60_000);
  const secondo = scartoRoma(primo);
  return new Date(ipotesi.getTime() - secondo * 60_000);
}

/** Che giorno è ADESSO in Italia — non sul server. */
export function oggiRoma(): { anno: number; mese: number; giorno: number } {
  const r = leggiARoma(new Date());
  return { anno: r.anno, mese: r.mese, giorno: r.giorno };
}

/** Il primo del mese e il primo del mese dopo, a mezzanotte italiana. */
export function confiniMeseRoma(anno: number, mese: number): { inizio: Date; fine: Date } {
  return {
    inizio: mezzanotteRoma(anno, mese, 1),
    fine: mezzanotteRoma(mese === 12 ? anno + 1 : anno, mese === 12 ? 1 : mese + 1, 1),
  };
}

/**
 * L'orologio ITALIANO di un istante: data di calendario, ora, e giorno della
 * settimana (0=domenica … 6=sabato) come li vive chi lavora — non il server.
 * Nato per guardrail (slot del lunedì, avviso weekend), che usava getDay()
 * e getHours() del runtime, cioè UTC su Vercel.
 */
export function orologioRoma(istante: Date): {
  anno: number; mese: number; giorno: number; ora: number; minuti: number; giornoSettimana: number;
} {
  const r = leggiARoma(istante);
  // Il giorno della settimana della DATA italiana: la stessa data letta come
  // UTC ha lo stesso weekday, senza altri giri di fuso.
  const giornoSettimana = new Date(Date.UTC(r.anno, r.mese - 1, r.giorno)).getUTCDay();
  return { anno: r.anno, mese: r.mese, giorno: r.giorno, ora: r.ora, minuti: r.minuti, giornoSettimana };
}

/** Il giorno di calendario ITALIANO, come stringa ordinabile "YYYY-MM-DD". */
export function giornoRoma(istante: Date): string {
  const r = leggiARoma(istante);
  return `${r.anno}-${String(r.mese).padStart(2, "0")}-${String(r.giorno).padStart(2, "0")}`;
}

/**
 * L'istante esatto di un ORARIO italiano di quel giorno (es. le 9:30).
 * Doppio giro di scarto come in `mezzanotteRoma`, per le notti del cambio d'ora.
 */
export function orarioRoma(anno: number, mese: number, giorno: number, ora: number, minuti: number): Date {
  const ipotesi = new Date(Date.UTC(anno, mese - 1, giorno, ora, minuti, 0));
  const primo = new Date(ipotesi.getTime() - scartoRoma(ipotesi) * 60_000);
  return new Date(ipotesi.getTime() - scartoRoma(primo) * 60_000);
}
