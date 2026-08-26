// COME SI LEGGE UN IMPORTO SCRITTO A MANO, una volta sola (27/08/2026).
//
// In italiano «1.500,50» vale millecinquecento e cinquanta: il punto separa le
// migliaia, la virgola i decimali. In JavaScript `Number('1.500,50')` non è un
// numero, e `Number('1.500')` vale UNO VIRGOLA CINQUE.
//
// Questa regola era ricopiata in cinque schermate, e in tre era sbagliata in
// due modi diversi:
//   · Pagamenti toglieva tutto tranne il punto, quindi «1.500» diventava 1,50 €
//     — una richiesta di pagamento da millecinquecento euro partiva al cliente
//     per un euro e mezzo, e un incasso registrato così azzerava il saldo;
//   · Trattative toglieva ANCHE il punto e la virgola, quindi «1.500,50»
//     diventava 150050, cento volte tanto. Peggio: il campo si riapre
//     precompilato col valore del database, e bastava salvare senza toccarlo.
// Cinque copie divergono alla prima distrazione: qui la regola sta scritta una
// volta, ed è provata dai test (`__tests__/importi.test.ts`).
//
// ⚠️ Chi non capisce NON inventa: torna `null`, non 0. Zero è un numero, e vuol
// dire «venduto a niente»; `null` vuol dire «non lo so», ed è la sola risposta
// onesta davanti a «milleecinquecento».

/**
 * Legge un importo all'italiana. Torna `null` se non c'è un numero da leggere.
 *
 * Accetta il simbolo dell'euro, gli spazi (anche quelli unificatori che arrivano
 * dal copia-incolla di WhatsApp e delle mail) e la scrittura senza separatori.
 * Accetta anche il punto decimale «all'inglese» quando è chiaramente tale
 * («1500.5»), perché è la forma in cui il DATABASE restituisce i suoi numeri e
 * in cui l'app riapre i propri campi.
 */
export function leggiImporto(v: string | null | undefined): number | null {
  if (v == null) return null;
  // Via il simbolo, le lettere e ogni specie di spazio: resta la scrittura del
  // numero. ` ` e ` ` sono gli spazi unificatori del copia-incolla.
  const grezzo = String(v).replace(/[^\d.,-]/g, '').trim();
  if (!grezzo) return null;

  const punto = grezzo.lastIndexOf('.');
  const virgola = grezzo.lastIndexOf(',');
  let normale: string;
  if (virgola >= 0) {
    // C'è una virgola: è lei il separatore decimale, e i punti sono migliaia.
    // «1.500,50» → «1500.50»; «1500,50» → «1500.50».
    normale = grezzo.replace(/\./g, '').replace(',', '.');
    // Una seconda virgola non è un numero: «1,5,3» non si indovina.
    if (normale.indexOf(',') >= 0) return null;
  } else if (punto >= 0) {
    // Solo punti. Sono migliaia o è un decimale?
    //   · più di un punto → migliaia di sicuro: «1.234.567»
    //   · esattamente tre cifre dopo l'ultimo punto → migliaia: «1.500»
    //   · altrimenti è un decimale: «1500.5», «12.75»
    const cifreDopo = grezzo.length - punto - 1;
    const piuDiUno = grezzo.indexOf('.') !== punto;
    normale = piuDiUno || cifreDopo === 3 ? grezzo.replace(/\./g, '') : grezzo;
  } else {
    normale = grezzo;
  }

  const n = Number(normale);
  return Number.isFinite(n) ? n : null;
}

/**
 * Come sopra, ma per i campi dove un importo a zero o negativo non ha senso
 * (un prezzo, una richiesta di pagamento): torna `null` anche per quelli.
 */
export function leggiImportoPositivo(v: string | null | undefined): number | null {
  const n = leggiImporto(v);
  return n != null && n > 0 ? n : null;
}

/**
 * Riscrive un numero nella forma in cui va rimesso dentro un campo da
 * correggere: «1500.5» → «1500,5». ⚠️ Senza i punti delle migliaia, perché
 * quella è la forma che si rilegge senza ambiguità (e che l'utente può
 * cancellare a metà senza cambiare l'ordine di grandezza).
 */
export function scriviImporto(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}
