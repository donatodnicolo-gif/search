import { prisma } from "@/lib/db";

// Il censimento delle keyword NEGATIVE, e la sola cosa che serve saperne
// altrove: quando un account ha finito di dichiararle tutte.
//
// ⚠️⚠️ PERCHÉ UNA DATA A PARTE, invece di guardare l'ultima consegna.
// Le righe arrivano a blocchi, e lo script si ferma a metà quando Google sta
// per scadere: «interrotto per tempo» è un esito NORMALE, scritto apposta.
// Una consegna esiste anche allora — quindi «è arrivato un giro dopo
// l'esecuzione» non vuol dire «l'elenco era completo». Chi legge un elenco
// troncato come completo conclude che le parole rimaste fuori non sono più su
// Google: accusa di un guasto un giro semplicemente lento, e lo fa su tutte
// insieme. Il marcatore lo manda lo script SOLO quando ha spedito tutto.
export const CHIAVE_CENSIMENTO = "negative.censimento.";

/** Quando ogni account ha dichiarato un censimento COMPLETO delle negative. */
export async function censimentiCompleti(conti: string[]): Promise<Map<string, Date>> {
  if (conti.length === 0) return new Map();
  const righe = await prisma.impostazione.findMany({
    where: { chiave: { in: conti.map((c) => `${CHIAVE_CENSIMENTO}${c}`) } },
    select: { chiave: true, valore: true },
  });
  const mappa = new Map<string, Date>();
  for (const r of righe) {
    const quando = new Date(r.valore);
    if (!isNaN(quando.getTime())) mappa.set(r.chiave.slice(CHIAVE_CENSIMENTO.length), quando);
  }
  return mappa;
}
