// Deluxy Merchandising — **da cosa viene la differenza**.
//
// Ogni pagina di quest'app sa dire *quanto* è cambiato il venduto («−12% sul
// periodo precedente»). Nessuna sapeva dire **da dove viene quel numero**: se il
// calo è un sito, una categoria, un fornitore, una zona d'Italia, oppure — cosa
// che succede più spesso di quanto si creda — semplicemente prodotti che l'anno
// prima si vendevano e oggi non esistono più a catalogo.
//
// ── LA REGOLA CHE TIENE IN PIEDI TUTTO ────────────────────────────────────────
// Una scomposizione ha senso solo se **i contributi sommano alla differenza
// totale**. Se un euro di venduto può finire in due caselle della stessa lente,
// i «da cosa viene» non sono più pezzi di una torta: sono numeri che sembrano
// spiegare e invece contano due volte. È lo stesso errore già pagato in
// quest'app con le collezioni (3.141.052 € sommati su un periodo da 229.280 €,
// perché un prodotto sta in molte collezioni).
//
// Da qui due famiglie tenute **separate e dichiarate in pagina**:
//
//   • LENTI ADDITIVE — ogni riga venduta cade in **una sola** casella. Sito,
//     categoria del negozio, fornitore, fascia di prezzo, area di consegna,
//     categoria interna, risposta al bisogno. La somma dei contributi è
//     esattamente la differenza totale, e questo viene **verificato a ogni
//     calcolo** (`quadra`).
//
//   • OCCASIONI (i tag di Shopify) — **non additive**, e non per pigrizia: sui
//     dati veri 1.090 righe su 1.121 portano più di un tag, quindi lo stesso
//     bouquet è insieme «Compleanno», «Rose» e «Bouquet». Sommarle darebbe una
//     torta più grande della torta. Si mostrano lo stesso — sapere che
//     «Compleanno» è cresciuto mentre «Anniversari» è calato è un'informazione
//     vera — ma dichiarate per quello che sono: quote che non fanno 100.
//
// ── LE DUE SPIEGAZIONI CHE NON SONO CATEGORIE ────────────────────────────────
// Le lenti dicono *dove* è cambiato il venduto, mai *come*. Servono anche:
//
//   • VOLUME vs PREZZO — vendere 100 pezzi a 50 € o 50 pezzi a 100 € fa lo
//     stesso fatturato e sono due aziende diverse. La scomposizione è esatta:
//     (q1−q0)·p0 + (p1−p0)·q1 = R1 − R0.
//
//   • NUOVI / PERSI / RIMASTI — quanto della differenza viene da prodotti che
//     prima non c'erano, quanto da prodotti che vendevano e ora sono spariti,
//     quanto dai prodotti presenti in tutti e due i periodi. Nell'esperienza di
//     questo catalogo (una coda lunghissima di articoli venduti una volta sola)
//     è spesso la spiegazione che conta più di ogni categoria.

import { prisma } from "./db";
import { fasciaDi } from "./fasce";
import { vocabolario, type Vocabolario } from "./gruppi";
import { etichettaRisposta } from "./risposta-bisogno";
import { finestra, FILTRO_BUON_FINE, type Finestra } from "./vendite";

/** Quante voci si mostrano per lente prima di raccogliere il resto in una riga. */
const VOCI_PER_LENTE = 8;

/** Etichetta unica per «questa lente su questa riga non è compilata». */
const NON_INDICATO = "— non indicato —";

export type VoceScomposizione = {
  chiave: string;
  etichetta: string;
  ricavo: number;
  ricavoPrec: number;
  /** Il contributo: quanto **questa** voce ha aggiunto o tolto alla differenza. */
  delta: number;
  pezzi: number;
  pezziPrec: number;
  /** Quanta parte della differenza totale passa da qui, in percentuale con segno. */
  quotaDelta: number | null;
  /** Vero per la riga che raccoglie le voci oltre il taglio. */
  resto?: boolean;
};

export type LenteScomposta = {
  chiave: string;
  nome: string;
  /** Che cos'è questa lente e da dove arriva il dato, detto in pagina. */
  spiegazione: string;
  additiva: boolean;
  /** Quota del venduto del periodo su cui la lente è davvero compilata. */
  copertura: number;
  voci: VoceScomposizione[];
  /** Quante voci sono finite nella riga «resto». */
  fuori: number;
};

