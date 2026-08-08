import { prisma } from "./db";
import { FILTRO_IN_SCENA } from "./ordinamento-vetrina";

const MAX_VALORI = 400;

export type VoceValore = { v: string; n: number | null; etichetta?: string };
export type VociPassi = {
  tipi: VoceValore[];
  categorie: VoceValore[];
  fornitori: VoceValore[];
  linee: VoceValore[];
  tag: VoceValore[];
  zone: VoceValore[];
  citta: VoceValore[];
  occasioni: VoceValore[];
  classificazioni: VoceValore[];
  tipologieMeta: VoceValore[];
  date: VoceValore[];
  orari: VoceValore[];
  bestseller: VoceValore[];
};

/**
 * I valori che si possono mettere in una condizione, letti dai dati veri e col
 * **numero di prodotti che li portano**.
 *
 * **Contano solo i prodotti in vendita.** Prima si contava tutto il catalogo:
 * «Fiori 379» comprendeva archiviati e bozze, e spuntandolo l'anteprima ne
 * mostrava molti meno — il numero prometteva quello che la regola non poteva
 * mantenere. Una condizione serve a ordinare una vetrina, e in vetrina ci va
 * solo quello che il cliente vede.
 *
 * Per lo stesso motivo **i valori che nessun prodotto attivo porta non compaiono
 * affatto**: sceglierli non sposterebbe niente, e vederli fa perdere tempo.
 *
 * Sta in un posto solo perché le stesse voci servono alla pagina della regola
 * **e** alla scheda della collezione: con due copie le due pagine finirebbero
 * per offrire elenchi diversi.
 */
