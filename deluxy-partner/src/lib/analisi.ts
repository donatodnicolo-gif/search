import { prisma } from "@/lib/db";
import { riepilogoTutti } from "@/lib/queries";
import { ivato, residuoFattura, incassatoFattura, nomeMese } from "@/lib/calc";
import { dataIt } from "@/lib/format";

// Piano di cassa dell'ANALISI FINANZIARIA, in un posto solo: lo usano la
// pagina /analisi e la scheda /analisi/[periodo]. Se la regola sta qui, le due
// viste non possono raccontare due cose diverse dello stesso mese.
//
// Entrate = fatture servizi (IVATE) sul mese di SCADENZA, divise fra la parte
// già incassata e il residuo; uscite = dovuto ai partner per competenza, diviso
// fra pagato e da pagare.
//
// ⚠️ Una fattura APERTA senza scadenza NON viene collocata su un mese: la sua
// scadenza non è un dato che abbiamo, e inventarla (prima si usava il 28 del
// mese di competenza) faceva comparire dei «scaduto» rossi su mesi in cui non
// era mai scaduto nulla. Finisce nella riga «Scadenza non indicata».
// ⚠️ Le fatture segnate COMPENSATE non sono soldi da incassare: si chiudono
// compensando il dovuto al partner, e per i partner in compensazione il loro
// importo è già netto dentro `daBonificare`. Contarle qui era un doppio conto.
// ⚠️ Di ogni fattura si conta il RESIDUO, non il totale: un acconto già
// incassato sta fra gli incassi, come nello scadenzario.

export const CHIAVE_SENZA_SCADENZA = "9-senza-scadenza";
export const CHIAVE_PRECEDENTI = "0-precedenti";

export type VoceEntrata = {
  fatturaId: string;
  partnerId: string;
  chi: string;
  numero: string | null;
  tipologia: string | null;
  emissione: Date | null;
  scadenza: Date | null;
  meseCompetenza: number;
  annoCompetenza: number;
  dataPagamento: Date | null;
  totale: number; // totale IVATO della fattura
  importo: number; // quota di questa voce (incasso oppure residuo)
  saldata: boolean;
  acconto: boolean; // voce di incasso su una fattura ancora aperta
  rif: string;
  href: string;
};

export type VoceUscita = {
  partnerId: string;
  chi: string;
  mese: number;
  anno: number;
  importo: number;
  saldata: boolean;
  compensazione: boolean;
  dovutoVendite: number;
  aggiunte: number;
  detrazioni: number;
  rif: string;
  href: string;
};

export type Bucket = {
  chiave: string;
  etichetta: string;
  passato: boolean;
  senzaScadenza: boolean;
  entrate: VoceEntrata[];
  uscite: VoceUscita[];
};

export type Analisi = {
  anno: number;
  righe: Bucket[];
  totali: { incassato: number; daIncassare: number; pagato: number; daPagare: number };
  senzaData: { fatture: number; importo: number; arretrate: number };
  compensate: { fatture: number; importo: number };
};

export function sommaVoci(v: { importo: number; saldata: boolean }[], saldata: boolean): number {
  return v.filter((x) => x.saldata === saldata).reduce((a, x) => a + x.importo, 0);
}

// Etichetta leggibile di un periodo, anche per le due righe speciali.
export function etichettaPeriodo(chiave: string, anno: number): string | null {
  if (chiave === CHIAVE_SENZA_SCADENZA) return "Scadenza non indicata";
  if (chiave === CHIAVE_PRECEDENTI) return `${anno - 1} e precedenti`;
  const m = chiave.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const mese = parseInt(m[2], 10);
  if (mese < 1 || mese > 12) return null;
  return `${nomeMese(mese)} ${m[1]}`;
}

