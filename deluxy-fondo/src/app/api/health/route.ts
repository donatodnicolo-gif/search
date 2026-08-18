/**
 * Convenzione Deluxy: ogni app espone `/api/health`.
 *
 * Qui «ok» non significa «il processo è vivo»: significa che i dati esistono e sono
 * abbastanza freschi. Uno stato dedotto dalla sola presenza del servizio sarebbe la
 * trappola classica — la pagina dice verde mentre i numeri sono di tre giorni fa.
 */

import { leggiIstantanea, leggiSerie, oreDa } from "@/lib/archivio";
import { TITOLO_GUIDA } from "@/lib/universo";

export const dynamic = "force-dynamic";

/** Oltre questa soglia i dati sono considerati vecchi (weekend compresi). */
const ORE_MASSIME = 72;

export async function GET() {
  const istantanea = await leggiIstantanea();
  const serie = await leggiSerie(TITOLO_GUIDA);
  const ore = oreDa(istantanea?.generataIl ?? null);

  const fontiKo = istantanea?.fonti.filter((f) => f.esito !== "ok") ?? [];
  const problemi: string[] = [];

  if (!istantanea) problemi.push("Nessun aggiornamento mai eseguito.");
  if (!serie || serie.barre.length === 0) problemi.push("Serie storica del titolo guida assente.");
  if (ore !== null && ore > ORE_MASSIME) problemi.push(`Ultimo aggiornamento ${Math.round(ore)} ore fa, oltre la soglia di ${ORE_MASSIME}.`);
  if (fontiKo.length) problemi.push(`${fontiKo.length} fonti non disponibili nell'ultimo giro.`);

  const corpo = {
    ok: problemi.length === 0,
    app: "deluxy-fondo",
    descrizione: "Monitoraggio di aziende in cambio di management",
    ultimoAggiornamento: istantanea?.generataIl ?? null,
    oreDaUltimoAggiornamento: ore === null ? null : Math.round(ore * 10) / 10,
    seduteInArchivio: serie?.barre.length ?? 0,
    ultimaSeduta: serie?.barre.at(-1)?.data ?? null,
    fonti: {
      totali: istantanea?.fonti.length ?? 0,
      riuscite: (istantanea?.fonti.length ?? 0) - fontiKo.length,
      fallite: fontiKo.map((f) => ({ nome: f.nome, messaggio: f.messaggio })),
    },
    problemi,
  };

  // Sempre HTTP 200: un chiamante che legge `ok:false` deve poter vedere anche il dettaglio.
  return Response.json(corpo, { status: 200 });
}
