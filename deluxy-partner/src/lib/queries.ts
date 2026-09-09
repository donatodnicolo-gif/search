// Query condivise: riepiloghi mensili e rolling per partner.
import { prisma } from "./db";
import { riepilogoMese, rolling, type RiepilogoMese, type Rolling } from "./calc";
import { separaFattureVere } from "./fattura-vera";

export const ANNO_CORRENTE = 2026;
// Anni selezionabili nelle viste (dal più recente). Aggiornare quando si apre un anno nuovo.
export const ANNI_DISPONIBILI = [2026, 2025];

// Normalizza un anno ricevuto da querystring: valido solo se tra quelli disponibili.
export function annoValido(v: string | undefined): number {
  const n = v ? parseInt(v) : NaN;
  return ANNI_DISPONIBILI.includes(n) ? n : ANNO_CORRENTE;
}

export type MeseParziale = { mese: number; riepilogo: RiepilogoMese; saldo: SaldoRecord | null };
export type SaldoRecord = NonNullable<Awaited<ReturnType<typeof prisma.saldoMensile.findFirst>>>;

// Riepilogo completo di un partner per un anno: 12 mesi calcolati + rolling.
export async function riepilogoPartner(
  partnerId: string,
  anno: number,
  /**
   * La decisione sulla compensazione presa sulla PIATTAFORMA CONSEGNE, che è la
   * casa del dato: `false` = ha deciso di NON compensare (regime «commissioni a
   * parte»), `true` = compensa, `null`/omesso = la piattaforma non risponde o
   * non ha deciso, e allora vale il campo locale di Finance.
   * ⚠️ `undefined` e `null` NON sono `false`: chi non ha deciso resta col mese
   * come prima. È la stessa distinzione che il 09/09 ha evitato di spostare
   * 113.561,48 € su 107 partner mai interrogati.
   */
  decisionePiattaforma?: boolean | null
) {
  const [partner, fattureTutte, vendite, saldi, extraRighe] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: partnerId },
      select: { compensazione: true, compensazioneDecisa: true },
    }),
    prisma.fatturaServizio.findMany({
      where: { partnerId, anno },
      include: { tipologia: true },
      orderBy: [{ mese: "asc" }, { createdAt: "asc" }],
    }),
    prisma.venditaVendor.findMany({
      where: { partnerId, anno },
      orderBy: [{ mese: "asc" }, { createdAt: "asc" }],
    }),
    prisma.saldoMensile.findMany({ where: { partnerId, anno } }),
    // I mesi con un extra REGISTRATO a mano: là le `aggiunte` hanno una causale
    // e restano un dovuto. Dove non ci sono, vengono dall import del foglio.
    // ⚠️ 09/09/2026 — SOLO le voci `manuale`. Il 09/09 i 211 mesi di extra
    // importati da PARTNER.xlsx hanno finalmente una riga (prima stavano solo
    // nei totali del saldo, invisibili e non cancellabili). Se qui si contassero
    // anche quelle, ogni mese risulterebbe «extra registrato a mano» e
    // `extraSospetto` si spegnerebbe ovunque: i 31 mesi in cui l'extra è lo
    // sforo di un bonifico tornerebbero a essere un dovuto.
    prisma.extraSaldo.findMany({
      where: { partnerId, anno, origine: "manuale" },
      select: { mese: true },
    }),
  ]);

  // Contano solo le fatture VERE, quelle con un documento su Fatture in Cloud
  // (regola dell'utente del 04/09/2026, vedi `fattura-vera.ts`). La divisione
  // si fa QUI, una volta: l'elenco del mese e il saldo del mese nascono dalla
  // stessa lista, così non può succedere che una riga sparisca dall'elenco ma
  // resti dentro il totale. Le `nonEmesse` tornano alla pagina, che le dichiara
  // invece di farle sparire in silenzio.
  const { vere: fatture, nonEmesse } = separaFattureVere(fattureTutte);

  // ⭐ 09/09/2026 — ANCHE LA COMPENSAZIONE VIENE DALLA PIATTAFORMA.
  //
  // Il badge in testata leggeva già la decisione della piattaforma, ma i CONTI
  // del mese usavano ancora la colonna locale: sulla stessa scheda si leggeva
  // «In compensazione · dalla piattaforma» e sotto i mesi calcolati a partite
  // separate (FABBRICA DELLE FESTE, 09/09). Due risposte diverse alla stessa
  // domanda, sulla stessa pagina.
  // Ora la colonna locale è il RIPIEGO: vale solo dove la piattaforma non
  // risponde o non ha deciso.
  // 📏 L'effetto misurato il 09/09 su 42 partner in disaccordo: da bonificare
  // 27.402,47 → 32.288,24 €, da incassare 18.441,20 → 26.465,18 €.
  const compensazione =
    decisionePiattaforma === true
      ? true
      : decisionePiattaforma === false
        ? false
        : (partner?.compensazione ?? false);
  // ⭐ 09/09/2026 — REGIME «COMMISSIONI A PARTE» (regola dell'utente): dovuto
  // pari al venduto e la fattura commissioni come credito del mese.
  // ⚠️ SOLO dove la compensazione è stata **decisa a NO**, non dove non è mai
  // stata valorizzata: «è solo per chi ha compensazione valorizzata come no».
  // Il campo che distingue le due cose esiste già ed è `compensazioneDecisa`
  // (un booleano che parte a false non sa dire «non lo so»): oggi il regime
  // tocca **un partner**, CLIVATI, non i 107 che risultano «senza».
  const commissioniAParte =
    decisionePiattaforma === false
      ? true
      : decisionePiattaforma === true
        ? false
        : !!partner?.compensazioneDecisa && !compensazione;
  const mesiConExtra = new Set(extraRighe.map((e) => e.mese));

  const mesi = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1;
    const f = fatture.filter((x) => x.mese === mese);
    const v = vendite.filter((x) => x.mese === mese);
    const saldo = saldi.find((x) => x.mese === mese) ?? null;
    return { mese, fatture: f, vendite: v, saldo, riepilogo: riepilogoMese(f, v, saldo, compensazione, mesiConExtra.has(mese), commissioniAParte) };
  });

  return { fatture, vendite, saldi, mesi, nonEmesse, rolling: rolling(mesi.map((m) => m.riepilogo)) };
}

