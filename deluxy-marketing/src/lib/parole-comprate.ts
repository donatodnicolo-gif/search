import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { testoKeywordPulito } from "@/lib/dominio";

// «Quali campagne hanno GIÀ questa parola» — in una lettura sola, condivisa e
// con una cache breve.
//
// ⚠️⚠️ **PERCHÉ ESISTE (08/09/2026).** Due pagine leggevano la tabella
// `CopyAnnuncio` **intera** — `where tipo: "keyword"`, nessun filtro di
// campagna, nessun `take` — a ogni apertura: `components/TerminiRicerca.tsx`
// (scheda campagna) e `app/gruppi/[id]/page.tsx` (scheda gruppo). Serviva a
// nascondere «Aggiungi» dove la parola c'è già.
//
// Misurato sul database di produzione:
//   · `CopyAnnuncio`: **seq_scan 629.999** su 38.334 righe — contro 243 della
//     seconda tabella in classifica e 196 di `NegativaCampagna`, che di righe
//     ne ha 92.760. Tre ordini di grandezza sopra tutto il resto.
//   · il piano: `Seq Scan … Buffers: shared hit=1754 … Execution Time 16.780 ms`.
//
// ⚠️ **E l'indice NON è la risposta**, misurato prima di proporlo: `tipo =
// 'keyword'` è il **58% della tabella** (22.157 righe su 38.334), quindi il
// planner sceglie giustamente la scansione sequenziale e un btree su `tipo`
// non verrebbe mai usato — resterebbe solo da aggiornare a ogni import. La
// query non è lenta (16,8 ms, tutti da `shared hit`): è **ripetuta**.
//
// Quindi si cachea. Il dato cambia **quando gira l'import**, cioè una volta al
// giorno per conto: che per qualche minuto dica «questa parola non ce l'hai»
// mezzo minuto dopo che è arrivata non cambia niente — e comunque mettere in
// coda un'operazione NON scrive in `CopyAnnuncio`: lì ci scrive solo l'import,
// dopo che lo script ha eseguito. Non esiste un caso in cui l'utente fa una
// cosa e questa cache gli mente su quello che ha appena fatto.
//
// ⚠️ Si cachea il DATO, non la pagina: le pagine restano `force-dynamic`.
// Stessa scelta dei conteggi della sidebar.

/** Cinque minuti: l'import gira una volta al giorno, il resto è navigazione. */
const TTL_SECONDI = 300;

/**
 * Mappa `parola ripulita` → nomi delle campagne che la comprano già.
 *
 * ⚠️ Il confronto è sul testo RIPULITO: «consegna fiori milano (phrase)» e
 * «consegna fiori milano (match esatto)» sono la stessa parola arrivata da due
 * import diversi, e trattarle come due parole diverse faceva comparire
 * «Aggiungi» su una keyword che c'era già — cioè un duplicato che Google
 * rifiuta.
 */
const leggi = async (): Promise<Record<string, string[]>> => {
  const righe = await prisma.copyAnnuncio.findMany({
    where: { tipo: "keyword" },
    select: { testo: true, campagna: true },
  });
  const per: Record<string, string[]> = {};
  for (const k of righe) {
    const chiave = testoKeywordPulito(k.testo).toLowerCase();
    const v = (per[chiave] ??= []);
    if (!v.includes(k.campagna)) v.push(k.campagna);
  }
  return per;
};

const paroleComprateCache = unstable_cache(leggi, ["parole-comprate"], {
  revalidate: TTL_SECONDI,
  tags: ["parole-comprate"],
});

/**
 * La funzione `giaSuDi` pronta da usare in pagina: dato il testo di una
 * ricerca, i nomi delle campagne che quella parola ce l'hanno già.
 *
 * Una lettura per richiesta invece di una per riquadro, e la lettura è cachata.
 */
export async function paroleGiaComprate(): Promise<(testo: string) => string[]> {
  const per = await paroleComprateCache();
  return (testo: string) => per[testoKeywordPulito(testo).toLowerCase()] ?? [];
}
