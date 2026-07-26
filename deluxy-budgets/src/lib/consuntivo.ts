// Il consuntivo aziendale su un insieme di mesi, in una funzione sola.
//
// Serve al P&L, che accanto al budget vuole quello che è successo davvero. Sta
// qui e non nella pagina perché due schermate che raccontano lo stesso conto
// economico da due calcoli diversi finiscono per contraddirsi — e quando due
// numeri non tornano, quello sbagliato è sempre l'altro.
//
// Le fonti sono tre, e nessuna di esse è «il consuntivo»:
//  - **Finance** per il fatturato per tipologia (imponibile);
//  - **Orders** per l'ecommerce, di cui entra solo la quota che resta a Deluxy
//    dopo i partner (vedi venduto.ts): il venduto pieno non è un ricavo;
//  - **banca** (via CFO) per i costi, e l'anagrafica **Dipendenti** per il
//    personale, che è deterministico e non aspetta che i bonifici siano
//    categorizzati.

import { costoPersonaleMese, leggiVociFinance, type DatiAnno } from "./calc";
import { caricaCategorie, ricostruisci } from "./cfo";
import { fetchConsuntivo, fetchSpeseBanca } from "./finance";
import { normalizzaNome } from "./scout";
import { fatturatoDaVenduto, raggruppa, sommaMesi } from "./venduto";
import { fetchRicaviD2C } from "./orders";

export const SLUG_D2C = "D2C";

// Il consuntivo mese per mese, nella stessa forma del P&L mensile a budget: le
// due serie finiscono nella stessa tabella e devono avere le stesse voci.
export type ConsuntivoMese = {
  month: number;
  ricavi: number;
  cogs: number;
  margineLordo: number;
  adv: number;
  personale: number;
  struttura: number;
  ebitda: number;
};

export type ConsuntivoPeriodo = {
  ok: boolean;
  // Cosa non è arrivato: si dichiara invece di far passare uno zero per un dato.
  mancanti: string[];
  mesi: number[];
  ricavi: number;
  ricaviPerTipologia: Record<string, number>;
  vendutoEcommerce: number;
  cogs: number;
  adv: number;
  struttura: number;
  personale: number;
  margineLordo: number;
  ebitda: number;
  nonCategorizzato: number;
  // Una riga per ogni mese richiesto, nello stesso ordine di `mesi`.
  perMese: ConsuntivoMese[];
};

