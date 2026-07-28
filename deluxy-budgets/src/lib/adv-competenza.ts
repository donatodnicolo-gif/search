// **La pubblicità pagata dal conto che non è pubblicità di quest'anno.**
//
// Da quando la riga ADV del conto economico è la spesa delle campagne
// (Marketing), la banca resta con un numero più alto: nel 2026, 91.224 € usciti
// contro 51.388 € di campagne. Regola dell'utente (28/07/2026): *tutto ciò che
// è banca pubblicità e non è pari a quest'anno va in competenza nell'anno di
// transizione* — cioè l'eccedenza è pubblicità di un altro esercizio, e va
// letta là.
//
// Qui si calcola la differenza mese per mese e si **propone** la rettifica. Non
// si crea niente da soli, per due motivi:
//  1. una rettifica scrive nei conti di due anni, e in questa app le cose che
//     cambiano un bilancio si confermano a mano;
//  2. la differenza **non è per forza competenza**. Misurata oggi, sta su tutti
//     i mesi in proporzione costante (la banca è circa 1,7× le campagne da
//     gennaio a luglio), e uno sfasamento di fatturazione si vedrebbe invece
//     concentrato sul primo mese. La causa più probabile è che a Marketing
//     manchino account — Meta ha dati solo da fine giugno. La pagina lo dice, e
//     poi lascia decidere: spostare 40.000 € su un altro esercizio è una scelta
//     contabile, non un calcolo.
//
// L'attribuzione è **proporzionale alle controparti vere** di quel mese: una
// rettifica deve poter nominare da quale addebito viene, altrimenti nel CFO
// resta un importo senza categoria che non entra in nessuna voce di P&L.

import { fetchSpeseBanca } from "./finance";
import { caricaCategorie, categoriaDi } from "./cfo";
import { fetchSpesaAdv } from "./marketing";
import { caricaRettifiche } from "./competenza";

export type MeseAdv = {
  mese: number;
  banca: number;
  campagne: number;
  differenza: number; // banca − campagne, mai sotto zero
  giaSpostato: number; // rettifiche ADV già create con origine in questo mese
};

export type RiconciliazioneAdv = {
  ok: boolean;
  errore: string | null;
  anno: number;
  mesi: MeseAdv[];
  totBanca: number;
  totCampagne: number;
  totDifferenza: number;
  totGiaSpostato: number;
  coperturaCompleta: boolean;
  avvertenze: string[];
  // Le controparti ADV con il loro dettaglio mensile: servono per attribuire.
  controparti: { nome: string; perMese: number[] }[];
};

export async function riconciliaAdv(anno: number): Promise<RiconciliazioneAdv> {
  const vuota: RiconciliazioneAdv = {
    ok: false, errore: null, anno, mesi: [], totBanca: 0, totCampagne: 0,
    totDifferenza: 0, totGiaSpostato: 0, coperturaCompleta: false, avvertenze: [], controparti: [],
  };

  const [spese, categorie, campagne, rettifiche] = await Promise.all([
    fetchSpeseBanca({ anno, dal: 1, al: 12 }),
    caricaCategorie(),
    fetchSpesaAdv(anno, 1, 12),
    caricaRettifiche(anno),
  ]);

  if (!spese.ok) return { ...vuota, errore: `uscite di banca non disponibili (${spese.errore})` };
  if (!campagne.ok) return { ...vuota, errore: `spesa campagne non disponibile (${campagne.errore})` };

  const controparti = spese.dati.controparti
    .filter((c) => categoriaDi(c.controparte, categorie)?.tipoPL === "ADV" && c.uscite > 0)
    .map((c) => ({ nome: c.controparte, perMese: c.perMese.slice(0, 12) }));

  // Quello che da questo anno è già stato portato altrove sulla pubblicità: si
  // scala dalla differenza, altrimenti premendo due volte il bottone si
  // sposterebbe due volte lo stesso importo.
  const giaMese = Array(12).fill(0) as number[];
  for (const r of rettifiche) {
    if (r.tipo !== "USCITA" || r.annoOrigine !== anno || r.annoCompetenza === anno) continue;
    if (categoriaDi(r.voce, categorie)?.tipoPL !== "ADV") continue;
    giaMese[r.meseOrigine - 1] += r.importo;
  }

  const mesi: MeseAdv[] = [];
  for (let m = 1; m <= 12; m++) {
    const banca = controparti.reduce((s, c) => s + (c.perMese[m - 1] ?? 0), 0);
    const camp = campagne.dati.mese[m - 1] ?? 0;
    const gia = giaMese[m - 1];
    mesi.push({
      mese: m,
      banca,
      campagne: camp,
      differenza: Math.max(0, banca - camp - gia),
      giaSpostato: gia,
    });
  }

  const somma = (f: (x: MeseAdv) => number) => mesi.reduce((s, x) => s + f(x), 0);
  return {
    ok: true,
    errore: null,
    anno,
    mesi,
    totBanca: somma((x) => x.banca),
    totCampagne: somma((x) => x.campagne),
    totDifferenza: somma((x) => x.differenza),
    totGiaSpostato: somma((x) => x.giaSpostato),
    coperturaCompleta: campagne.dati.copertura.completa,
    avvertenze: campagne.dati.copertura.avvertenze,
    controparti,
  };
}

export type RettificaDaCreare = {
  tipo: "USCITA";
  voce: string;
  annoOrigine: number;
  meseOrigine: number;
  annoCompetenza: number;
  meseCompetenza: number;
  importo: number;
  nota: string;
};

// Le rettifiche che servono a portare la differenza di ogni mese nell'anno
// scelto. L'importo di un mese si spalma sulle controparti ADV **di quel mese**
// in proporzione a quanto ciascuna ha preso: così ogni riga nomina un addebito
// vero e il CFO sa in quale voce metterla. Le briciole sotto un euro si
// saltano: cento righe da 30 centesimi non aggiungono verità, solo rumore.
export function proponiRettificheAdv(
  ric: RiconciliazioneAdv,
  annoCompetenza: number,
  meseCompetenza: number
): RettificaDaCreare[] {
  const fuori: RettificaDaCreare[] = [];
  for (const m of ric.mesi) {
    if (m.differenza <= 0) continue;
    const quote = ric.controparti
      .map((c) => ({ nome: c.nome, importo: c.perMese[m.mese - 1] ?? 0 }))
      .filter((q) => q.importo > 0);
    const totale = quote.reduce((s, q) => s + q.importo, 0);
    if (totale <= 0) continue;
    for (const q of quote) {
      const importo = Math.round(((q.importo / totale) * m.differenza + Number.EPSILON) * 100) / 100;
      if (importo < 1) continue;
      fuori.push({
        tipo: "USCITA",
        voce: q.nome,
        annoOrigine: ric.anno,
        meseOrigine: m.mese,
        annoCompetenza,
        meseCompetenza,
        importo,
        nota: `pubblicità pagata nel ${ric.anno} ma non presente nelle campagne dell'anno: portata in competenza ${annoCompetenza}`,
      });
    }
  }
  return fuori;
}
