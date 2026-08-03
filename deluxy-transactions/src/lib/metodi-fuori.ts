// Come può essere uscito il denaro quando NON è uscito da questa app.
//
// Sta in un file suo, senza niente intorno, perché lo leggono due mondi: il
// modulo nel browser (che disegna le voci) e il controllo sul server (che
// rifiuta tutto ciò che non è in questo elenco). Se stesse dentro
// `lib/richieste.ts`, importarlo da un componente client tirerebbe dentro al
// browser anche Prisma.
export const METODI_FUORI: Record<string, string> = {
  bonifico_banca: "bonifico fatto a mano dal portale della banca",
  addebito: "addebito diretto sul conto",
  carta: "carta di credito o prepagata",
  contanti: "contanti o assegno",
  compensazione: "compensata con un credito verso lo stesso beneficiario",
  altro: "altro",
};
