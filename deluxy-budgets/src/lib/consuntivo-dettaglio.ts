// **Cosa c'è dentro una riga del consuntivo.**
//
// Stessa idea del dettaglio delle voci di bilancio, applicata alla tabella che
// si guarda tutti i giorni: «Costo per servizi 29.156 €» è un numero che o si
// crede o non si crede, finché non si vede da quali categorie di banca è fatto
// e con quali controparti. E siccome è lì che ci si accorge di una categoria
// classificata male, è lì che deve esserci il modo di spostarla — non in
// un'altra schermata da cercare per nome.
//
// Riusa il tipo `DettaglioVoce`, così le due pagine si comportano allo stesso
// modo: le stesse tendine, gli stessi avvisi, la stessa distinzione fra quello
// che una regola ha classificato e quello che è caduto nel residuo.
//
// Differenza importante rispetto al bilancio: qui il conto è **sul periodo
// scelto**, non sull'anno. I mesi arrivano da `risolviPeriodo()`, gli stessi
// che vede la pagina — due schermate che rispondono alla stessa domanda su
// periodi diversi si contraddicono, ed è già la regola di `src/lib/periodo.ts`.

import { caricaCategorie, ricostruisci, type Categoria } from "./cfo";
import { fetchConsuntivo, fetchSpeseBanca } from "./finance";
import { fetchRicaviD2C } from "./orders";
import { raggruppa, fatturatoDaVenduto } from "./venduto";
import { misuraQuota } from "./quota";
import { ricavoD2C, ricavoDeiMesi } from "./ricavo-d2c";
import { caricaAnno, costoPersonaAnno, costoPersonaMese, type DatiAnno } from "./calc";
import { normalizzaNome } from "./scout";
import type { DettaglioVoce, CategoriaVoce, RigaFonte } from "./bilancio-dettaglio";

// Le righe del consuntivo che si possono aprire. La chiave sta nell'URL, quindi
// è un elenco chiuso: una rotta che accetta qualunque stringa e prova a
// interpretarla è una rotta che prima o poi mostra una pagina vuota senza dire
// perché.
export const VOCI_CONSUNTIVO = [
  { key: "ricavi", label: "Totale ricavi" },
  { key: "cogs", label: "Costo per servizi" },
  { key: "adv", label: "Spesa pubblicitaria (ADV)" },
  { key: "personale", label: "Costo del personale" },
  { key: "struttura", label: "Costi di struttura" },
] as const;

const TIPO_PL_DI: Record<string, string> = {
  cogs: "COGS",
  adv: "ADV",
  struttura: "STRUTTURA",
};

// Somma dei soli mesi del periodo: le controparti portano `perMese`, quindi il
// dettaglio è esatto quanto il totale che si sta aprendo.
const sommaMesi = (perMese: number[], mesi: number[]) =>
  mesi.reduce((s, m) => s + (perMese[m - 1] ?? 0), 0);

function categorieDiTipo(
  tipoPL: string,
  righe: ReturnType<typeof ricostruisci>,
  mesi: number[]
): CategoriaVoce[] {
  const out: CategoriaVoce[] = [];
  for (const r of righe) {
    const cat: Categoria | null = r.categoria;
    if (!cat || cat.tipoPL !== tipoPL) continue;
    const controparti = r.controparti
      .map((c) => ({ controparte: c.controparte, uscite: sommaMesi(c.perMese, mesi), daRegola: c.daRegola }))
      .filter((c) => c.uscite > 0)
      .sort((a, b) => b.uscite - a.uscite);
    const uscite = controparti.reduce((s, c) => s + c.uscite, 0);
    if (uscite <= 0) continue;
    out.push({
      id: cat.id,
      nome: cat.nome,
      descrizione: cat.descrizione,
      tipoPL: cat.tipoPL,
      voceCE: cat.voceCE,
      voceCEImpostata: cat.voceCEImpostata,
      predefinita: cat.predefinita,
      quotaPartner: cat.quotaPartner,
      uscite,
      movimenti: r.movimenti,
      residuo: controparti.filter((c) => !c.daRegola).reduce((s, c) => s + c.uscite, 0),
      controparti,
    });
  }
  return out.sort((a, b) => b.uscite - a.uscite);
}