// Riepilogo di tutti i partner (per dashboard, saldi, report).
// Ottimizzata: le tipologie (poche righe) si caricano a parte invece di un
// `include` su ogni fattura, e il raggruppamento per partner/mese usa mappe
// invece di filtrare l'intero elenco per ogni partner (era O(partner × righe)).
export async function riepilogoTutti(anno: number) {
  const [partners, fattureRaw, vendite, saldi, tipologie] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" } }),
    prisma.fatturaServizio.findMany({ where: { anno } }),
    prisma.venditaVendor.findMany({ where: { anno } }),
    prisma.saldoMensile.findMany({ where: { anno } }),
    prisma.tipologiaServizio.findMany(),
  ]);
  const tipPerId = new Map(tipologie.map((t) => [t.id, t]));
  // Stessa regola della scheda partner: senza un documento su Fatture in Cloud
  // non è una fattura, quindi non entra nei saldi, nella dashboard, nei report.
  // Se qui contasse e nella scheda no, lo stesso partner avrebbe due dovuti
  // diversi a seconda della pagina da cui lo si guarda.
  const fatture = separaFattureVere(fattureRaw).vere.map((f) => ({ ...f, tipologia: tipPerId.get(f.tipologiaId)! }));

  // indicizza una volta sola per partner
  const perPartner = <T extends { partnerId: string }>(righe: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of righe) {
      const arr = m.get(r.partnerId);
      if (arr) arr.push(r);
      else m.set(r.partnerId, [r]);
    }
    return m;
  };
  const fattureBy = perPartner(fatture);
  const venditeBy = perPartner(vendite);
  const saldiBy = perPartner(saldi);

  return partners.map((p) => {
    const pf = fattureBy.get(p.id) ?? [];
    const pv = venditeBy.get(p.id) ?? [];
    const ps = saldiBy.get(p.id) ?? [];
    // raggruppa per mese in una passata sola (invece di 12 filtri per partner)
    const fMese: (typeof pf)[] = Array.from({ length: 13 }, () => []);
    for (const f of pf) fMese[f.mese]?.push(f);
    const vMese: (typeof pv)[] = Array.from({ length: 13 }, () => []);
    for (const v of pv) vMese[v.mese]?.push(v);
    const sMese = new Map(ps.map((x) => [x.mese, x]));

    const mesi = Array.from({ length: 12 }, (_, i) => {
      const mese = i + 1;
      const saldo = sMese.get(mese) ?? null;
      return {
        mese,
        saldo,
        // Stessa regola della scheda: il regime «commissioni a parte» vale solo
        // per chi ha DECISO di non compensare. Se qui contasse diversamente,
        // dashboard e scheda darebbero due dovuti diversi sullo stesso mese.
        riepilogo: riepilogoMese(
          fMese[mese],
          vMese[mese],
          saldo,
          p.compensazione,
          true,
          p.compensazioneDecisa && !p.compensazione
        ),
      };
    });
    return { partner: p, fatture: pf, vendite: pv, saldiRecords: ps, mesi, rolling: rolling(mesi.map((m) => m.riepilogo)) };
  });
}

export type RiepilogoPartnerTotale = Awaited<ReturnType<typeof riepilogoTutti>>[number];
export type { Rolling };
