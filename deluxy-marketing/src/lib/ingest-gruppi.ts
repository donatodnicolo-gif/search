import { prisma } from "@/lib/db";

// Il salvataggio delle metriche di GRUPPO, in un posto solo — gemello di
// ingest-metriche.ts. Stessa regola: una riga per gruppo e per giorno, upsert,
// rimandare gli stessi giorni aggiorna invece di duplicare.
//
// Un gruppo senza campagna non esiste: se la campagna non si riconosce la riga
// viene scartata e contata. Meglio una riga in meno che un gruppo appeso al
// nulla — è la regola "non dedurre" applicata alla gerarchia.

export type RigaGruppo = {
  idGruppo: string; // "825-518-1560:12345" · "825-518-1560:ag:678" per le PMax
  nome: string;
  /** Vuota su una riga di sola ANAGRAFICA: il gruppo esiste, non ha numeri. */
  data?: string | null; // AAAA-MM-GG
  // Come si aggancia alla campagna: l'id di piattaforma se c'è, altrimenti il nome
  idCampagna?: string | null;
  campagna?: string | null;
  spesa?: number | null;
  impression?: number | null;
  click?: number | null;
  conversioni?: number | null;
  ricavi?: number | null;
  statoPiattaforma?: string | null;
  tipo?: string | null;
};

export type EsitoGruppi = {
  metricheSalvate: number;
  gruppiCreati: number;
  /** Righe di sola anagrafica: gruppi confermati esistenti, senza metriche. */
  gruppiCensiti: number;
  righeScartate: number;
  campagneNonTrovate: string[];
  giornoMin: Date | null;
  giornoMax: Date | null;
};

const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
const intero = (v: unknown) => (numero(v) != null ? Math.round(numero(v)!) : null);

