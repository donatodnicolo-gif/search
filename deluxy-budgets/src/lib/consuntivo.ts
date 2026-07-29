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
//    categorizzati;
//  - **Marketing** per la spesa pubblicitaria, che è l'unica fonte dell'ADV:
//    la banca vede l'addebito, Marketing vede la campagna (vedi marketing.ts).

import { costoPersonaleMese, leggiVociFinance, type DatiAnno } from "./calc";
import { caricaCategorie, categoriaDi, ricostruisci } from "./cfo";
import { fetchConsuntivo, fetchConsuntivoMensile, fetchSpeseBanca } from "./finance";
import { normalizzaNome } from "./scout";
import { fatturatoDaVenduto, QUOTA_STIMATA, quotaMisurata, raggruppa, sommaMesi, type Quota } from "./venduto";
import { fetchRicaviD2C } from "./orders";
import { fetchSpesaAdv, type CoperturaAdv } from "./marketing";
import { caricaRettifiche, effettoSu, type EffettoAnno } from "./competenza";

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
  // La riga `adv` sono le uscite di banca. Qui accanto, quanto è costato fare
  // le campagne **collegate** a Marketing: serve a misurare la copertura, non a
  // sostituire il totale. `null` se Marketing non risponde.
  advMarketing: number | null;
  advCopertura: CoperturaAdv | null;
  // Quanta pubblicità la competenza porta dentro e fuori da questo periodo.
  advCompetenza: { dentro: number; fuori: number };
  // La quota del venduto che resta a Deluxy: misurata dai pagamenti ai partner
  // quando i dati bastano, stimata quando no. La pagina dichiara quale.
  quota: Quota;
  pagatoAiPartner: number;
  // Le rettifiche di competenza che toccano questo periodo: si dichiarano,
  // perche un totale corretto di nascosto e peggio di uno sbagliato in chiaro.
  competenza: EffettoAnno | null;
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
    advMarketing: null, advCopertura: null, advCompetenza: { dentro: 0, fuori: 0 },
    quota: QUOTA_STIMATA, pagatoAiPartner: 0,
    competenza: null,
    perMese: [],
  };
  if (mesi.length === 0) return { ...vuoto, mancanti: ["Nessun mese concluso in questo anno."] };

  const dal = Math.min(...mesi);
  const al = Math.max(...mesi);
  // Il fatturato si chiede due volte: il totale del periodo e la ripartizione
  // mensile. Quest'ultima era **una chiamata per mese** — dodici viaggi di rete
  // a ogni caricamento, la cosa più lenta dell'app — e adesso è una sola, da
  // quando Finance sa raggruppare per mese. I costi non hanno mai avuto il
  // problema (`/api/spese` porta già il `perMese` di ogni controparte) e
  // nemmeno l'ecommerce, che arriva da Orders in dodici caselle.
  const [fatt, spese, categorie, ordini, mensile, rettifiche, spesaAdv] = await Promise.all([
    fetchConsuntivo({ anno: dati.year, dal, al, stato: "tutte" }),
    fetchSpeseBanca({ anno: dati.year, dal, al }),
    caricaCategorie(),
    fetchRicaviD2C(dati.year),
    fetchConsuntivoMensile({ anno: dati.year, dal, al, stato: "tutte" }),
    caricaRettifiche(dati.year),
    fetchSpesaAdv(dati.year, dal, al),
  ]);
  // Se Finance non è ancora aggiornato si torna alla vecchia strada, invece di
  // mostrare un andamento mensile tutto a zero.
  const fattPerMese = mensile.ok ? mensile : null;
  const fattMese = fattPerMese
    ? []
    : await Promise.all(mesi.map((m) => fetchConsuntivo({ anno: dati.year, mese: m, stato: "tutte" })));
  // L'anno di competenza lo decide questa app: Finance dice quando il denaro si
  // è mosso, le rettifiche dicono a quale esercizio appartiene.
  const eff = effettoSu(rettifiche, dati.year, mesi);

  const mancanti: string[] = [];
  if (!fatt.ok) mancanti.push("fatturato da Finance");
  if (!spese.ok) mancanti.push("uscite di banca");
  if (!ordini.ok) mancanti.push("venduto ecommerce da Orders");

  // ---- Ricavi per tipologia, con la stessa mappatura del Consuntivo ----
  const perNome = new Map<string, number>();
  if (fatt.ok) for (const t of fatt.dati.tipologie) perNome.set(normalizzaNome(t.tipologia), t.imponibile);

  const vend = raggruppa(ordini, dati.maisons);
  const vendutoEcommerce = sommaMesi(vend.mese, mesi);

  // ---- Modello C: la quota di Deluxy sul venduto si MISURA ----
  // Quanto è stato girato ai partner nei mesi guardati: sono le categorie
  // marcate «quota partner» nel CFO. Da lì esce la quota che resta a Deluxy,
  // invece della percentuale decisa a tavolino. Se la banca copre meno mesi del
  // venduto la misura non si fa: dividere un semestre di pagamenti per un anno
  // di vendite darebbe una quota altissima e falsa.
  const ricostruito = spese.ok ? ricostruisci(spese.dati.controparti, categorie) : [];
  const partnerMese = Array(12).fill(0) as number[];
  for (const r of ricostruito) {
    if (!r.categoria?.quotaPartner) continue;
    for (let i = 0; i < 12; i++) partnerMese[i] += r.perMese[i] ?? 0;
  }
  const bancaMese = Array(12).fill(0) as number[];
  for (const r of ricostruito) for (let i = 0; i < 12; i++) bancaMese[i] += r.perMese[i] ?? 0;
  const mesiConBanca = mesi.filter((m) => (bancaMese[m - 1] ?? 0) > 0).length;
  const mesiConVenduto = mesi.filter((m) => (vend.mese[m - 1] ?? 0) > 0).length;
  const pagatoAiPartner = sommaMesi(partnerMese, mesi);
  const quota =
    quotaMisurata(vendutoEcommerce, pagatoAiPartner, mesiConVenduto, mesiConBanca) ?? QUOTA_STIMATA;

  const ricaviPerTipologia: Record<string, number> = {};
  for (const t of dati.tipologie) {
    const nomi = t.vociFinance.length ? t.vociFinance : [t.nome];
    let v = 0;
    for (const n of nomi) v += perNome.get(normalizzaNome(n)) ?? 0;
    if (t.slug === SLUG_D2C && vend.ok) v += fatturatoDaVenduto(vendutoEcommerce, quota);
    ricaviPerTipologia[t.slug] = v;
  }
  let ricavi = Object.values(ricaviPerTipologia).reduce((s, v) => s + v, 0);

  // ---- Costi di banca, riclassificati ----
  let cogs = 0, adv = 0, struttura = 0, nonCategorizzato = 0;
  const cogsMese = Array(12).fill(0) as number[];
  const advMese = Array(12).fill(0) as number[];
  const strutturaMese = Array(12).fill(0) as number[];
  if (spese.ok) {
    for (const r of ricostruito) {
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
  const slugPerNome = new Map<string, string>();
  for (const t of dati.tipologie) {
    for (const n of (t.vociFinance.length ? t.vociFinance : [t.nome])) {
      nomiMappati.add(normalizzaNome(n));
      slugPerNome.set(normalizzaNome(n), t.slug);
    }
  }

  // ---- Le rettifiche di competenza entrano nei conti ----
  // Un'uscita finisce nella stessa voce di P&L in cui la metterebbero le regole
  // del CFO: la competenza sposta *quando* si conta, non *cosa* è.
  const ricaviRettificaMese = Array(12).fill(0) as number[];
  // L'ADV entra come le altre voci — la riga è cassa, quindi la competenza vale
  // in entrambi i versi — ma «entrato» e «uscito» si tengono anche separati,
  // perché la pagina li dichiara accanto al totale.
  let advDentro = 0;
  let advFuori = 0;
  for (const r of eff.righe) {
    const segnoOrigine = r.annoOrigine === dati.year && mesi.includes(r.meseOrigine) ? -1 : 0;
    const segnoDestino = r.annoCompetenza === dati.year && mesi.includes(r.meseCompetenza) ? 1 : 0;
    const applica = (aggiungi: (mese: number, delta: number) => void) => {
      if (segnoOrigine) aggiungi(r.meseOrigine, -r.importo);
      if (segnoDestino) aggiungi(r.meseCompetenza, r.importo);
    };
    if (r.tipo === "USCITA") {
      const tp = categoriaDi(r.voce, categorie)?.tipoPL;
      if (tp === "COGS") applica((m, d) => { cogs += d; cogsMese[m - 1] += d; });
      else if (tp === "ADV") {
        if (segnoOrigine) advFuori += r.importo;
        if (segnoDestino) advDentro += r.importo;
        applica((m, d) => { adv += d; advMese[m - 1] += d; });
      }
      else if (tp === "STRUTTURA") applica((m, d) => { struttura += d; strutturaMese[m - 1] += d; });
      // Voce senza categoria: non si sa dove metterla, quindi non si mette da
      // nessuna parte. La pagina delle rettifiche lo segnala.
    } else {
      const slug = slugPerNome.get(normalizzaNome(r.voce));
      if (slug) {
        applica((m, d) => {
          ricaviPerTipologia[slug] = (ricaviPerTipologia[slug] ?? 0) + d;
          ricaviRettificaMese[m - 1] += d;
        });
      }
    }
  }
  ricavi = Object.values(ricaviPerTipologia).reduce((s, v) => s + v, 0);

  // ---- L'ADV: la banca è la fonte, Marketing è il confronto ----
  // Per un giorno la riga pubblicitaria è stata la spesa delle campagne da
  // Marketing. È stato un errore, e la ragione va lasciata scritta: **Marketing
  // conosce solo le campagne che ha collegate**, quindi il suo totale è per
  // costruzione un sottoinsieme — misurato sul 2026, poco più della metà di
  // quello che il conto ha pagato davvero. Un conto economico costruito su un
  // sottoinsieme mostra un EBITDA più bello del vero, che è il modo peggiore di
  // sbagliare.
  //
  // Quindi la riga ADV sono le **uscite di banca** categorizzate «Marketing e
  // ADV», con le rettifiche di competenza applicate come a ogni altra voce
  // (sopra, nel ciclo). La banca vede tutto quello che è stato pagato, comprese
  // le piattaforme che nessuno ha collegato.
  //
  // Marketing resta accanto, come **confronto**: dice quanto è costato fare le
  // campagne che conosce, ed è l'unico posto in cui quel numero è diviso per
  // brand e per campagna. Le due cifre non coincideranno mai — se la banca è
  // molto più alta, mancano account da collegare; se sono vicine, la copertura
  // è buona.
  const advMarketing = spesaAdv.ok ? sommaMesi(spesaAdv.dati.mese, mesi) : null;
  const advCopertura: CoperturaAdv | null = spesaAdv.ok ? spesaAdv.dati.copertura : null;

  const perMese: ConsuntivoMese[] = mesi.map((m, idx) => {
    // Il fatturato del mese: dalla risposta unica quando Finance sa
    // raggrupparla, altrimenti dalla chiamata dedicata a quel mese.
    const f = fattMese[idx];
    const daFinance = fattPerMese
      ? fattPerMese.tipologie
          .filter((t) => nomiMappati.has(normalizzaNome(t.tipologia)))
          .reduce((s, t) => s + (t.mesi[m - 1] ?? 0), 0)
      : f && f.ok
        ? f.dati.tipologie
            .filter((t) => nomiMappati.has(normalizzaNome(t.tipologia)))
            .reduce((s, t) => s + t.imponibile, 0)
        : 0;
    const daEcommerce = vend.ok ? fatturatoDaVenduto(vend.mese[m - 1] ?? 0, quota) : 0;
    const ricaviM = daFinance + daEcommerce + (ricaviRettificaMese[m - 1] ?? 0);
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
    advMarketing,
    advCopertura,
    advCompetenza: { dentro: advDentro, fuori: advFuori },
    quota,
    pagatoAiPartner,
    competenza: eff,
    perMese,
  };
}

// `leggiVociFinance` è già usata da caricaAnno; la si ri-esporta perché chi
// legge questo file si chiede subito da dove arriva la mappatura.
export { leggiVociFinance };