export type Scomposizione = {
  finestra: Finestra;
  totale: {
    ricavo: number;
    ricavoPrec: number;
    delta: number;
    deltaPct: number | null;
    pezzi: number;
    pezziPrec: number;
    righe: number;
  };
  /** Volume e prezzo: sommano esattamente alla differenza. */
  effetti: {
    volume: number;
    prezzo: number;
    prezzoMedio: number;
    prezzoMedioPrec: number;
  };
  /** Nuovi, persi e rimasti: sommano esattamente alla differenza. */
  movimento: {
    nuovi: { ricavo: number; articoli: number };
    persi: { ricavo: number; articoli: number };
    rimasti: { delta: number; articoli: number; ricavo: number; ricavoPrec: number };
  };
  lenti: LenteScomposta[];
  /** Lenti che esistono ma oggi non hanno dati: dette, non nascoste. */
  lentiVuote: { nome: string; perche: string }[];
  // Nota: l'avviso «il confronto è parziale» **non** si calcola qui. Lo
  // costruisce `analizzaVendite`, cioè la stessa funzione che produce il
  // «+2295%» in cima alla pagina, e la pagina lo mostra una volta sola sotto i
  // KPI. Ripeterlo qui darebbe due riquadri ambra identici a mezzo schermo di
  // distanza, e il secondo insegnerebbe a saltare anche il primo.
  /**
   * Scarto fra la somma dei contributi additivi e la differenza totale. Deve
   * essere zero: se non lo è, la pagina lo dice invece di mostrare una torta
   * che non torna.
   */
  quadra: boolean;
};

type RigaCaricata = {
  data: Date;
  canale: string;
  ricavo: number;
  quantita: number;
  titolo: string;
  prodottoId: string | null;
  provinciaSpedizione: string | null;
  prodotto: {
    tipoShopify: string | null;
    vendorShopify: string | null;
    tagShopify: string | null;
    categoria: string;
    prezzoVendita: number;
    ggDispMin: number | null;
  } | null;
};

/** Accumulatore di una casella, prima di diventare una voce. */
type Secchio = { ricavo: number; ricavoPrec: number; pezzi: number; pezziPrec: number };

function vuoto(): Secchio {
  return { ricavo: 0, ricavoPrec: 0, pezzi: 0, pezziPrec: 0 };
}

/**
 * Costruisce una lente additiva: `dove()` deve restituire **una sola** casella
 * per riga — è questa firma, e non un commento, a rendere impossibile contare
 * due volte lo stesso euro.
 */
function costruisciLente(
  chiave: string,
  nome: string,
  spiegazione: string,
  righe: RigaCaricata[],
  correnteSe: (r: RigaCaricata) => boolean,
  dove: (r: RigaCaricata) => string,
  deltaTotale: number
): LenteScomposta {
  const secchi = new Map<string, Secchio>();
  let ricavoCorrente = 0;
  let ricavoCoperto = 0;

  for (const r of righe) {
    const casella = dove(r);
    const s = secchi.get(casella) ?? vuoto();
    if (correnteSe(r)) {
      s.ricavo += r.ricavo;
      s.pezzi += r.quantita;
      ricavoCorrente += r.ricavo;
      if (casella !== NON_INDICATO) ricavoCoperto += r.ricavo;
    } else {
      s.ricavoPrec += r.ricavo;
      s.pezziPrec += r.quantita;
    }
    secchi.set(casella, s);
  }

  const tutte: VoceScomposizione[] = [...secchi.entries()]
    .map(([etichetta, s]) => ({
      chiave: `${chiave}:${etichetta}`,
      etichetta,
      ricavo: s.ricavo,
      ricavoPrec: s.ricavoPrec,
      delta: s.ricavo - s.ricavoPrec,
      pezzi: s.pezzi,
      pezziPrec: s.pezziPrec,
      quotaDelta: deltaTotale === 0 ? null : (100 * (s.ricavo - s.ricavoPrec)) / Math.abs(deltaTotale),
    }))
    // In ordine di **quanto spostano**, non di quanto valgono: la domanda è «da
    // cosa viene la differenza», e una voce enorme che è rimasta identica non
    // c'entra niente con la risposta.
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const voci = tutte.slice(0, VOCI_PER_LENTE);
  const oltre = tutte.slice(VOCI_PER_LENTE);
  // Il resto non si butta: si somma in una riga dichiarata, altrimenti i
  // contributi non tornerebbero più al totale e nessuno se ne accorgerebbe.
  if (oltre.length > 0) {
    const s = oltre.reduce(
      (acc, v) => ({
        ricavo: acc.ricavo + v.ricavo,
        ricavoPrec: acc.ricavoPrec + v.ricavoPrec,
        pezzi: acc.pezzi + v.pezzi,
        pezziPrec: acc.pezziPrec + v.pezziPrec,
      }),
      vuoto()
    );
    voci.push({
      chiave: `${chiave}:resto`,
      etichetta: `altre ${oltre.length} voci messe insieme`,
      ricavo: s.ricavo,
      ricavoPrec: s.ricavoPrec,
      delta: s.ricavo - s.ricavoPrec,
      pezzi: s.pezzi,
      pezziPrec: s.pezziPrec,
      quotaDelta:
        deltaTotale === 0 ? null : (100 * (s.ricavo - s.ricavoPrec)) / Math.abs(deltaTotale),
      resto: true,
    });
  }

  return {
    chiave,
    nome,
    spiegazione,
    additiva: true,
    copertura: ricavoCorrente > 0 ? (100 * ricavoCoperto) / ricavoCorrente : 0,
    voci,
    fuori: oltre.length,
  };
}

