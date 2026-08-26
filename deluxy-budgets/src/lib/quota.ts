// **Quanto del venduto resta a Deluxy**, misurato invece che stimato.
//
// Modello C (deciso il 28/07/2026): sull'ecommerce Deluxy fa l'intermediario —
// il partner documenta la vendita al cliente e il denaro che gli si gira è una
// partita di giro, non un costo. La quota che resta è quindi, letteralmente,
// «venduto meno quello che è uscito verso i partner».
//
// Le categorie che contano sono quelle marcate **«quota partner»** nel CFO: è
// l'unico posto in cui questa informazione vive, e cambiarla lì cambia insieme
// il conto economico e questa misura, che è esattamente quello che deve
// succedere.
//
// Sta in un file suo perché tocca banca e categorie (quindi Prisma), mentre
// `venduto.ts` deve restare leggero.

import { caricaCategorie } from "./cfo";
import { fetchSpeseBanca } from "./finance";
import { caricaVenduto, QUOTA_STIMATA, quotaMisurata, sommaMesi, type Quota } from "./venduto";
import { primoMeseAperto } from "./periodo";
import { abbinaMaison, fetchMarginiBrand, fetchQuotaFornitore, fetchRicaviD2C } from "./orders";
import { SOGLIA_MISURATO } from "./economia-d2c";

export type { Quota };

export async function misuraQuota(
  anno: number,
  mesi: number[],
  vendutoMese: number[]
): Promise<Quota> {
  if (mesi.length === 0) return QUOTA_STIMATA;
  const dal = Math.min(...mesi);
  const al = Math.max(...mesi);
  const [spese, categorie] = await Promise.all([
    fetchSpeseBanca({ anno, dal, al }),
    caricaCategorie(),
  ]);
  if (!spese.ok) return QUOTA_STIMATA;

  const quotaPartner = new Set(categorie.filter((c) => c.quotaPartner).map((c) => c.id));
  const predefinita = categorie.find((c) => c.predefinita) ?? null;
  const partnerMese = Array(12).fill(0) as number[];
  const bancaMese = Array(12).fill(0) as number[];
  for (const c of spese.dati.controparti) {
    const cat = trovaCategoria(c.controparte, categorie) ?? predefinita;
    for (let i = 0; i < 12; i++) {
      const v = c.perMese[i] ?? 0;
      bancaMese[i] += v;
      if (cat && quotaPartner.has(cat.id)) partnerMese[i] += v;
    }
  }

  const venduto = sommaMesi(vendutoMese, mesi);
  const pagato = sommaMesi(partnerMese, mesi);
  const mesiConVenduto = mesi.filter((m) => (vendutoMese[m - 1] ?? 0) > 0).length;
  const mesiConBanca = mesi.filter((m) => (bancaMese[m - 1] ?? 0) > 0).length;
  return quotaMisurata(venduto, pagato, mesiConVenduto, mesiConBanca) ?? QUOTA_STIMATA;
}

// Copia locale della regola di match, per non importare `categoriaDi` e con
// essa mezza catena: qui serve solo l'id della categoria.
function trovaCategoria<T extends { id: string; regole: { match: string; esatto: boolean }[] }>(
  controparte: string,
  categorie: T[]
): T | null {
  const c = controparte.toLowerCase();
  let migliore: { cat: T; peso: number } | null = null;
  for (const cat of categorie) {
    for (const r of cat.regole) {
      const m = r.match.trim().toLowerCase();
      if (!m) continue;
      if (r.esatto ? c === m : c.includes(m)) {
        const peso = m.length + (r.esatto ? 1000 : 0);
        if (!migliore || peso > migliore.peso) migliore = { cat, peso };
      }
    }
  }
  return migliore?.cat ?? null;
}

