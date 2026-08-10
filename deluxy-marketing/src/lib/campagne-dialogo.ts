import { prisma } from "@/lib/db";
import { cittaDaTesto } from "@/lib/citta";
import { STATI_GRUPPO_IGNORATI } from "@/lib/gruppi";
import { linguaDaNome } from "@/lib/vendite-campagna";
import type { CampagnaScelta } from "@/components/PortaKeyword";

// Le campagne fra cui scegliere nel dialogo «Porta su altre campagne», con
// lingua, città e gruppi di annunci: la stessa pipeline della pagina Keywords,
// per le pagine che montano il dialogo senza avere già le campagne in mano.
//
// Solo le VIVE (`stato: "attiva"`, che qui è il fatto scritto dall'import, non
// un giudizio): portare una keyword su una campagna ferma la lascerebbe lì a
// non comparire finché qualcuno non riaccende la campagna.
//
// ⚠️ Il tipo arriva da un componente client, ma è un `import type`: sparisce
// alla compilazione. Importare da qui un VALORE di quel modulo trascinerebbe
// "use client" dentro il server — la trappola già pagata il 04/08.
export async function campagnePerDialogo(): Promise<CampagnaScelta[]> {
  const vive = await prisma.campagna.findMany({
    where: { canale: "google_ads", stato: "attiva" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, classe: true },
  });
  // I gruppi di annunci, in UNA query per tutte: servono al dialogo per far
  // scegliere DOVE finisce la keyword. Senza, lo script la infila nel primo
  // gruppo attivo che incontra.
  const gruppi = await prisma.gruppo.findMany({
    where: {
      campagnaId: { in: vive.map((c) => c.id) },
      stato: { notIn: [...STATI_GRUPPO_IGNORATI] },
    },
    orderBy: { nome: "asc" },
    select: { campagnaId: true, nome: true },
  });
  const perCampagna = new Map<string, string[]>();
  for (const g of gruppi) {
    const lista = perCampagna.get(g.campagnaId) ?? [];
    lista.push(g.nome);
    perCampagna.set(g.campagnaId, lista);
  }
  return vive.map((c) => ({
    ...c,
    lingua: linguaDaNome(c.nome),
    citta: cittaDaTesto(c.nome),
    gruppi: perCampagna.get(c.id) ?? [],
  }));
}