export async function costruisciAnalisi(anno: number): Promise<Analisi> {
  const oggi = new Date();
  const meseCorrente = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
  const inizioAnno = new Date(Date.UTC(anno, 0, 1));

  const [fatture, tutti] = await Promise.all([
    // tutte le fatture con importo: le saldate degli anni passati non servono,
    // le aperte sì (sono arretrato da incassare)
    prisma.fatturaServizio.findMany({
      where: { imponibile: { gt: 0 }, OR: [{ anno }, { pagata: false }] },
      include: { partner: true, tipologia: true },
    }),
    riepilogoTutti(anno),
  ]);

  const buckets = new Map<string, Bucket>();
  const bucketSenzaScadenza = (): Bucket => {
    if (!buckets.has(CHIAVE_SENZA_SCADENZA)) {
      buckets.set(CHIAVE_SENZA_SCADENZA, {
        chiave: CHIAVE_SENZA_SCADENZA,
        etichetta: "Scadenza non indicata",
        passato: false, // non si può dire scaduto ciò di cui non si sa la scadenza
        senzaScadenza: true,
        entrate: [],
        uscite: [],
      });
    }
    return buckets.get(CHIAVE_SENZA_SCADENZA)!;
  };
  const bucket = (d: Date): Bucket => {
    const inizio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const precedente = inizio < inizioAnno;
    const chiave = precedente
      ? CHIAVE_PRECEDENTI
      : `${inizio.getUTCFullYear()}-${String(inizio.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(chiave)) {
      buckets.set(chiave, {
        chiave,
        etichetta: precedente
          ? `${anno - 1} e precedenti`
          : `${nomeMese(inizio.getUTCMonth() + 1)} ${inizio.getUTCFullYear()}`,
        passato: inizio < meseCorrente,
        senzaScadenza: false,
        entrate: [],
        uscite: [],
      });
    }
    return buckets.get(chiave)!;
  };

  // Fatture compensate ancora aperte: fuori dal conto, ma dichiarate a schermo.
  const compensate = fatture.filter((f) => f.compensata && !f.pagata);
  const compensateTot = compensate.reduce((a, f) => a + residuoFattura(f), 0);

  // ENTRATE, split incassato / residuo da incassare.
  // La parte GIÀ incassata resta sul mese di scadenza (o, se non c'è, sulla
  // competenza: è storia chiusa, non muove né lo scaduto né la proiezione).
  // La parte ANCORA APERTA va su un mese solo se la scadenza esiste davvero.
  let senzaDataN = 0;
  let senzaDataTot = 0;
  let senzaDataArretrateN = 0; // anni chiusi: restano nell'arretrato
  for (const f of fatture) {
    if (f.compensata && !f.pagata) continue;
    const etichettaData = f.scadenza
      ? ` · scad. ${dataIt(f.scadenza)}`
      : ` · ${nomeMese(f.mese)} ${f.anno}`;
    const voce = (importo: number, saldata: boolean, extra = "", acconto = false): VoceEntrata => ({
      fatturaId: f.id,
      partnerId: f.partnerId,
      chi: f.partner.nome,
      numero: f.numero,
      tipologia: f.tipologia?.nome ?? null,
      emissione: f.emissione,
      scadenza: f.scadenza,
      meseCompetenza: f.mese,
      annoCompetenza: f.anno,
      dataPagamento: f.dataPagamento,
      totale: ivato(f),
      importo,
      saldata,
      acconto,
      rif: `fatt. ${f.numero ?? "s.n."}${etichettaData}${extra}`,
      href: `/fatture/${f.id}`,
    });

    const incassato = f.pagata ? ivato(f) : incassatoFattura(f);
    if (incassato >= 0.01) {
      const extra = f.pagata
        ? f.dataPagamento
          ? ` · incassata ${dataIt(f.dataPagamento)}`
          : ""
        : " · acconto incassato";
      bucket(f.scadenza ?? new Date(Date.UTC(f.anno, f.mese - 1, 28))).entrate.push(
        voce(incassato, true, extra, !f.pagata)
      );
    }

    const residuo = residuoFattura(f);
    if (residuo >= 0.01) {
      const parziale = incassatoFattura(f) >= 0.01 ? " · residuo" : "";
      if (f.scadenza) {
        bucket(f.scadenza).entrate.push(voce(residuo, false, parziale));
      } else if (f.anno < anno) {
        // anno chiuso: è arretrato comunque, a prescindere dal giorno esatto
        bucket(new Date(Date.UTC(f.anno, f.mese - 1, 28))).entrate.push(voce(residuo, false, parziale));
        senzaDataN++;
        senzaDataArretrateN++;
        senzaDataTot += residuo;
      } else {
        bucketSenzaScadenza().entrate.push(voce(residuo, false, parziale));
        senzaDataN++;
        senzaDataTot += residuo;
      }
    }
  }

  // USCITE per competenza, split pagato/da pagare
  for (const t of tutti) {
    for (const m of t.mesi) {
      const r = m.riepilogo;
      const dataComp = new Date(Date.UTC(anno, m.mese - 1, 28));
      const comune = {
        partnerId: t.partner.id,
        chi: t.partner.nome,
        mese: m.mese,
        anno,
        compensazione: r.compensazione,
        dovutoVendite: r.dovutoVendite,
        aggiunte: r.aggiunte,
        detrazioni: r.detrazioni,
        rif: `dovuto ${nomeMese(m.mese)} ${anno}`,
        href: `/partner/${t.partner.id}#mese-${m.mese}`,
      };
      if (r.bonificoInviato >= 0.01) {
        bucket(dataComp).uscite.push({ ...comune, importo: r.bonificoInviato, saldata: true });
      }
      if (r.daBonificare >= 0.01) {
        bucket(dataComp).uscite.push({ ...comune, importo: r.daBonificare, saldata: false });
      }
    }
  }

  const righe = [...buckets.values()].sort((a, b) => a.chiave.localeCompare(b.chiave));

  return {
    anno,
    righe,
    totali: {
      incassato: righe.reduce((a, r) => a + sommaVoci(r.entrate, true), 0),
      daIncassare: righe.reduce((a, r) => a + sommaVoci(r.entrate, false), 0),
      pagato: righe.reduce((a, r) => a + sommaVoci(r.uscite, true), 0),
      daPagare: righe.reduce((a, r) => a + sommaVoci(r.uscite, false), 0),
    },
    senzaData: { fatture: senzaDataN, importo: senzaDataTot, arretrate: senzaDataArretrateN },
    compensate: { fatture: compensate.length, importo: compensateTot },
  };
}