// ---- La quota D2C dell'anno: **una sola risposta per tutta l'app** ----
//
// ⚠️ Nata da un guasto trovato il 23/08/2026 riconciliando i numeri: la stessa
// voce «EBITDA» valeva **tre cose diverse** su tre pagine, perché ognuna
// decideva per conto suo la quota con cui il D2C entra a conto economico —
// `/consuntivo` non ne passava nessuna (quindi **100%**, cioè il venduto lordo),
// `/dashboard` chiamava `misuraQuota` **con il venduto vuoto** (quindi il
// ripiego stimato del **40%** travestito da misura), `/pl` usava quella vera
// (**27,7%**). Sull'anno facevano +333.731 €, −133.599 € e −229.401 €.
//
// ⭐ La lezione: `misuraQuota(anno, mesi, [])` **non fallisce** — restituisce la
// stima, e la stima non si distingue dalla misura guardando il numero. Una
// funzione che sa arrangiarsi va chiamata da un posto solo.
//
// La regola: si misura sui **mesi chiusi** (dove venduto e banca sono entrambi
// veri) e si usa quella per tutto l'anno. Sui mesi che restano non c'è niente da
// misurare, e la quota è una caratteristica del modello, non della stagione.
export async function quotaDeluxyAnno(
  anno: number,
  maisons: { slug: string; nome: string }[]
): Promise<Quota> {
  // ---- 0. L'economia della vendita, misurata ordine per ordine (26/08/2026) ----
  //
  // Decisione dell'utente: «adatta il calcolo del bilancio sulla base dei
  // margini che conosci ora per brand». La piattaforma consegne scrive su ogni
  // ordine di Orders il **primo margine** ((pagato − prodotti) ÷ 1,22, netto
  // IVA) e la **fee** incassata dal partner: la presa di un brand è
  // (fee + primo margine) ÷ lordo coperto, e la quota di OGNI maison è quella
  // del suo brand (`perMaison`) — la media pesata resta per chi vuole un numero
  // solo e per le maison senza brand abbinato. È la stessa base del consuntivo,
  // che dal 26/08 usa questi numeri: budget e consuntivo tornano confrontabili.
  //
  // Si usa solo se l'economia copre almeno metà del lordo dell'anno: sotto,
  // si scende alla fonte successiva (i margini riconciliati), dichiarandolo.
  const ricavi = await fetchRicaviD2C(anno);
  if (ricavi.ok && ricavi.dati.brand.some((b) => typeof b.primoMargine === "number")) {
    const lordoTot = ricavi.dati.brand.reduce((s, b) => s + b.lordo, 0);
    const conDato = ricavi.dati.brand.filter((b) => (b.lordoConEconomia ?? 0) > 0);
    const coperto = conDato.reduce((s, b) => s + (b.lordoConEconomia ?? 0), 0);
    if (lordoTot > 0 && (coperto / lordoTot) * 100 >= SOGLIA_MISURATO) {
      const perMaison: Record<string, number> = {};
      let sommaPesata = 0;
      let peso = 0;
      const pezzi: string[] = [];
      for (const b of conDato) {
        const presa = (((b.fee ?? 0) + (b.primoMargine ?? 0)) / (b.lordoConEconomia ?? 1)) * 100;
        const pct = Math.round(presa * 10) / 10;
        const slug = abbinaMaison(b.brand, maisons);
        if (slug) perMaison[slug] = pct;
        sommaPesata += (b.lordoConEconomia ?? 0) * presa;
        peso += b.lordoConEconomia ?? 0;
        pezzi.push(
          `${b.brand} ${pct}% (${b.ordiniConEconomia} ordini, ${Math.round(((b.lordoConEconomia ?? 0) / (b.lordo || 1)) * 100)}% del lordo)`
        );
      }
      return {
        percentuale: Math.round((sommaPesata / peso) * 10) / 10,
        misurata: true,
        perMaison,
        spiegazione: `presa misurata dall'economia della vendita — primo margine (netto IVA) + fee, scritti dalla piattaforma sugli ordini di Orders: ${pezzi.join("; ")}`,
        etichetta: "economia di Orders",
      };
    }
  }

  // ---- 1. I margini per brand, misurati da Orders (24/08/2026: «orders
  // dovrebbe avere le % di margine di ogni brand per gli ordini») ----
  //
  // Orders misura il margine sugli ordini riconciliati, brand per brand, e i
  // brand NON marginano uguale: deluxy.it sta sul 53%, Flowers sul 44%. La
  // quota unica dell'app è la **media pesata sul venduto** di ogni brand — col
  // margine misurato dove c'è, con la regola (100 − quota fornitore) dove non
  // c'è ancora nessuna riconciliazione.
  //
  // ⚠️ La misura si usa anche quando copre poco (5–15% del lordo): è comunque
  // più vicina al vero della regola piatta, e la spiegazione dichiara la
  // copertura invece di nasconderla. Crescendo le riconciliazioni, il numero si
  // affina da solo.
  const margini = await fetchMarginiBrand(anno);
  if (margini.ok && margini.brand.some((b) => b.lordo > 0)) {
    let sommaPesata = 0;
    let peso = 0;
    const pezzi: string[] = [];
    for (const b of margini.brand) {
      if (b.lordo <= 0) continue;
      const m = b.margineMisurato ?? margini.regola.margine;
      sommaPesata += b.lordo * m;
      peso += b.lordo;
      pezzi.push(
        b.margineMisurato !== null
          ? `${b.brand} ${b.margineMisurato}% (misurato su ${b.ordiniMisurati} ordini, ${b.coperturaPct}% del lordo)`
          : `${b.brand} ${margini.regola.margine}% (regola: nessun ordine riconciliato)`
      );
    }
    const percentuale = Math.round((sommaPesata / peso) * 10) / 10;
    return {
      percentuale,
      misurata: true,
      spiegazione: `media pesata sul venduto dei margini di Orders — ${pezzi.join("; ")}`,
      etichetta: "margini di Orders",
    };
  }

  // ---- 2. La regola unica, sempre da Orders ----
  const daOrders = await fetchQuotaFornitore();
  if (daOrders.ok) {
    const percentuale = Math.round((100 - daOrders.quotaFornitore) * 10) / 10;
    return {
      percentuale,
      misurata: true,
      spiegazione: `dalla regola di Orders: il fornitore prende il ${daOrders.quotaFornitore}%, a Deluxy resta il ${percentuale}% (${daOrders.dove})`,
      etichetta: "regola di Orders",
    };
  }

  // ---- 3. Il ripiego: la misura di banca sui mesi chiusi, poi la stima ----
  // Restano per quando Orders non risponde: un P&L che non si apre è peggio di
  // una quota di ripiego dichiarata come tale.
  const aperto = primoMeseAperto(anno);
  const mesiChiusi = Array.from({ length: Math.min(aperto - 1, 12) }, (_, i) => i + 1);
  if (mesiChiusi.length === 0) return QUOTA_STIMATA;
  const vend = await caricaVenduto(anno, maisons);
  if (!vend.ok) return QUOTA_STIMATA;
  return misuraQuota(anno, mesiChiusi, vend.mese);
}