export async function caricaConsuntivo(
  dati: DatiAnno,
  mesi: number[]
): Promise<ConsuntivoPeriodo> {
  const vuoto: ConsuntivoPeriodo = {
    ok: false, mancanti: [], mesi, ricavi: 0, ricaviPerTipologia: {}, vendutoEcommerce: 0,
    cogs: 0, adv: 0, struttura: 0, personale: 0, margineLordo: 0, ebitda: 0, nonCategorizzato: 0,
    perMese: [],
  };
  if (mesi.length === 0) return { ...vuoto, mancanti: ["Nessun mese concluso in questo anno."] };

  const dal = Math.min(...mesi);
  const al = Math.max(...mesi);
  // Il fatturato si chiede una volta per il totale e una volta per ogni mese:
  // l'API di Finance dà il periodo, non la ripartizione mensile. I costi no —
  // `/api/spese` restituisce già il `perMese` di ogni controparte — e nemmeno
  // l'ecommerce, che arriva da Orders in dodici caselle.
  const [fatt, spese, categorie, ordini, fattMese] = await Promise.all([
    fetchConsuntivo({ anno: dati.year, dal, al, stato: "tutte" }),
    fetchSpeseBanca({ anno: dati.year, dal, al }),
    caricaCategorie(),
    fetchRicaviD2C(dati.year),
    Promise.all(mesi.map((m) => fetchConsuntivo({ anno: dati.year, mese: m, stato: "tutte" }))),
  ]);

  const mancanti: string[] = [];
  if (!fatt.ok) mancanti.push("fatturato da Finance");
  if (!spese.ok) mancanti.push("uscite di banca");
  if (!ordini.ok) mancanti.push("venduto ecommerce da Orders");

  // ---- Ricavi per tipologia, con la stessa mappatura del Consuntivo ----
  const perNome = new Map<string, number>();
  if (fatt.ok) for (const t of fatt.dati.tipologie) perNome.set(normalizzaNome(t.tipologia), t.imponibile);

  const vend = raggruppa(ordini, dati.maisons);
  const vendutoEcommerce = sommaMesi(vend.mese, mesi);

  const ricaviPerTipologia: Record<string, number> = {};
  for (const t of dati.tipologie) {
    const nomi = t.vociFinance.length ? t.vociFinance : [t.nome];
    let v = 0;
    for (const n of nomi) v += perNome.get(normalizzaNome(n)) ?? 0;
    if (t.slug === SLUG_D2C && vend.ok) v += fatturatoDaVenduto(vendutoEcommerce);
    ricaviPerTipologia[t.slug] = v;
  }
  const ricavi = Object.values(ricaviPerTipologia).reduce((s, v) => s + v, 0);

  // ---- Costi di banca, riclassificati ----
  let cogs = 0, adv = 0, struttura = 0, nonCategorizzato = 0;
  const cogsMese = Array(12).fill(0) as number[];
  const advMese = Array(12).fill(0) as number[];
  const strutturaMese = Array(12).fill(0) as number[];
  if (spese.ok) {
    for (const r of ricostruisci(spese.dati.controparti, categorie)) {
      const tp = r.categoria?.tipoPL;
      if (!tp) { nonCategorizzato += r.uscite; continue; }
      if (tp === "COGS") { cogs += r.uscite; for (let i = 0; i < 12; i++) cogsMese[i] += r.perMese[i] ?? 0; }
      else if (tp === "ADV") { adv += r.uscite; for (let i = 0; i < 12; i++) advMese[i] += r.perMese[i] ?? 0; }
      else if (tp === "STRUTTURA") { struttura += r.uscite; for (let i = 0; i < 12; i++) strutturaMese[i] += r.perMese[i] ?? 0; }
    }
  }

  // Le voci di budget che hanno una corrispondenza in Finance: servono a
  // filtrare il fatturato mensile con la stessa regola usata sul totale.
  const nomiMappati = new Set<string>();
  for (const t of dati.tipologie) {
    for (const n of (t.vociFinance.length ? t.vociFinance : [t.nome])) nomiMappati.add(normalizzaNome(n));
  }

  const perMese: ConsuntivoMese[] = mesi.map((m, idx) => {
    const f = fattMese[idx];
    const daFinance = f.ok
      ? f.dati.tipologie
          .filter((t) => nomiMappati.has(normalizzaNome(t.tipologia)))
          .reduce((s, t) => s + t.imponibile, 0)
      : 0;
    const daEcommerce = vend.ok ? fatturatoDaVenduto(vend.mese[m - 1] ?? 0) : 0;
    const ricaviM = daFinance + daEcommerce;
    const cogsM = cogsMese[m - 1] ?? 0;
    const advM = advMese[m - 1] ?? 0;
    const strutturaM = strutturaMese[m - 1] ?? 0;
    const personaleM = costoPersonaleMese(dati, m);
    const margineM = ricaviM - cogsM;
    return {
      month: m,
      ricavi: ricaviM,
      cogs: cogsM,
      margineLordo: margineM,
      adv: advM,
      personale: personaleM,
      struttura: strutturaM,
      ebitda: margineM - advM - personaleM - strutturaM,
    };
  });

  const personale = mesi.reduce((s, m) => s + costoPersonaleMese(dati, m), 0);
  const margineLordo = ricavi - cogs;
  const ebitda = margineLordo - adv - personale - struttura;

  return {
    ok: fatt.ok || ordini.ok,
    mancanti,
    mesi,
    ricavi,
    ricaviPerTipologia,
    vendutoEcommerce,
    cogs,
    adv,
    struttura,
    personale,
    margineLordo,
    ebitda,
    nonCategorizzato,
    perMese,
  };
}

// `leggiVociFinance` è già usata da caricaAnno; la si ri-esporta perché chi
// legge questo file si chiede subito da dove arriva la mappatura.
export { leggiVociFinance };
