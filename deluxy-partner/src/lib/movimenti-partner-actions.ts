"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { registra } from "./registro";

// Scollegare un movimento bancario dalla scheda partner. Due casi distinti,
// perché «scollega» vuol dire cose diverse a seconda di com'è legata la riga:
//
//  1. ATTRIBUITO (partnerId = questo partner): il legame è vero, salvato in
//     riconciliazione. Scollegare = azzerare `partnerId` e rimettere il
//     movimento in coda («nuova»), così torna fra quelli da riconciliare col
//     partner giusto. Non si cancella nulla: il movimento resta, cambia solo a
//     chi è attribuito.
//
//  2. CANDIDATO PER NOME (partnerId = null, mostrato solo perché la controparte
//     contiene il nome del partner — es. «BAR TIFFANY» sotto «Tiffany & Co.»):
//     non è collegato, quindi non c'è un legame da togliere. Qui «scollega»
//     significa «questo NON è di questo partner»: lo si esclude in modo
//     PERSISTENTE da QUESTA scheda (tabella EsclusioneMovimentoPartner), senza
//     toccare lo stato globale del movimento — resta riconciliabile dalle altre
//     app e per il partner vero, sparisce solo da qui.

export async function scollegaMovimentoAttribuito(partnerId: string, movimentoId: string) {
  // Solo se davvero attribuito a QUESTO partner (guardia contro form vecchi).
  const m = await prisma.transazioneBancaria.findUnique({
    where: { id: movimentoId },
    select: { partnerId: true, controparte: true, esito: true },
  });
  if (m?.partnerId === partnerId) {
    await prisma.transazioneBancaria.update({
      where: { id: movimentoId },
      data: {
        partnerId: null,
        stato: "nuova",
        esito: "Scollegato dalla scheda partner: torna da riconciliare.",
      },
    });
    await registra({
      azione: `Movimento scollegato dal partner`,
      categoria: "transazioni", entita: "partner", entitaId: partnerId,
      dettaglio: `Movimento ${movimentoId}${m.controparte ? ` (${m.controparte})` : ""} rimesso in coda`,
    });
  }
  revalidatePath(`/partner/${partnerId}`, "layout");
}

export async function escludiMovimentoDaPartner(partnerId: string, movimentoId: string) {
  // Esclusione persistente SOLO per questa scheda. Idempotente: due clic non
  // fanno due righe. Non tocca lo stato del movimento (resta per gli altri).
  await prisma.$executeRaw`
    INSERT INTO "public"."EsclusioneMovimentoPartner" ("movimentoId","partnerId","motivo")
    VALUES (${movimentoId}, ${partnerId}, 'omonimo — non è questo partner')
    ON CONFLICT ("movimentoId","partnerId") DO NOTHING;`;
  await registra({
    azione: `Movimento escluso dalla scheda partner (omonimo)`,
    categoria: "transazioni", entita: "partner", entitaId: partnerId,
    dettaglio: `Movimento ${movimentoId} non è di questo partner: nascosto da questa scheda`,
  });
  revalidatePath(`/partner/${partnerId}`, "layout");
}

// Annulla un'esclusione: il movimento torna a comparire fra i candidati per
// nome di questa scheda. Toglie solo la riga di esclusione, non tocca il
// movimento.
export async function ripristinaMovimentoEscluso(partnerId: string, movimentoId: string) {
  await prisma.$executeRaw`
    DELETE FROM "public"."EsclusioneMovimentoPartner"
    WHERE "movimentoId" = ${movimentoId} AND "partnerId" = ${partnerId};`;
  await registra({
    azione: `Esclusione movimento annullata`,
    categoria: "transazioni", entita: "partner", entitaId: partnerId,
    dettaglio: `Movimento ${movimentoId} torna fra i candidati per nome della scheda`,
  });
  revalidatePath(`/partner/${partnerId}`, "layout");
}
