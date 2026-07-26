// **L'anno di competenza si decide qui, e solo qui.**
//
// Finance è il registro di quello che è successo: passa gli importi con la data
// del movimento. A quale *esercizio* appartengano è un'altra domanda — una
// fattura di dicembre pagata a gennaio è costo dell'anno prima — ed è una
// scelta contabile che spetta a questa app (decisione dell'utente, 27/07/2026).
//
// Il meccanismo è volutamente semplice e reversibile: una rettifica dice
// «questo importo, di questa voce, che a Finance risulta nel mese X dell'anno
// A, va letto nel mese Y dell'anno B». Non si tocca il dato di Finance, che
// resta la verità di cassa: si sposta solo la lettura gestionale, e in ogni
// pagina è visibile quanto è stato spostato.
//
// Perché la rettifica porta con sé l'IMPORTO invece di rimandare al dato
// originale: spostare un valore fra due anni obbligherebbe altrimenti a
// interrogare Finance anche sull'anno di origine, a ogni pagina e per ogni
// anno toccato. Con l'importo dentro, il conto di un anno si fa leggendo
// quell'anno più le sue rettifiche, e basta.

import { prisma } from "./db";

export type Rettifica = {
  id: string;
  tipo: "USCITA" | "RICAVO";
  voce: string;
  annoOrigine: number;
  meseOrigine: number;
  annoCompetenza: number;
  meseCompetenza: number;
  importo: number;
  nota: string | null;
};

// Le rettifiche che toccano un anno: quelle che portano via qualcosa da
// quell'anno e quelle che ce lo portano dentro.
export type EffettoAnno = {
  // Per tipo, quanto esce dall'anno (perché è di competenza di un altro) e
  // quanto entra (perché arriva da un altro anno).
  usciteFuori: number;
  usciteDentro: number;
  ricaviFuori: number;
  ricaviDentro: number;
  // Effetto netto mese per mese (12 valori), già col segno giusto.
  usciteMese: number[];
  ricaviMese: number[];
  // Le righe in gioco, per mostrarle senza rifare la query.
  righe: Rettifica[];
};

export async function caricaRettifiche(anno: number): Promise<Rettifica[]> {
  const righe = await prisma.rettificaCompetenza
    .findMany({
      where: { OR: [{ annoOrigine: anno }, { annoCompetenza: anno }] },
      orderBy: [{ annoOrigine: "desc" }, { meseOrigine: "asc" }],
    })
    .catch(() => []);
  return righe.map((r) => ({
    id: r.id,
    tipo: r.tipo === "RICAVO" ? "RICAVO" : "USCITA",
    voce: r.voce,
    annoOrigine: r.annoOrigine,
    meseOrigine: r.meseOrigine,
    annoCompetenza: r.annoCompetenza,
    meseCompetenza: r.meseCompetenza,
    importo: r.importo,
    nota: r.nota,
  }));
}

// L'effetto delle rettifiche su un anno, limitato ai mesi che si stanno
// guardando. Una rettifica che sposta dentro e fuori lo stesso anno (cambio di
// solo mese) si compensa sul totale ma non sui mesi: è voluto.
export function effettoSu(righe: Rettifica[], anno: number, mesi: number[]): EffettoAnno {
  const eff: EffettoAnno = {
    usciteFuori: 0, usciteDentro: 0, ricaviFuori: 0, ricaviDentro: 0,
    usciteMese: Array(12).fill(0), ricaviMese: Array(12).fill(0), righe: [],
  };
  for (const r of righe) {
    const esce = r.annoOrigine === anno && mesi.includes(r.meseOrigine);
    const entra = r.annoCompetenza === anno && mesi.includes(r.meseCompetenza);
    if (!esce && !entra) continue;
    eff.righe.push(r);

    if (esce && !(r.annoCompetenza === anno && r.meseCompetenza === r.meseOrigine)) {
      if (r.tipo === "USCITA") {
        eff.usciteFuori += r.importo;
        eff.usciteMese[r.meseOrigine - 1] -= r.importo;
      } else {
        eff.ricaviFuori += r.importo;
        eff.ricaviMese[r.meseOrigine - 1] -= r.importo;
      }
    }
    if (entra && !(r.annoOrigine === anno && r.meseOrigine === r.meseCompetenza)) {
      if (r.tipo === "USCITA") {
        eff.usciteDentro += r.importo;
        eff.usciteMese[r.meseCompetenza - 1] += r.importo;
      } else {
        eff.ricaviDentro += r.importo;
        eff.ricaviMese[r.meseCompetenza - 1] += r.importo;
      }
    }
  }
  return eff;
}

// Quanto pesa, in totale, sul periodo guardato: serve alle pagine per dire
// «attenzione, questi numeri contengono N rettifiche per X €» invece di
// mostrare un totale corretto di nascosto.
export function quantoSposta(eff: EffettoAnno): { righe: number; uscite: number; ricavi: number } {
  return {
    righe: eff.righe.length,
    uscite: eff.usciteDentro - eff.usciteFuori,
    ricavi: eff.ricaviDentro - eff.ricaviFuori,
  };
}
