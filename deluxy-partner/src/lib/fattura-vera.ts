// UNA FATTURA È VERA SOLO SE ESISTE SU FATTURE IN CLOUD.
//
// Regola dell'utente (04/09/2026): «se non ci sono fatture in Fatture in Cloud
// non è una fattura vera: diventa vera solo quella in FIC, quindi nella scheda
// partner non deve apparire».
//
// Il caso: GIADA CAKE, luglio 2026, «Fee affiliazione Deluxy» di 450 € scritta
// a mano in Finance il 03/08. Su FIC quella fattura non c'è (cercata fra le
// emesse 2026: nessun cliente «giada»). La scheda però la mostrava come 549 €
// «da incassare» — un credito che nessun documento sostiene, e che nessuno
// avrebbe mai sollecitato perché la riga è anche senza scadenza.
//
// COME SI RICONOSCE. Il segno che il documento esiste è il **numero**: lo
// scrive l'import da FIC, e chi registra a mano lo copia dalla fattura vera.
// Una riga senza numero non ha un documento dietro. Chiedere a FIC riga per
// riga, a ogni apertura di scheda, sarebbe una chiamata di rete per ogni
// fattura di ogni mese: il numero è la prova che abbiamo in casa.
// ⚠️ Il rovescio: una fattura emessa su FIC di cui NON è stato scritto il
// numero qui sparisce dai conti. È il prezzo della regola, ed è il verso
// giusto in cui sbagliare — meglio non vantare un credito che non esiste che
// vantarne uno inventato.
//
// ⚠️ ECCEZIONE, LO STORICO DEL FOGLIO. Le righe che nascono da
// «Import PARTNER.xlsx» sono i **totali mensili del vecchio registro** (111 nel
// 2025, 4 nel 2026), non fatture mai emesse: sono la base del confronto anno su
// anno e quasi tutte risultano già pagate. Toglierle svuoterebbe la colonna
// 2025 delle schede. Restano, e restano dichiarate qui: se anche quelle devono
// sparire, si cancella la penultima riga di questa funzione e nient'altro.
//
// ⚠️ PERCHÉ IL GIUDIZIO È IN MEMORIA E NON UN `where` DI PRISMA. Provato: un
// `where` con `OR` di `contains` sul numero e il suo `NOT` **non tornano** su
// una colonna che può essere NULL — in SQL `NULL LIKE '%1%'` non è falso, è
// NULL, e `NOT (NULL)` non è vero: le righe senza numero sparivano da tutte e
// due le liste (filtro «vere» 624 su 624, «tenute fuori» 0). Le fatture di un
// anno sono già tutte in memoria per il riepilogo: si filtrano qui, con UNA
// funzione sola, e non c'è modo che il conto e l'elenco si contraddicano.

/** Ha un documento vero dietro? */
export function eFatturaVera(f: { numero: string | null; descrizione: string | null }): boolean {
  if (f.numero && /\d/.test(f.numero)) return true;
  return (f.descrizione ?? "").startsWith("Import PARTNER.xlsx");
}

/** Divide le fatture in quelle che contano e quelle senza documento. */
export function separaFattureVere<T extends { numero: string | null; descrizione: string | null }>(
  righe: T[]
): { vere: T[]; nonEmesse: T[] } {
  const vere: T[] = [];
  const nonEmesse: T[] = [];
  for (const f of righe) (eFatturaVera(f) ? vere : nonEmesse).push(f);
  return { vere, nonEmesse };
}