export async function vociPassi(): Promise<VociPassi> {
  const [categorie, linee, tipi, fornitori, tagGrezzi, zoneGrezze] = await Promise.all([
    prisma.prodotto.groupBy({ by: ["categoria"], where: FILTRO_IN_SCENA, _count: true }),
    prisma.prodotto.groupBy({ by: ["lineaId"], where: { ...FILTRO_IN_SCENA, lineaId: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { ...FILTRO_IN_SCENA, tipoShopify: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["vendorShopify"], where: { ...FILTRO_IN_SCENA, vendorShopify: { not: null } }, _count: true }),
    prisma.prodotto.findMany({ where: { ...FILTRO_IN_SCENA, tagShopify: { not: null } }, select: { tagShopify: true } }),
    prisma.prodotto.findMany({
      where: {
        ...FILTRO_IN_SCENA,
        OR: [
          { zoneConsegna: { not: null } }, { cittaShopify: { not: null } }, { occasioniShopify: { not: null } },
          { classificazioneShopify: { not: null } }, { tipologiaShopify: { not: null } },
          { dataShopify: { not: null } }, { orarioShopify: { not: null } }, { bestSellerShopify: { not: null } },
        ],
      },
      select: {
        zoneConsegna: true, cittaShopify: true, occasioniShopify: true, classificazioneShopify: true,
        tipologiaShopify: true, dataShopify: true, orarioShopify: true, bestSellerShopify: true,
      },
    }),
  ]);

  // I nomi leggibili: la chiave salvata su `Prodotto.categoria` e l'id della
  // linea non si mostrano a nessuno.
  const [nomiCategoria, nomiLinea] = await Promise.all([
    prisma.categoriaProdotto.findMany({ select: { chiave: true, nome: true } }),
    prisma.lineaProdotto.findMany({ select: { id: true, nome: true } }),
  ]);
  const nomeCat = new Map(nomiCategoria.map((c) => [c.chiave, c.nome]));
  const nomeLin = new Map(nomiLinea.map((l) => [l.id, l.nome]));

  // I tag arrivano da Shopify in una stringa sola separata da virgole: si
  // contano uno per uno, perché è lì che vivono occasione e destinatario
  // (compleanno, matrimonio, per lei…).
  const conta = new Map<string, number>();
  for (const p of tagGrezzi) {
    for (const t of (p.tagShopify ?? "").split(",")) {
      const k = t.trim();
      if (k) conta.set(k, (conta.get(k) ?? 0) + 1);
    }
  }

  return {
    tipi: perNome(tipi.map((t) => ({ v: t.tipoShopify as string, n: t._count }))),
    categorie: perNome(categorie.map((c) => ({ v: c.categoria, n: c._count, etichetta: nomeCat.get(c.categoria) }))),
    fornitori: perNome(fornitori.map((f) => ({ v: f.vendorShopify as string, n: f._count }))),
    linee: perNome(linee.map((l) => ({ v: l.lineaId as string, n: l._count, etichetta: nomeLin.get(l.lineaId as string) }))),
    // Il taglio a 400 resta **per frequenza** — se si deve tagliare, si tengono i
    // tag che pesano — e solo dopo la lista va in ordine alfabetico.
    tag: perNome([...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VALORI).map(([v, n]) => ({ v, n }))),
    zone: perZona(contaElenco(zoneGrezze.map((x) => x.zoneConsegna))),
    citta: daElenco(zoneGrezze.map((x) => x.cittaShopify)),
    occasioni: daElenco(zoneGrezze.map((x) => x.occasioniShopify)),
    classificazioni: daElenco(zoneGrezze.map((x) => x.classificazioneShopify)),
    tipologieMeta: daElenco(zoneGrezze.map((x) => x.tipologiaShopify)),
    date: daElenco(zoneGrezze.map((x) => x.dataShopify)),
    orari: daElenco(zoneGrezze.map((x) => x.orarioShopify)),
    // Sì/No, coi conti veri: chi non ce l'ha segnato non sta in nessuno dei due,
    // perché «non lo sappiamo» non è «no».
    bestseller: [
      { v: "si", n: zoneGrezze.filter((x) => x.bestSellerShopify === true).length, etichetta: "Sì" },
      { v: "no", n: zoneGrezze.filter((x) => x.bestSellerShopify === false).length, etichetta: "No" },
    ],
  };
}

/** Le voci di un campo salvato come "a, b, c", in ordine alfabetico. */
const daElenco = (righe: (string | null)[]): VoceValore[] =>
  perNome([...contaElenco(righe).entries()].map(([v, n]) => ({ v, n })));

/** Conta i valori di elenchi salvati come "a, b, c". */
function contaElenco(righe: (string | null)[]): Map<string, number> {
  const c = new Map<string, number>();
  for (const r of righe) {
    for (const x of (r ?? "").split(",")) {
      const k = x.trim();
      if (k) c.set(k, (c.get(k) ?? 0) + 1);
    }
  }
  return c;
}

/**
 * Le zone si leggono in italiano: «ITALY-MONZA AND BRIANZA(MB)» diventa «Monza
 * and Brianza (MB)». Il **valore resta quello vero** del metafield: e' con
 * quello che la condizione confronta.
 */
function perZona(conta: Map<string, number>): VoceValore[] {
  return [...conta.entries()]
    .map(([v, n]) => {
      const m = v.match(/^[A-Z]+-(.+)\(([A-Z]{2})\)$/);
      return { v, n, etichetta: m ? `${titolo(m[1])} (${m[2]})` : titolo(v) };
    })
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it"));
}

/**
 * **Solo la prima lettera maiuscola**: «CDM FunnyCake» → «Cdm funnycake».
 *
 * I valori arrivano dal «Tipo» e dal «Venditore» di Shopify, scritti a mano negli
 * anni: nella stessa riga convivevano MAIUSCOLE, Maiuscole Ogni Parola e
 * minuscole, e un elenco di ottanta chip così si legge a fatica. Si tocca **solo
 * l'etichetta**: il valore mandato al server resta quello vero del negozio,
 * altrimenti la condizione non troverebbe più niente.
 */
const titolo = (s: string) => {
  const t = s.trim();
  return t ? t.charAt(0).toLocaleUpperCase("it") + t.slice(1).toLocaleLowerCase("it") : t;
};

/**
 * In **ordine alfabetico**, non per numero di prodotti. Con ottanta valori il
 * più frequente in testa non aiuta a trovare quello che si ha in mente: si sa
 * come si chiama, non quanti prodotti abbia. Il numero resta scritto sul chip.
 */
const perNome = (righe: { v: string; n: number | null; etichetta?: string | null }[]): VoceValore[] =>
  righe
    .map((x) => ({ v: x.v, n: x.n, etichetta: titolo(x.etichetta ?? x.v) }))
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, "it"));