export async function dettaglioConsuntivo(
  anno: number,
  mesi: number[],
  voce: string,
  etichettaPeriodo: string
): Promise<DettaglioVoce> {
  const nome = VOCI_CONSUNTIVO.find((v) => v.key === voce)?.label ?? voce;
  const base: DettaglioVoce = {
    codice: voce,
    nome,
    anno,
    periodo: `${etichettaPeriodo} ${anno}`,
    origine: "nessuna",
    totale: 0,
    categorie: [],
    righe: [],
    spiegazione: null,
    avvisi: [],
  };
  if (mesi.length === 0) {
    return { ...base, spiegazione: "Il periodo scelto non ha ancora nessun mese cominciato." };
  }
  const dal = Math.min(...mesi);
  const al = Math.max(...mesi);

  // ---- I costi: uscite di banca del periodo, per categoria ----
  const tipoPL = TIPO_PL_DI[voce];
  if (tipoPL) {
    const [spese, categorie] = await Promise.all([
      fetchSpeseBanca({ anno, dal, al }),
      caricaCategorie(),
    ]);
    if (!spese.ok) {
      return { ...base, origine: "banca", spiegazione: `Le uscite di banca non sono disponibili: ${spese.errore}` };
    }
    const cats = categorieDiTipo(tipoPL, ricostruisci(spese.dati.controparti, categorie), mesi);
    const avvisi: string[] = [];
    const residuo = cats.reduce((s, c) => s + c.residuo, 0);
    if (residuo > 0) {
      avvisi.push(
        `${Math.round(residuo).toLocaleString("it-IT")} € di questa riga sono arrivati qui senza che nessuna regola lo dicesse: li raccoglie la categoria predefinita. Sono elencati in fondo e si assegnano una a una.`
      );
    }
    avvisi.push(
      "Questi importi sono **cassa di banca**, con le rettifiche di competenza applicate a monte: sono le uscite di quelle categorie nei mesi del periodo, non le fatture ricevute."
    );
    if (voce === "adv") {
      avvisi.push(
        "La riga ADV è **la banca**, non le campagne collegate a Marketing: Marketing conosce solo gli account collegati, e un conto economico costruito su un sottoinsieme mostra un EBITDA più bello del vero."
      );
    }
    if (voce === "cogs") {
      avvisi.push(
        "Attenzione a cosa entra qui: i pagamenti ai partner dell'ecommerce **non** sono un costo — sono partita di giro, già tolta dai ricavi — e se finissero in questa riga conterebbero due volte. Le categorie che li contengono vanno marcate «quota partner» nel CFO."
      );
    }
    return { ...base, origine: "banca", totale: cats.reduce((s, c) => s + c.uscite, 0), categorie: cats, avvisi };
  }

  // ---- Il personale: il roster, mese per mese ----
  if (voce === "personale") {
    const [dati, spese, categorie] = await Promise.all([
      caricaAnno(anno) as Promise<DatiAnno>,
      fetchSpeseBanca({ anno, dal, al }),
      caricaCategorie(),
    ]);
    const righe: RigaFonte[] = dati.persone
      .map((p) => {
        const importo = mesi.reduce((s, m) => s + costoPersonaMese(p, m), 0);
        return {
          nome: `${p.nome}${p.ruolo ? ` · ${p.ruolo}` : ""}`,
          importo,
          fonte: `${p.tipo === "DIPENDENTE" ? "dipendente" : p.tipo === "STAGISTA" ? "stagista" : "consulente"} · ${Math.round((importo / (costoPersonaAnno(p) || 1)) * 100)}% del costo annuo`,
          dove: "/dipendenti",
        };
      })
      .filter((r) => r.importo > 0)
      .sort((a, b) => b.importo - a.importo);
    const totale = righe.reduce((s, r) => s + r.importo, 0);
    const avvisi = [
      "Il costo del personale **non viene dalla banca**: è il payroll a budget dell'anagrafica Dipendenti, contato solo nei mesi in cui ciascuno è a carico. Non è il costo effettivo — non contiene TFR maturato né ratei — e non esiste un consuntivo del personale.",
    ];
    // Quanto è uscito **davvero** dal conto per stipendi e compensi, nello
    // stesso periodo. Non entra nel totale — sarebbe contarlo due volte — ma
    // affiancarlo è l'unico modo per accorgersi che il roster e la realtà si
    // stanno allontanando.
    if (spese.ok) {
      const banca = categorieDiTipo("PERSONALE", ricostruisci(spese.dati.controparti, categorie), mesi);
      const usciteBanca = banca.reduce((s, c) => s + c.uscite, 0);
      if (usciteBanca > 0) {
        avvisi.push(
          `Dal conto, nello stesso periodo, sono usciti **${Math.round(usciteBanca).toLocaleString("it-IT")} €** in categorie di personale (${banca.map((c) => `${c.nome} ${Math.round(c.uscite).toLocaleString("it-IT")} €`).join(", ")}) contro i ${Math.round(totale).toLocaleString("it-IT")} € del roster. Le uscite di banca **non entrano in questo totale**: sommarle sarebbe contare due volte le stesse persone. La differenza si legge come scarto fra pianificato e pagato — comprese tredicesime e compensi che nel roster non ci sono.`
        );
      }
    }
    return { ...base, origine: "personale", totale, righe, avvisi };
  }

  // ---- I ricavi: Finance per tipologia, Orders per l'ecommerce ----
  if (voce === "ricavi") {
    const dati = await caricaAnno(anno);
    const [fatt, ordini] = await Promise.all([
      fetchConsuntivo({ anno, dal, al, stato: "tutte" }),
      fetchRicaviD2C(anno),
    ]);
    const righe: RigaFonte[] = [];
    const avvisi: string[] = [];
    // Le stesse voci di Finance che il consuntivo conta: una tipologia che non
    // è mappata su nessuna voce di budget **non entra nei ricavi della pagina**,
    // e sommarla qui faceva divergere il dettaglio dal totale che lo ha aperto
    // (luglio 2026: «Altro» 2.278 €, la differenza esatta). Non sparisce — è
    // scritta sotto, con quanto vale e dove si aggancia.
    const nomiMappati = new Set<string>();
    for (const t of dati.tipologie) {
      for (const n of t.vociFinance.length ? t.vociFinance : [t.nome]) nomiMappati.add(normalizzaNome(n));
    }
    const nonMappate: { nome: string; importo: number }[] = [];
    if (fatt.ok) {
      for (const t of fatt.dati.tipologie) {
        if (t.imponibile <= 0) continue;
        if (!nomiMappati.has(normalizzaNome(t.tipologia))) {
          nonMappate.push({ nome: t.tipologia, importo: t.imponibile });
          continue;
        }
        righe.push({
          nome: t.tipologia,
          importo: t.imponibile,
          fonte: `fatturato in Finance — ${t.fatture} fatture, imponibile`,
          fatture: t.tipologia,
        });
      }
      if (nonMappate.length > 0) {
        avvisi.push(
          `**Fuori da questo totale**: ${nonMappate
            .map((t) => `«${t.nome}» ${Math.round(t.importo).toLocaleString("it-IT")} €`)
            .join(", ")} — sono tipologie fatturate in Finance che non sono mappate su nessuna voce di budget, quindi non entrano nei ricavi di nessuno. Si agganciano in **Margini**, campo «Voci in Finance».`
        );
      }
    } else {
      avvisi.push(`Il fatturato di Finance non è disponibile: ${fatt.errore}`);
    }
    const vend = raggruppa(ordini, dati.maisons);
    const venduto = mesi.reduce((s, m) => s + (vend.mese[m - 1] ?? 0), 0);
    if (venduto > 0) {
      const quota = await misuraQuota(anno, mesi, vend.mese);
      // ⚠️ **Lo stesso conto del totale da cui si è cliccato** (09/08/2026).
      // Qui il ricavo dell'ecommerce si calcolava sempre come venduto × quota,
      // mentre il consuntivo — da quando esistono le fee vere dei vendor — usa
      // `ricavoD2C`: fee misurata partner per partner più il margine sugli
      // ordini comprati dai fornitori. Le due strade danno numeri diversi (su
      // luglio 2026: 36.688 € contro i 34.693 € della pagina), quindi il
      // dettaglio **non sommava** al numero che lo aveva aperto — che è
      // esattamente la promessa scritta in cima a questo file. Ora la strada è
      // una sola, e la riga dice quale.
      const d2c = await ricavoD2C(anno, vend.mese);
      const d2cPeriodo = d2c.ok ? ricavoDeiMesi(d2c, mesi) : null;
      const daVendor = Boolean(d2cPeriodo && d2cPeriodo.fee > 0);
      const ricavoEcommerce = daVendor ? d2cPeriodo!.ricavo : fatturatoDaVenduto(venduto, quota);
      // Il ricavo per negozio è una **ripartizione**, non una misura: le fee
      // dei vendor si conoscono per partner e per mese, non per negozio. Si
      // spartisce in proporzione al venduto di ciascuno — e la riga lo scrive,
      // invece di far sembrare misurato un riparto.
      const ricavoDelNegozio = (v: number) => (venduto > 0 ? (v / venduto) * ricavoEcommerce : 0);
      // Una riga per **negozio**, non una sola per «ecommerce»: il totale non
      // dice se sta tirando Deluxy.it o Flowers, ed è la prima cosa che si
      // vuole sapere aprendo i ricavi.
      const perNegozio: { nome: string; mesi: number[] }[] = [
        ...[...vend.perMaison].map(([slug, m]) => ({
          nome: dati.maisons.find((x) => x.slug === slug)?.nome ?? slug,
          mesi: m,
        })),
        // I negozi che non corrispondono a nessuna maison del budget restano a
        // parte invece di sparire nel totale.
        ...vend.senzaMaison.map((s) => ({ nome: `${s.brand} (non abbinato)`, mesi: s.mesi })),
      ];
      for (const b of perNegozio) {
        const v = mesi.reduce((s, m) => s + (b.mesi[m - 1] ?? 0), 0);
        if (v <= 0) continue;
        righe.push({
          nome: `Ecommerce · ${b.nome}`,
          importo: ricavoDelNegozio(v),
          fonte: daVendor
            ? `venduto ${Math.round(v).toLocaleString("it-IT")} € — quota del ricavo ecommerce misurato sulle fee dei vendor, ripartita sul venduto`
            : `venduto ${Math.round(v).toLocaleString("it-IT")} € × ${quota.percentuale}% che resta a Deluxy (${quota.misurata ? "misurato" : "stimato"})`,
          dove: "/venduto",
        });
      }
      if (daVendor) {
        avvisi.push(
          `Il ricavo dell'ecommerce è **misurato**: ${Math.round(d2cPeriodo!.fee).toLocaleString("it-IT")} € di fee fatturate ai partner vendor, più il margine sugli ordini comprati dai fornitori. La divisione **per negozio** invece è una ripartizione sul venduto: le fee si conoscono per partner e per mese, non per negozio.` +
            (d2cPeriodo!.nonCaricati.length > 0
              ? ` Mesi con le vendite dei partner non ancora caricate in Finance, quindi fuori dalla misura: ${d2cPeriodo!.nonCaricati.join(", ")}.`
              : "")
        );
      }
      // La domanda che si fanno tutti guardando questa riga, con la risposta
      // presa dal registro invece che a memoria.
      {
        const e = vend.esclusi;
        if (e) {
          avvisi.push(
            `**Gli ordini annullati e rimborsati non sono qui dentro**: il registro li esclude — ${e.annullati?.ordini ?? 0} annullati per ${Math.round(e.annullati?.lordo ?? 0).toLocaleString("it-IT")} € e ${e.rimborsati?.ordini ?? 0} rimborsati per ${Math.round(e.rimborsati?.lordo ?? 0).toLocaleString("it-IT")} € sul ${anno}. I **rimborsi parziali** invece restano contati per intero (${e.parzialmenteRimborsati?.ordini ?? 0} ordini): l'importo reso non esiste nel registro, e questo gonfia i ricavi di quanto è stato restituito.`
          );
        }
      }
    }
    avvisi.push(
      "Le due fonti stanno su **basi diverse**: Finance dà l'imponibile, i negozi il totale pagato dal cliente con IVA e spedizione incluse. Il totale è dichiarato, non omogeneo — Shopify non salva l'aliquota sull'ordine, e uniformarle con una percentuale indovinata sarebbe peggio."
    );
    return {
      ...base,
      origine: "ricavi",
      totale: righe.reduce((s, r) => s + r.importo, 0),
      righe: righe.sort((a, b) => b.importo - a.importo),
      avvisi,
    };
  }

  return { ...base, spiegazione: "Questa riga non ha un dettaglio." };
}
