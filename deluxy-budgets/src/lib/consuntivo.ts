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
//    la banca vede l'addebito, Marketing vede la campagna (vedi marketing.ts);
//  - la **piattaforma consegne** per il costo delle consegne (27/08/2026,
//    richiesta dell'utente): sostituisce la categoria di banca «Consegne (valet
//    e corrieri)», che ne vedeva meno di un terzo — 29.561 € contro 102.080 €
//    su Gen–Lug 2026 — perché una classificazione per nome di controparte non
//    sa distinguere un valet da un fioraio. Vedi consegne.ts, dove è scritto
//    anche il prezzo del cambio: quella riga passa da CASSA a COMPETENZA.

import { costoPersonaleMese, leggiVociFinance, type DatiAnno } from "./calc";
import { caricaCategorie, categoriaDi, ricostruisci } from "./cfo";
import { fetchConsuntivo, fetchConsuntivoMensile, fetchSpeseBanca } from "./finance";
import { normalizzaNome } from "./scout";
import { fatturatoDaVenduto, QUOTA_STIMATA, quotaMisurata, raggruppa, sommaMesi, type Quota } from "./venduto";
import { fetchRicaviD2C } from "./orders";
import { economiaD2C, economiaDeiMesi } from "./economia-d2c";
import { ricavoD2C, ricavoDeiMesi, MARGINE_FORNITORI } from "./ricavo-d2c";
import { fetchSpesaAdv, type CoperturaAdv } from "./marketing";
import { caricaRettifiche, effettoSu, type EffettoAnno } from "./competenza";
import {
  CATEGORIA_CONSEGNE_BANCA,
  fetchCostiConsegne,
  rigaBancaConsegne,
  sostituzioneConsegne,
  type SostituzioneConsegne,
} from "./consegne";

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
  /**
   * IL COSTO DELLE CONSEGNE dalla piattaforma, e cosa ha sostituito.
   * `null` = la piattaforma non ha risposto e la riga è rimasta quella di
   * banca: si dichiara, perché le due cifre non sono confrontabili.
   */
  consegne: SostituzioneConsegne | null;
  // Uscite che **nessuna regola** riconosce, dovunque siano finite: oggi quasi
  // tutte dentro la categoria «Da classificare», quindi già contate nei costi.
  // `nonCategorizzato` dice «non entrano nel conto economico», questo dice
  // «entrano, ma non si sa in quale voce»: due rischi diversi, due numeri.
  senzaRegola: number;
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
  // Come è stato calcolato il ricavo dell'ecommerce in questo periodo: `null`
  // quando le vendite dei partner non sono disponibili e si è ripiegato sulla
  // quota. La pagina lo dichiara invece di far sembrare tutto uguale.
  d2c: {
    fee: number; // fatturato ai vendor, misurato partner per partner
    margineFornitori: number; // stimato sul venduto non-partner
    vendutoPartner: number;
    vendutoFornitori: number;
    percentualeFornitori: number;
    mesiNonCaricati: number[];
  } | null;
  // Il ricavo ecommerce MISURATO (primo margine + fee scritti dalla piattaforma
  // sugli ordini di Orders): dal 26/08/2026 è la PRIMA fonte della riga
  // ecommerce, sui mesi in cui l'economia copre almeno metà del lordo. `null`
  // quando nessun mese del periodo è misurato — allora vale la cascata di prima
  // (fee vendor → quota) e la pagina lo dichiara. `lordoScoperto` è il venduto
  // degli ordini senza dato nei mesi misurati: dichiarato, non stimato.
  economia: {
    ricavo: number;
    fee: number;
    primoMargine: number;
    lordoCoperto: number;
    lordoScoperto: number;
    ordini: number;
    ordiniConEconomia: number;
    mesiMisurati: number[];
    mesiNonMisurati: number[];
  } | null;
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
    cogs: 0, adv: 0, struttura: 0, personale: 0, margineLordo: 0, ebitda: 0, nonCategorizzato: 0, senzaRegola: 0,
    consegne: null,
    advMarketing: null, advCopertura: null, advCompetenza: { dentro: 0, fuori: 0 },
    quota: QUOTA_STIMATA, pagatoAiPartner: 0, d2c: null, economia: null,
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
  // Il costo delle consegne dal suo proprietario. Best effort come le altre
  // letture: se la piattaforma tace, la riga resta quella di banca e il conto
  // lo dichiara invece di far sparire un costo.
  const costiConsegne = await fetchCostiConsegne(dati.year);
  if (!costiConsegne.ok) {
    mancanti.push(`costo consegne dalla piattaforma (${costiConsegne.errore ?? "non risponde"})`);
  }

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

  // ---- Il ricavo dell'ecommerce: misurato dove il dato c'è ----
  // Decisione dell'utente (26/08/2026): la riga ecommerce è **primo margine +
  // fee** dell'economia della vendita che la piattaforma scrive sugli ordini di
  // Orders — sostituisce la stima, non la affianca. Vale sui mesi in cui
  // l'economia copre almeno metà del lordo; per gli altri resta la cascata di
  // prima (fee vendor da Finance → quota), dichiarata. Il lordo degli ordini
  // senza dato nei mesi misurati NON entra: si dichiara (`economia.lordoScoperto`).
  const econ = economiaD2C(ordini);
  const econPeriodo = economiaDeiMesi(econ, mesi);
  const d2c = await ricavoD2C(dati.year, vend.mese);
  const d2cPeriodo = d2c.ok ? ricavoDeiMesi(d2c, mesi) : null;
  const daVendor = Boolean(d2cPeriodo && d2cPeriodo.fee > 0);
  // Un solo array per il mese e per il totale: il totale è la somma dei mesi,
  // così le due letture non possono divergere (è già successo con la quota).
  const ricavoEcommerceMese = Array(12).fill(0) as number[];
  for (let i = 0; i < 12; i++) {
    const e = econ.mesi[i];
    if (e.misurato) { ricavoEcommerceMese[i] = e.ricavo; continue; }
    const riga = daVendor ? d2c.mesi.find((x) => x.mese === i + 1) : null;
    ricavoEcommerceMese[i] = daVendor
      ? (riga?.caricato ? riga.ricavo : 0)
      : vend.ok
        ? fatturatoDaVenduto(vend.mese[i] ?? 0, quota)
        : 0;
  }
  const ricavoEcommerce = sommaMesi(ricavoEcommerceMese, mesi);

  const ricaviPerTipologia: Record<string, number> = {};
  for (const t of dati.tipologie) {
    const nomi = t.vociFinance.length ? t.vociFinance : [t.nome];
    let v = 0;
    for (const n of nomi) v += perNome.get(normalizzaNome(n)) ?? 0;
    if (t.slug === SLUG_D2C && vend.ok) v += ricavoEcommerce;
    ricaviPerTipologia[t.slug] = v;
  }
  let ricavi = Object.values(ricaviPerTipologia).reduce((s, v) => s + v, 0);

  // ---- Costi di banca, riclassificati ----
  let cogs = 0, adv = 0, struttura = 0, nonCategorizzato = 0, senzaRegola = 0;
  const cogsMese = Array(12).fill(0) as number[];
  const advMese = Array(12).fill(0) as number[];
  const strutturaMese = Array(12).fill(0) as number[];
  if (spese.ok) {
    for (const r of ricostruito) {
      // Quanto, dentro questa riga, nessuna regola ha davvero riconosciuto.
      // `nonCategorizzato` da solo non basta più: da quando Finance mette il
      // non riconosciuto nella categoria «Da classificare», quel numero è
      // **zero** e il conto economico sembrava classificato al 100% — lo stesso
      // inganno della categoria che «raccoglie il residuo» (29/07/2026), tornato
      // da un'altra porta. Questi euro un costo lo fanno lo stesso: sono dentro
      // i totali, ma nella casella sbagliata.
      senzaRegola += r.residuo ?? 0;
      const tp = r.categoria?.tipoPL;
      if (!tp) { nonCategorizzato += r.uscite; continue; }
      if (tp === "COGS") { cogs += r.uscite; for (let i = 0; i < 12; i++) cogsMese[i] += r.perMese[i] ?? 0; }
      else if (tp === "ADV") { adv += r.uscite; for (let i = 0; i < 12; i++) advMese[i] += r.perMese[i] ?? 0; }
      else if (tp === "STRUTTURA") { struttura += r.uscite; for (let i = 0; i < 12; i++) strutturaMese[i] += r.perMese[i] ?? 0; }
    }
  }

  // ---- Le consegne: il costo lo dà la piattaforma, non la banca ----
  //
  // ⚠️ **Si SOSTITUISCE una riga sola.** Dal costo del venduto si toglie la
  // categoria di banca delle consegne e ci si mette il conto della piattaforma:
  // sommarli conterebbe due volte i bonifici ai valet che in banca ci sono, e
  // sostituire l'intero COGS butterebbe via i fornitori degli eventi e i
  // materiali, che consegne non sono.
  //
  // ⚠️ **Se la categoria non si trova, non si sostituisce niente e si dice.**
  // Il nome è scritto (`CATEGORIA_CONSEGNE_BANCA`): rinominarla nel CFO
  // spegnerebbe il ritrovamento in silenzio, e un costo aggiunto senza aver
  // tolto quello vecchio sarebbe contato due volte proprio dove si stava
  // cercando di essere più precisi.
  const rigaBanca = rigaBancaConsegne(ricostruito);
  const { delta: deltaConsegne, esposta: consegneEsposte } = sostituzioneConsegne(
    costiConsegne,
    rigaBanca?.perMese ?? null,
    mesi,
    // Il roster degli stipendi: chi è qui dentro non si conta anche fra le
    // consegne — il suo costo è già nella riga «personale».
    dati.persone.map((p) => p.nome)
  );
  for (const m of mesi) cogsMese[m - 1] = (cogsMese[m - 1] ?? 0) + (deltaConsegne[m - 1] ?? 0);
  cogs += mesi.reduce((s, m) => s + (deltaConsegne[m - 1] ?? 0), 0);
  if (costiConsegne.ok && !rigaBanca) {
    mancanti.push(
      `la categoria di banca «${CATEGORIA_CONSEGNE_BANCA}» non esiste: il costo delle consegne della piattaforma NON è entrato nel conto (sommarlo avrebbe contato due volte gli stessi bonifici)`
    );
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
    // Mese per mese vale la stessa regola del totale: è lo stesso array
    // (economia misurata → fee vendor → quota), non un secondo conto.
    const daEcommerce = ricavoEcommerceMese[m - 1] ?? 0;
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
    senzaRegola,
    consegne: consegneEsposte,
    advMarketing,
    advCopertura,
    advCompetenza: { dentro: advDentro, fuori: advFuori },
    quota,
    pagatoAiPartner,
    economia: econ.esposta && econPeriodo.mesiMisurati.length > 0
      ? {
          ricavo: econPeriodo.ricavo,
          fee: econPeriodo.fee,
          primoMargine: econPeriodo.primoMargine,
          lordoCoperto: econPeriodo.lordoCoperto,
          lordoScoperto: econPeriodo.lordoScoperto,
          ordini: econPeriodo.ordini,
          ordiniConEconomia: econPeriodo.ordiniConEconomia,
          mesiMisurati: econPeriodo.mesiMisurati,
          mesiNonMisurati: econPeriodo.mesiNonMisurati,
        }
      : null,
    d2c: daVendor && d2cPeriodo
      ? {
          fee: d2cPeriodo.fee,
          margineFornitori: d2cPeriodo.ricavo - d2cPeriodo.fee,
          vendutoPartner: d2c.mesi.filter((x) => mesi.includes(x.mese) && x.caricato).reduce((a, x) => a + x.vendutoPartner, 0),
          vendutoFornitori: d2c.mesi.filter((x) => mesi.includes(x.mese) && x.caricato).reduce((a, x) => a + x.vendutoFornitori, 0),
          percentualeFornitori: MARGINE_FORNITORI,
          mesiNonCaricati: d2cPeriodo.nonCaricati,
        }
      : null,
    competenza: eff,
    perMese,
  };
}

// `leggiVociFinance` è già usata da caricaAnno; la si ri-esporta perché chi
// legge questo file si chiede subito da dove arriva la mappatura.
export { leggiVociFinance };
