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

/**
 * La mezzanotte di Roma di un giorno dato in forma «YYYY-MM-DD».
 *
 * Serve ai periodi di calendario (il primo del mese, il primo dell'anno), che
 * non si ricavano contando giorni all'indietro. Si prova l'offset e si verifica
 * col calendario, come in `giornoRoma`: nessuna libreria, nessuna assunzione su
 * quale sia l'ora legale in quel mese.
 */
export function mezzanotteRomaDi(giorno: string): Date {
  for (const offset of ["+02:00", "+01:00"]) {
    const candidata = new Date(`${giorno}T00:00:00${offset}`);
    if (isoRoma(candidata) === giorno) return candidata;
  }
  return new Date(`${giorno}T00:00:00Z`);
}

/**
 * Vero se `s` è un giorno «YYYY-MM-DD» che **esiste** sul calendario.
 *
 * Serve ai campi data scritti dall'utente nell'indirizzo: «2026-02-30» ha la
 * forma giusta ma non è un giorno, e `new Date` lo accetterebbe spostandolo
 * al 2 marzo senza dirlo.
 */
export function isoGiornoValido(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * La mezzanotte di Roma dello **stesso giorno del calendario, un anno prima**.
 *
 * È il metro del confronto «stesso periodo dell'anno scorso»: il 4 settembre
 * 2026 si confronta col 4 settembre 2025, non con 365 giorni prima (che dopo un
 * anno bisestile è il 5). Il 29 febbraio, che l'anno prima non esiste, cade sul
 * 28.
 */
export function annoPrimaRoma(d: Date): Date {
  const [anno, mese, giorno] = isoRoma(d).split("-");
  const candidato = `${Number(anno) - 1}-${mese}-${giorno}`;
  return mezzanotteRomaDi(isoGiornoValido(candidato) ? candidato : `${Number(anno) - 1}-${mese}-28`);
}

/** La mezzanotte di Roma del **primo giorno del mese** in cui cade `d`. */
export function primoDelMeseRoma(d: Date): Date {
  return mezzanotteRomaDi(`${isoRoma(d).slice(0, 7)}-01`);
}

/** La mezzanotte di Roma del **primo giorno dell'anno** in cui cade `d`. */
export function primoDellAnnoRoma(d: Date): Date {
  return mezzanotteRomaDi(`${isoRoma(d).slice(0, 4)}-01-01`);
}

// I formattatori delle pagine: SEMPRE col fuso dichiarato. Un
// `toLocaleDateString("it-IT")` senza timeZone su Vercel mostra il giorno UTC:
// una vetrina curata alle 00:30 risultava «modificata ieri».
export function dataIt(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });
}

/**
 * Un intervallo di date in una riga sola.
 *
 * L'anno si scrive **una volta** quando i due estremi cadono nello stesso anno
 * («20/05 → 17/08/2026») e su **entrambi** quando cambia («18/08/2025 →
 * 17/08/2026»). Non è vezzo tipografico: il periodo «ultimo anno» scavalca il
 * capodanno, e lì l'anno è proprio l'informazione che distingue le due date —
 * mentre dentro lo stesso anno ripeterlo raddoppia la riga senza dire niente.
 */
export function intervalloIt(dal: Date, al: Date): string {
  if (giornoMeseRoma(dal).anno !== giornoMeseRoma(al).anno) return `${dataIt(dal)} → ${dataIt(al)}`;
  const senzaAnno = dal.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: FUSO });
  return `${senzaAnno} → ${dataIt(al)}`;
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