export async function salvaMetricheGruppi(
  righe: RigaGruppo[],
  opzioni: { canale: string }
): Promise<EsitoGruppi> {
  const { canale } = opzioni;
  const esito: EsitoGruppi = {
    metricheSalvate: 0,
    gruppiCreati: 0,
    gruppiCensiti: 0,
    righeScartate: 0,
    campagneNonTrovate: [],
    giornoMin: null,
    giornoMax: null,
  };

  // Cache per non ripetere la stessa ricerca a ogni giorno dello stesso gruppo:
  // una passata di 30 giorni su 20 gruppi sono 600 righe con 20 campagne sole.
  const campagnePerChiave = new Map<string, string | null>();
  const gruppiPerChiave = new Map<string, string>();

  for (const r of righe) {
    if (!r?.idGruppo || !r?.nome) {
      esito.righeScartate++;
      continue;
    }
    // ⚠️ RIGA SENZA DATA = ANAGRAFICA, non riga da scartare.
    //
    // La query dei gruppi è segmentata per giorno, quindi un gruppo che non ha
    // ancora erogato non produce NESSUNA riga e per l'app non esiste — è
    // successo alla WORLD-ENG il 19/08/2026: il gruppo era su Google, creato
    // dallo script, e nell'app non compariva. È lo stesso difetto corretto per
    // le campagne il 26/07 con `salvaAnagrafica`: «registra ciò che ESISTE, a
    // prescindere da quanto ha speso». Un gruppo che non si vede non si può
    // mettere in pausa, e non ci si può nemmeno creare dentro un annuncio.
    //
    // Queste righe creano/aggiornano il gruppo e basta: nessuna metrica, così
    // non scrivono zeri sopra i numeri veri di un altro giro.
    const soloAnagrafica = !r.data;
    const giorno = soloAnagrafica ? null : new Date(r.data as string);
    if (giorno && isNaN(giorno.getTime())) {
      esito.righeScartate++;
      continue;
    }
    if (giorno) giorno.setUTCHours(0, 0, 0, 0);

    const chiaveCampagna = `${r.idCampagna ?? ""}|${r.campagna ?? ""}`;
    let campagnaId = campagnePerChiave.get(chiaveCampagna);
    if (campagnaId === undefined) {
      campagnaId = await trovaCampagna(canale, r.idCampagna, r.campagna);
      campagnePerChiave.set(chiaveCampagna, campagnaId);
    }
    if (!campagnaId) {
      esito.righeScartate++;
      const nome = r.campagna ?? r.idCampagna ?? "(senza nome)";
      if (!esito.campagneNonTrovate.includes(nome)) esito.campagneNonTrovate.push(nome);
      continue;
    }

    const idEsterno = String(r.idGruppo);
    let gruppoId = gruppiPerChiave.get(idEsterno);
    if (!gruppoId) {
      // Prima per id di piattaforma, poi per (campagna, nome): così un gruppo
      // già censito a mano si arricchisce invece di sdoppiarsi.
      let gruppo = await prisma.gruppo.findFirst({ where: { canale, idEsterno } });
      if (!gruppo) {
        gruppo = await prisma.gruppo.findFirst({ where: { campagnaId, nome: String(r.nome) } });
      }
      const campagna = await prisma.campagna.findUnique({
        where: { id: campagnaId },
        select: { brand: true },
      });
      if (gruppo) {
        gruppo = await prisma.gruppo.update({
          where: { id: gruppo.id },
          data: {
            nome: String(r.nome),
            campagnaId,
            idEsterno,
            brand: campagna?.brand ?? gruppo.brand,
            ...(r.tipo ? { tipo: String(r.tipo) } : {}),
            ...(r.statoPiattaforma ? { statoPiattaforma: String(r.statoPiattaforma) } : {}),
          },
        });
      } else {
        gruppo = await prisma.gruppo.create({
          data: {
            nome: String(r.nome),
            campagnaId,
            canale,
            brand: campagna?.brand ?? "cross",
            idEsterno,
            tipo: r.tipo ? String(r.tipo) : null,
            statoPiattaforma: r.statoPiattaforma ? String(r.statoPiattaforma) : null,
          },
        });
        esito.gruppiCreati++;
      }
      gruppoId = gruppo.id;
      gruppiPerChiave.set(idEsterno, gruppoId);
    }

    // L'anagrafica ha fatto il suo: il gruppo adesso esiste nell'app. Niente
    // metriche da scrivere — e scriverne di vuote metterebbe zeri sopra i
    // numeri veri arrivati dal giro segmentato per giorno.
    if (!giorno) {
      esito.gruppiCensiti++;
      continue;
    }

    const valori = {
      spesa: numero(r.spesa),
      impression: intero(r.impression),
      click: intero(r.click),
      conversioni: numero(r.conversioni),
      ricavi: numero(r.ricavi),
    };
    await prisma.metricaGruppo.upsert({
      where: { gruppoId_data: { gruppoId, data: giorno } },
      create: { gruppoId, data: giorno, ...valori },
      update: valori,
    });
    esito.metricheSalvate++;
    if (esito.giornoMin == null || giorno < esito.giornoMin) esito.giornoMin = giorno;
    if (esito.giornoMax == null || giorno > esito.giornoMax) esito.giornoMax = giorno;
  }

  return esito;
}

// La campagna si riconosce dall'id di piattaforma; se manca, dal nome esatto.
// Niente riconoscimento sfumato qui: i gruppi arrivano sempre insieme alle
// metriche di campagna, quindi la campagna o è già agganciata o va agganciata
// prima — inventarsi un accoppiamento sarebbe peggio che scartare la riga.
async function trovaCampagna(
  canale: string,
  idCampagna?: string | null,
  nome?: string | null
): Promise<string | null> {
  if (idCampagna) {
    const perId = await prisma.campagna.findFirst({
      where: { canale, idEsterno: String(idCampagna) },
      select: { id: true },
    });
    if (perId) return perId.id;
  }
  if (nome) {
    const perNome = await prisma.campagna.findFirst({
      where: { canale, nome: String(nome) },
      select: { id: true },
    });
    if (perNome) return perNome.id;
  }
  return null;
}