/**
 * Le occasioni, dai tag del negozio. **Non additiva**: un prodotto porta più
 * tag, quindi il suo venduto entra sotto ognuno. Tenuta a parte apposta.
 */
function lenteOccasioni(
  righe: RigaCaricata[],
  correnteSe: (r: RigaCaricata) => boolean,
  deltaTotale: number
): LenteScomposta {
  const secchi = new Map<string, Secchio>();
  let ricavoCorrente = 0;
  let ricavoConTag = 0;

  for (const r of righe) {
    const grezzi = r.prodotto?.tagShopify ?? "";
    const tag = [...new Set(grezzi.split(",").map((t) => t.trim()).filter(Boolean))];
    if (correnteSe(r)) {
      ricavoCorrente += r.ricavo;
      if (tag.length > 0) ricavoConTag += r.ricavo;
    }
    for (const t of tag) {
      const s = secchi.get(t) ?? vuoto();
      if (correnteSe(r)) {
        s.ricavo += r.ricavo;
        s.pezzi += r.quantita;
      } else {
        s.ricavoPrec += r.ricavo;
        s.pezziPrec += r.quantita;
      }
      secchi.set(t, s);
    }
  }

  const tutte = [...secchi.entries()]
    .map(([etichetta, s]) => ({
      chiave: `occasione:${etichetta}`,
      etichetta,
      ricavo: s.ricavo,
      ricavoPrec: s.ricavoPrec,
      delta: s.ricavo - s.ricavoPrec,
      pezzi: s.pezzi,
      pezziPrec: s.pezziPrec,
      quotaDelta: deltaTotale === 0 ? null : (100 * (s.ricavo - s.ricavoPrec)) / Math.abs(deltaTotale),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    chiave: "occasione",
    nome: "Occasione e tema (tag del negozio)",
    spiegazione:
      "I tag scritti su Shopify. Un prodotto ne porta quasi sempre più d'uno, quindi il suo venduto " +
      "compare sotto ognuno: queste righe NON si sommano alla differenza totale e le quote non fanno 100. " +
      "Servono a vedere quali temi salgono e quali scendono, non a spartire il fatturato.",
    additiva: false,
    copertura: ricavoCorrente > 0 ? (100 * ricavoConTag) / ricavoCorrente : 0,
    voci: tutte.slice(0, VOCI_PER_LENTE),
    fuori: Math.max(0, tutte.length - VOCI_PER_LENTE),
  };
}

/**
 * Da cosa viene la differenza fra il periodo scelto e quello precedente della
 * stessa lunghezza.
 *
 * **Una sola query** per tutto: le righe dei due periodi si leggono insieme e
 * si raggruppano in memoria. Con sette lenti, una query per lente sarebbe
 * quattordici query su un pool da 5 connessioni condiviso con altre cinque app.
 *
 * Conta solo le **vendite a buon fine** (come classifiche e riordino: un reso
 * non è domanda) ed esclude archiviati e prodotti esclusi dalle analisi, così
 * questi numeri combaciano con quelli del resto della pagina.
 */
export async function scomposizioneVendite(
  giorni: number,
  canale: string | null
): Promise<Scomposizione> {
  const f = finestra(giorni);
  // Lo stesso metro per le due domande: le righe dei due periodi e la prima
  // riga mai entrata in archivio. Se il «prima» si misura sul venduto a buon
  // fine di questo ambito, l'inizio dell'archivio va cercato con lo stesso
  // filtro — altrimenti si confronterebbe un periodo con l'inizio di un altro.
  const dovePassa = {
    ...FILTRO_BUON_FINE,
    ...(canale ? { canale } : {}),
    OR: [
      { prodottoId: null },
      { prodotto: { esclusoDaAnalisi: false, fase: { not: "archiviato" } } },
    ],
  };
  const [righe, v] = await Promise.all([
    prisma.vendita.findMany({
      where: { data: { gte: f.dalPrec, lte: f.al }, ...dovePassa },
      select: {
        data: true,
        canale: true,
        ricavo: true,
        quantita: true,
        titolo: true,
        prodottoId: true,
        provinciaSpedizione: true,
        prodotto: {
          select: {
            tipoShopify: true,
            vendorShopify: true,
            tagShopify: true,
            categoria: true,
            prezzoVendita: true,
            ggDispMin: true,
          },
        },
      },
    }) as Promise<RigaCaricata[]>,
    vocabolario(),
  ]);

  const corrente = (r: RigaCaricata) => r.data >= f.dal;

  let ricavo = 0;
  let ricavoPrec = 0;
  let pezzi = 0;
  let pezziPrec = 0;
  for (const r of righe) {
    if (corrente(r)) {
      ricavo += r.ricavo;
      pezzi += r.quantita;
    } else {
      ricavoPrec += r.ricavo;
      pezziPrec += r.quantita;
    }
  }
  const delta = ricavo - ricavoPrec;

  // — Volume e prezzo —
  // (q1−q0)·p0 + (p1−p0)·q1 = R1 − R0, esatto per costruzione.
  const prezzoMedio = pezzi > 0 ? ricavo / pezzi : 0;
  const prezzoMedioPrec = pezziPrec > 0 ? ricavoPrec / pezziPrec : 0;
  const effetti = {
    volume: (pezzi - pezziPrec) * prezzoMedioPrec,
    prezzo: (prezzoMedio - prezzoMedioPrec) * pezzi,
    prezzoMedio,
    prezzoMedioPrec,
  };

  // — Nuovi, persi, rimasti —
  // L'identità di un articolo è il suo prodotto; le righe che nessun prodotto
  // ha riconosciuto si tengono per **titolo**, che è tutto quello che si sa di
  // loro: buttarle farebbe sparire venduto vero dalla spiegazione.
  const identita = (r: RigaCaricata) => r.prodottoId ?? `titolo:${r.titolo.trim().toLowerCase()}`;
  const perArticolo = new Map<string, { ora: number; prima: number }>();
  for (const r of righe) {
    const k = identita(r);
    const a = perArticolo.get(k) ?? { ora: 0, prima: 0 };
    if (corrente(r)) a.ora += r.ricavo;
    else a.prima += r.ricavo;
    perArticolo.set(k, a);
  }
  const movimento = {
    nuovi: { ricavo: 0, articoli: 0 },
    persi: { ricavo: 0, articoli: 0 },
    rimasti: { delta: 0, articoli: 0, ricavo: 0, ricavoPrec: 0 },
  };
  for (const a of perArticolo.values()) {
    if (a.prima === 0 && a.ora !== 0) {
      movimento.nuovi.ricavo += a.ora;
      movimento.nuovi.articoli++;
    } else if (a.ora === 0 && a.prima !== 0) {
      movimento.persi.ricavo += a.prima;
      movimento.persi.articoli++;
    } else if (a.ora !== 0 || a.prima !== 0) {
      movimento.rimasti.delta += a.ora - a.prima;
      movimento.rimasti.ricavo += a.ora;
      movimento.rimasti.ricavoPrec += a.prima;
      movimento.rimasti.articoli++;
    }
  }

  // — Le lenti additive —
  const lenti: LenteScomposta[] = [];

  // Il sito si mostra solo in globale: dentro un brand ci sarebbe una riga sola.
  if (!canale) {
    lenti.push(
      costruisciLente(
        "sito",
        "Sito",
        "Il negozio su cui è passato l'ordine, letto dal registro ordini. È l'unica lente compilata sul 100% del venduto.",
        righe,
        corrente,
        (r) => r.canale,
        delta
      )
    );
  }

  lenti.push(
    costruisciLente(
      "tipo",
      "Categoria dal negozio",
      "Il «Tipo prodotto» scritto su Shopify — letto, non dedotto dal titolo.",
      righe,
      corrente,
      (r) => r.prodotto?.tipoShopify ?? NON_INDICATO,
      delta
    ),
    costruisciLente(
      "fornitore",
      "Fornitore",
      "Il «Venditore» di Shopify: chi produce o fornisce l'articolo.",
      righe,
      corrente,
      (r) => r.prodotto?.vendorShopify ?? NON_INDICATO,
      delta
    ),
    costruisciLente(
      "fascia",
      "Fascia di prezzo",
      "La fascia in cui cade il prezzo del prodotto: dice se la differenza viene dal capo economico o dal pezzo importante.",
      righe,
      corrente,
      (r) => {
        if (!r.prodotto || r.prodotto.prezzoVendita <= 0) return NON_INDICATO;
        return fasciaDi(r.prodotto.prezzoVendita, v.fasce)?.nome ?? NON_INDICATO;
      },
      delta
    ),
    costruisciLente(
      "area",
      "Area di consegna",
      "La provincia di spedizione dell'ordine, letta dal registro ordini (mai dedotta dal testo). Gli ordini senza indirizzo restano «non indicato».",
      righe,
      corrente,
      (r) => r.provinciaSpedizione ?? NON_INDICATO,
      delta
    ),
    costruisciLente(
      "categoria",
      "Categoria interna",
      "La categoria decisa da noi in «Imposta categorie e linee», che è cosa diversa dal tipo scritto sul negozio.",
      righe,
      corrente,
      (r) => {
        if (!r.prodotto) return NON_INDICATO;
        if (r.prodotto.categoria === "DA_CLASSIFICARE") return NON_INDICATO;
        return v.nomeCategoria.get(r.prodotto.categoria) ?? r.prodotto.categoria;
      },
      delta
    ),
    costruisciLente(
      "risposta",
      "Risposta al bisogno",
      "Quanto in fretta si sa rispondere a chi ordina, dai giorni minimi di evasione del negozio: urgenze, da domani, pianificato, su misura.",
      righe,
      corrente,
      (r) =>
        r.prodotto?.ggDispMin == null ? NON_INDICATO : etichettaRisposta(r.prodotto.ggDispMin),
      delta
    )
  );

  // — La lente non additiva, in fondo e dichiarata —
  lenti.push(lenteOccasioni(righe, corrente, delta));

  // — Le lenti che esistono ma oggi non direbbero niente —
  // Mostrarle vuote sarebbe peggio che non mostrarle: sembrerebbero un dato.
  const lentiVuote: { nome: string; perche: string }[] = [];
  const conLinea = await prisma.lineaProdotto.count();
  if (conLinea === 0) {
    lentiVuote.push({
      nome: "Linea",
      perche:
        "nessuna linea è ancora stata creata: la scomposizione direbbe «100% senza linea». Si creano in «Imposta categorie e linee».",
    });
  }

  // La prova del nove: i contributi additivi devono fare la differenza totale.
  // Un euro di scarto per gli arrotondamenti è tollerato; oltre, la pagina lo dice.
  const sommaAdditiva = lenti
    .filter((l) => l.additiva)
    .map((l) => l.voci.reduce((s, x) => s + x.delta, 0));
  const quadra = sommaAdditiva.every((s) => Math.abs(s - delta) < 1);

  return {
    finestra: f,
    totale: {
      ricavo,
      ricavoPrec,
      delta,
      deltaPct: ricavoPrec > 0 ? (100 * delta) / ricavoPrec : null,
      pezzi,
      pezziPrec,
      righe: righe.length,
    },
    effetti,
    movimento,
    lenti,
    lentiVuote,
    quadra,
  };
}
