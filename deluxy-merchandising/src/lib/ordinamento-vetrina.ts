// Le regole con cui l'app **propone** l'ordine dei prodotti di una collezione in
// vetrina. È solo il punto di partenza: dopo si ritocca a mano con le frecce, e
// quello che resta è l'ordine che si spinge su Shopify.
//
// La regola non è un ordinamento "vivo" come le smart collection di Shopify:
// qui si materializza in un numero (`posizione`) su ogni prodotto, così l'ordine
// è stabile, si può correggere a mano e si può mandare al negozio uguale.

import { prisma } from "./db";
import { corrisponde, parsePassi, type Passo } from "./regole-ordine";
import { FILTRO_BUON_FINE } from "./vendite";

/**
 * **In scena ci va solo quello che il cliente vede.**
 *
 * Le collezioni del negozio contengono anche prodotti **archiviati** o in bozza
 * su Shopify: al 03/08/2026 sono la maggioranza di quello che l'import ha
 * portato (1.535 schede create su 2.273; su deluxy.it 1.847 prodotti archiviati
 * su 2.932, verificato a parte). Ordinare e spingere su Shopify una fila
 * calcolata anche su quelli vuol dire decidere l'ordine di una vetrina che non
 * esiste: restano in archivio — non si cancella niente — ma fuori dalla scena.
 *
 * **Due condizioni, e servono tutte e due.** `statoShopify` è lo stato letto dal
 * negozio a ogni import ed è quello che decide se il cliente lo vede; `fase` è
 * la leva **umana** (è così che si tolgono di mezzo le righe di servizio tipo
 * `_Additional Price`). Guardare solo la fase non bastava: i 2.171 prodotti nati
 * dal venduto hanno `fase = in_vendita` per default, anche quando sul negozio
 * sono archiviati — sarebbero rimasti in vetrina.
 *
 * `statoShopify` nullo = prodotto mai visto su un negozio: non sta in nessuna
 * collezione, quindi in vetrina non ci arriva comunque.
 */
export const FILTRO_IN_SCENA = { statoShopify: "ACTIVE", fase: { not: "archiviato" } } as const;

export type RegolaOrdinamento =
  | "manuale"
  | "best_seller"
  | "ricavo"
  | "novita"
  | "margine"
  | "prezzo_desc"
  | "prezzo_asc";

export const REGOLE: { chiave: RegolaOrdinamento; nome: string; spiega: string }[] = [
  { chiave: "best_seller", nome: "Più venduti in cima", spiega: "Chi ha venduto più pezzi (a buon fine) negli ultimi 90 giorni." },
  { chiave: "ricavo", nome: "Più fatturato in cima", spiega: "Chi ha incassato di più negli ultimi 90 giorni." },
  { chiave: "novita", nome: "Novità prima", spiega: "I prodotti pubblicati più di recente sul negozio; senza data di pubblicazione restano in fondo." },
  { chiave: "margine", nome: "Margine più alto in cima", spiega: "Dove il costo è inserito; i prodotti senza costo restano in fondo." },
  { chiave: "prezzo_desc", nome: "Prezzo alto in cima", spiega: "Dal listino più caro al più economico." },
  { chiave: "prezzo_asc", nome: "Prezzo basso in cima", spiega: "Dal listino più economico al più caro." },
  { chiave: "manuale", nome: "Solo a mano", spiega: "Nessuna regola: l'ordine lo decidi tu con le frecce." },
];

export function isRegola(v: unknown): v is RegolaOrdinamento {
  return typeof v === "string" && REGOLE.some((r) => r.chiave === v);
}

/**
 * Un ordine può essere fatto di **più regole in priorità**: la prima decide, le
 * successive spezzano i pareggi (più venduti → a parità, margine → a parità,
 * prezzo…). In `regolaOrdinamento` si salvano separate da virgola. `manuale`
 * non è una regola, quindi si scarta dall'elenco: [] significa «solo a mano».
 */
export function parseRegole(valore: string | null | undefined): RegolaOrdinamento[] {
  if (!valore) return [];
  const out: RegolaOrdinamento[] = [];
  for (const raw of valore.split(",")) {
    const v = raw.trim();
    if (isRegola(v) && v !== "manuale" && !out.includes(v)) out.push(v);
  }
  return out;
}

export function serializeRegole(regole: RegolaOrdinamento[]): string {
  const clean = regole.filter((r) => r !== "manuale");
  return clean.length ? clean.join(",") : "manuale";
}

/** Legge da un form la lista ordinata di regole (campi `regola`, in priorità). */
export function regoleDaForm(fd: FormData): RegolaOrdinamento[] {
  const out: RegolaOrdinamento[] = [];
  for (const v of fd.getAll("regola")) {
    if (isRegola(v) && v !== "manuale" && !out.includes(v)) out.push(v);
  }
  return out;
}

/** L'etichetta leggibile di un ordine, singolo o a più criteri: «A → B → C». */
export function etichettaRegola(valore: string | null | undefined): string {
  const rs = parseRegole(valore);
  if (rs.length === 0) return "Solo a mano";
  return rs.map((r) => REGOLE.find((x) => x.chiave === r)?.nome ?? r).join(" → ");
}

/** Il minimo che serve per ordinare un prodotto secondo le regole. */
export type ProdottoOrdinabile = {
  prodottoId: string;
  nome: string;
  prezzoVendita: number;
  costoProduzione: number;
  creatoIl: Date;
  /** Quando il negozio l'ha pubblicato: è **questa** la novità. */
  pubblicatoIlShopify?: Date | null;
  creatoIlShopify?: Date | null;
  posizione?: number; // l'ordine curato a mano, dove esiste
  // Gli attributi servono ai passi delle **regole salvate** («prima la categoria
  // Fiori», «prima chi sta sopra i 200 €»). Sono opzionali: chi ordina solo con
  // le metriche non ha bisogno di leggerli.
  categoria?: string | null;
  tipoShopify?: string | null;
  vendorShopify?: string | null;
  lineaId?: string | null;
  tagShopify?: string | null;
  ggDispMin?: number | null;
  zoneConsegna?: string | null;
  cittaShopify?: string | null;
  occasioniShopify?: string | null;
  tipologiaShopify?: string | null;
  classificazioneShopify?: string | null;
  dataShopify?: string | null;
  orarioShopify?: string | null;
  bestSellerShopify?: boolean | null;
  minimoOrario?: number | null;
};

/**
 * Ordina un insieme di prodotti secondo **una o più regole** in priorità: la
 * prima decide, le successive spezzano i pareggi, e il pareggio finale si spezza
 * col nome (così due esecuzioni danno lo stesso risultato).
 *
 * La usano sia l'ordine dentro una collezione sia l'anteprima di una tipologia:
 * una funzione sola, altrimenti lo stesso concetto finirebbe per ordinare in due
 * modi diversi.
 */
export async function ordinaProdotti<T extends ProdottoOrdinabile>(
  items: T[],
  regole: RegolaOrdinamento[],
  giorni = 90
): Promise<T[]> {
  return ordinaPerPassi(
    items,
    regole.filter((r) => r !== "manuale").map((m) => ({ t: "metrica" as const, m })),
    giorni,
  );
}

/**
 * Ordina secondo i **passi di una regola salvata**: metriche e attributi
 * mescolati, in priorità. È la funzione vera; `ordinaProdotti` è il caso
 * particolare in cui i passi sono tutti metriche — **una sola implementazione**,
 * così una regola salvata e una regola rapida non ordinano in due modi diversi.
 *
 * Un passo di attributo vale 1 se il prodotto corrisponde e 0 se no, e si ordina
 * decrescente come tutto il resto: **chi corrisponde sale, gli altri restano
 * sotto**, nessuno esce dalla fila.
 */
export async function ordinaPerPassi<T extends ProdottoOrdinabile>(
  items: T[],
  passi: Passo[],
  giorni = 90
): Promise<T[]> {
  const effettive = passi.filter((p) => p.t !== "metrica" || p.m !== "manuale");
  if (effettive.length === 0) {
    return [...items].sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0) || a.nome.localeCompare(b.nome));
  }
  // **Le condizioni sono i gruppi, le metriche dicono come si ordina dentro.**
  const celle = effettive.filter((p) => p.t !== "metrica");
  // Le metriche scelte **da sole**, come passo a sé: valgono per tutti, perché
  // non hanno una cella a cui appartenere.
  const globali = effettive
    .filter((p): p is { t: "metrica"; m: RegolaOrdinamento } => p.t === "metrica")
    .map((p) => p.m);
  const metriche = [...globali, ...celle.flatMap((c) => (c.t === "cella" ? c.m ?? [] : []))];

  let venduto = new Map<string, { pezzi: number; ricavo: number }>();
  if (metriche.some((r) => r === "best_seller" || r === "ricavo")) {
    const da = new Date();
    da.setDate(da.getDate() - giorni);
    // Si raggruppa tutto il venduto della finestra invece di elencare gli id:
    // una lista lunga rende la query più pesante del giro completo.
    const agg = await prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { ...FILTRO_BUON_FINE, data: { gte: da } },
      _sum: { quantita: true, ricavo: true },
    });
    venduto = new Map(
      agg
        .filter((a) => a.prodottoId)
        .map((a) => [a.prodottoId as string, { pezzi: a._sum.quantita ?? 0, ricavo: a._sum.ricavo ?? 0 }])
    );
  }

  // Valore per una singola regola: più alto = più in cima (prezzo_asc torna il
  // prezzo negato, così la logica di ordinamento è sempre «decrescente»).
  const valore = (m: T, regola: RegolaOrdinamento): number => {
    const v = venduto.get(m.prodottoId);
    const prezzo = m.prezzoVendita || 0;
    const costo = m.costoProduzione || 0;
    switch (regola) {
      case "best_seller":
        return v?.pezzi ?? 0;
      case "ricavo":
        return v?.ricavo ?? 0;
      case "novita":
        // **Novità = quando il negozio l'ha pubblicato**, scelta dell'utente:
        // è il momento in cui il cliente ha potuto vederlo.
        //
        // **Senza quella data il prodotto va in fondo, non in cima.** Il ripiego
        // su `creatoIl` — la data della *nostra* scheda, luglio/agosto 2026 per
        // tutto il catalogo — era più recente di **qualunque** pubblicazione
        // vera: chi non aveva ancora la data risultava la novità più fresca del
        // negozio. È successo davvero: «Pregiate Praline» (senza data) scavalcava
        // «Gelato Premium», pubblicato il 07/05/2026 — segnalato dall'utente.
        // Vale la regola del resto dell'app, la stessa del margine senza costo:
        // un dato che manca si esclude, non vale zero e non vale «oggi».
        return (m.pubblicatoIlShopify ?? m.creatoIlShopify)?.getTime() ?? -Infinity;
      case "margine":
        // Senza costo il margine non si sa: va in fondo, non a zero (stessa
        // regola del resto dell'app: un dato mancante si esclude, non vale 0).
        return prezzo > 0 && costo > 0 ? (prezzo - costo) / prezzo : -Infinity;
      case "prezzo_desc":
        return prezzo;
      case "prezzo_asc":
        return -prezzo;
      default:
        return 0;
    }
  };

  /** Confronta due prodotti su una lista di metriche in priorità. */
  const perMetriche = (a: T, b: T, ms: RegolaOrdinamento[]): number => {
    for (const m of ms) {
      if (m === "manuale") continue;
      const d = valore(b, m) - valore(a, m);
      if (d !== 0) return d;
    }
    return 0;
  };

  // Senza condizioni non ci sono gruppi: è il caso delle regole rapide, dove le
  // metriche mettono in fila tutti.
  if (celle.length === 0) {
    return [...items].sort((a, b) => perMetriche(a, b, globali) || a.nome.localeCompare(b.nome));
  }

  // **Ogni condizione pesca dal suo insieme, anche se è lo stesso di un'altra.**
  //
  // Prima un prodotto apparteneva al *primo* passo che lo prendeva, e due passi
  // con la stessa condizione erano uno di troppo: il secondo restava a mani
  // vuote. Ma due passi possono avere la stessa condizione e **metriche
  // diverse** — «i fiori più nuovi e cari» e «i fiori più economici» — e non
  // sono la stessa cosa: in vetrina si alternano (segnalato dall'utente: «sono
  // condizioni differenti»).
  //
  // Quindi ogni passo ordina **tutti** i prodotti che gli corrispondono, con le
  // sue metriche; poi si va a turno e ognuno mette il suo prossimo prodotto
  // **non ancora piazzato**. Nessun doppione, e nessun passo resta muto solo
  // perché un altro guarda lo stesso scaffale.
  const gruppi: T[][] = celle.map((c) => {
    const sue = c.t === "cella" ? c.m ?? [] : [];
    const ms = [...sue, ...globali];
    return items.filter((x) => corrisponde(x, c)).sort((a, b) => perMetriche(a, b, ms) || a.nome.localeCompare(b.nome));
  });
  const fuori = items
    .filter((x) => !celle.some((c) => corrisponde(x, c)))
    .sort((a, b) => perMetriche(a, b, globali) || a.nome.localeCompare(b.nome));

  // **A turno, uno per condizione.** Con le condizioni come sole priorità la fila
  // usciva a blocchi — tutti i fiori sopra i 300 €, poi tutte le torte — e in
  // cima si vedevano settantatré bouquet di fila, mentre le condizioni 2, 3 e 4
  // non comparivano finché non finiva la prima: cioè mai, per chi guarda la
  // prima riga della vetrina. Ogni condizione è **una cosa che deve esserci**,
  // non una fetta da esaurire. Chi non ha più prodotti da mettere viene saltato;
  // chi nessuna condizione prende resta in fondo, com'era.
  const out: T[] = [];
  const piazzati = new Set<string>();
  const prossimo = celle.map(() => 0);
  for (;;) {
    let messo = false;
    for (let i = 0; i < gruppi.length; i++) {
      while (prossimo[i] < gruppi[i].length && piazzati.has(gruppi[i][prossimo[i]].prodottoId)) prossimo[i]++;
      if (prossimo[i] < gruppi[i].length) {
        const x = gruppi[i][prossimo[i]++];
        piazzati.add(x.prodottoId);
        out.push(x);
        messo = true;
      }
    }
    if (!messo) break;
  }
  return [...out, ...fuori];
}

/**
 * **Quanti prodotti mette in fila ogni condizione**, con le stesse regole di
 * `ordinaPerPassi`: serve a dire in pagina «questo passo porta N prodotti» e a
 * riconoscere quello che non ne porta nessuno. Rifà il giro invece di dedurlo
 * dalla fila finita, perché dedurlo vorrebbe dire riscrivere la stessa logica
 * una seconda volta — ed è così che due parti dell'app cominciano a raccontare
 * cose diverse.
 */
export function quantiPerPasso<T extends ProdottoOrdinabile>(items: T[], passi: Passo[]): number[] {
  const celle = passi.filter((p) => p.t !== "metrica");
  if (celle.length === 0) return passi.map(() => 0);
  const gruppi = celle.map((c) => items.filter((x) => corrisponde(x, c)).map((x) => x.prodottoId));
  const quanti = celle.map(() => 0);
  const piazzati = new Set<string>();
  const prossimo = celle.map(() => 0);
  for (;;) {
    let messo = false;
    for (let i = 0; i < gruppi.length; i++) {
      while (prossimo[i] < gruppi[i].length && piazzati.has(gruppi[i][prossimo[i]])) prossimo[i]++;
      if (prossimo[i] < gruppi[i].length) {
        piazzati.add(gruppi[i][prossimo[i]++]);
        quanti[i]++;
        messo = true;
      }
    }
    if (!messo) break;
  }
  // Rimesso nell'ordine dei passi originali (le metriche a sé valgono 0).
  const out: number[] = [];
  let k = 0;
  for (const p of passi) out.push(p.t === "metrica" ? 0 : quanti[k++]);
  return out;
}


/**
 * L'ordine dei prodotti di una collezione secondo una o più regole. Ritorna gli
 * id prodotto nell'ordine nuovo; **non scrive niente** — la scrittura la fa
 * `numeraPosizioni`.
 */
export async function ordineSecondoRegole(
  collezioneId: string,
  regole: RegolaOrdinamento[],
  giorni = 90
): Promise<string[]> {
  return ordineSecondoPassi(
    collezioneId,
    regole.filter((r) => r !== "manuale").map((m) => ({ t: "metrica" as const, m })),
    giorni,
  );
}

/** Gli attributi che servono ai passi delle regole salvate, letti una volta sola. */
const SELECT_ORDINABILE = {
  nome: true,
  prezzoVendita: true,
  costoProduzione: true,
  creatoIl: true,
  categoria: true,
  tipoShopify: true,
  vendorShopify: true,
  lineaId: true,
  tagShopify: true,
  ggDispMin: true,
  zoneConsegna: true,
  cittaShopify: true,
  pubblicatoIlShopify: true,
  creatoIlShopify: true,
  occasioniShopify: true,
  tipologiaShopify: true,
  classificazioneShopify: true,
  dataShopify: true,
  orarioShopify: true,
  bestSellerShopify: true,
  minimoOrario: true,
} as const;

/** Come sopra, ma coi **passi** di una regola salvata (metriche + attributi). */
/**
 * **Rimescola dentro i gruppi della regola, senza cambiare i gruppi.**
 *
 * Una regola a celle mette in cima sempre gli stessi: la cella prende venti
 * prodotti e il primo e' sempre quello. Qui, ogni `ogniGiorni`, **tocca a un
 * altro dello stesso gruppo** — stesse condizioni, alternativa diversa. I gruppi
 * restano dove sono: chi era in cima ci resta come gruppo, cambia chi lo
 * rappresenta.
 *
 * Il turno si calcola **dalla data**, non da un contatore salvato: due esecuzioni
 * nello stesso periodo danno la stessa fila, e non c'e' uno stato che puo'
 * disallinearsi. Il gruppo di un prodotto e' il **primo passo che lo prende**;
 * chi non e' preso da nessuno forma l'ultimo gruppo, e ruota anche lui.
 */
export function ruotaDentroIGruppi<T extends ProdottoOrdinabile>(
  items: T[],
  passi: Passo[],
  ogniGiorni: number,
  adesso = new Date()
): T[] {
  if (!ogniGiorni || ogniGiorni <= 0 || items.length < 2) return items;
  const giro = Math.floor(adesso.getTime() / (ogniGiorni * 24 * 60 * 60 * 1000));
  const celle = passi.filter((p) => p.t !== "metrica");
  const gruppoDi = (x: T) => {
    const i = celle.findIndex((p) => corrisponde(x, p));
    return i < 0 ? celle.length : i; // chi non e' preso sta nell'ultimo gruppo
  };
  const posizioni = new Map<number, number[]>();
  items.forEach((x, i) => {
    const g = gruppoDi(x);
    if (!posizioni.has(g)) posizioni.set(g, []);
    posizioni.get(g)!.push(i);
  });
  const out = [...items];
  for (const idx of posizioni.values()) {
    if (idx.length < 2) continue;
    const k = giro % idx.length;
    // Si ruotano **gli occupanti**, non le posizioni: il gruppo resta dov'era.
    idx.forEach((posto, j) => {
      out[posto] = items[idx[(j + k) % idx.length]];
    });
  }
  return out;
}

export async function ordineSecondoPassi(
  collezioneId: string,
  passi: Passo[],
  giorni = 90,
  rotazioneGiorni = 0
): Promise<string[]> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodotto: FILTRO_IN_SCENA },
    select: { prodottoId: true, posizione: true, prodotto: { select: SELECT_ORDINABILE } },
  });
  const items = membri.map((m) => ({ prodottoId: m.prodottoId, posizione: m.posizione, ...m.prodotto }));
  const fila = await ordinaPerPassi(items, passi, giorni);
  return ruotaDentroIGruppi(fila, passi, rotazioneGiorni).map((m) => m.prodottoId);
}

/**
 * Applica una o più regole a una collezione: materializza l'ordine in
 * `posizione` e segna sulla collezione quali regole e che l'ordine è cambiato.
 * Nessuna regola effettiva (solo «manuale») non tocca le posizioni ma resta
 * registrato. Riusata da: azione di pagina, assegnazione a tipologia, riapplico
 * standing all'import — una funzione sola, così non divergono.
 */
export async function applicaRegoleACollezione(
  collezioneId: string,
  regole: RegolaOrdinamento[]
): Promise<void> {
  const effettive = regole.filter((r) => r !== "manuale");
  if (effettive.length > 0) {
    const ordine = await ordineSecondoRegole(collezioneId, effettive);
    await numeraPosizioni(collezioneId, ordine);
  }
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    // Scegliendo una regola rapida si stacca l'eventuale regola salvata: due
    // ordini impostati insieme sulla stessa collezione non si saprebbe quale
    // legge la pagina.
    data: { regolaOrdinamento: serializeRegole(regole), regolaOrdineId: null, ordineModificatoIl: new Date() },
  });
}

/**
 * Applica una **regola salvata** a una collezione: stessa cosa di sopra, ma i
 * passi arrivano dalla regola e sulla collezione resta scritto **quale** regola
 * è (non una copia dei suoi passi). Così cambiando la regola cambia l'ordine di
 * tutte le collezioni che la usano, che è il motivo per cui si salva.
 */
export async function applicaRegolaSalvata(collezioneId: string, regolaOrdineId: string): Promise<void> {
  const r = await prisma.regolaOrdine.findUnique({
    where: { id: regolaOrdineId },
    select: { passi: true, rotazioneGiorni: true },
  });
  const passi = parsePassi(r?.passi);
  if (passi.length > 0) {
    const ordine = await ordineSecondoPassi(collezioneId, passi, 90, r?.rotazioneGiorni ?? 0);
    await numeraPosizioni(collezioneId, ordine);
  }
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { regolaOrdineId, regolaOrdinamento: null, ordineModificatoIl: new Date() },
  });
}

/**
 * Riapplica le regole **standing** delle tipologie alle collezioni di un negozio.
 * Serve all'import: quando arrivano prodotti nuovi, una collezione gestita da una
 * tipologia con regola li deve risistemare da sola invece di lasciarli in fondo.
 * Le collezioni **senza** tipologia (o con tipologia senza regola) non si toccano:
 * lì l'ordine è curato a mano e non va sovrascritto. Ritorna quante ne ha rifatte.
 */
export async function riapplicaStandingPerNegozio(negozio: string): Promise<number> {
  const colls = await prisma.collezioneShopify.findMany({
    where: {
      negozio,
      tipologia: { is: { OR: [{ regolaOrdinamento: { not: null } }, { regolaOrdineId: { not: null } }] } },
    },
    select: {
      id: true,
      tipologia: { select: { regolaOrdinamento: true, regolaOrdine: { select: { id: true, passi: true } } } },
    },
  });
  let fatte = 0;
  for (const c of colls) {
    // La **regola salvata vince** su quella rapida, come in pagina: se una
    // tipologia ne ha una, è quella che l'utente ha scritto e riusa.
    const salvata = c.tipologia?.regolaOrdine;
    if (salvata && parsePassi(salvata.passi).length > 0) {
      await applicaRegolaSalvata(c.id, salvata.id);
      fatte++;
      continue;
    }
    const rs = parseRegole(c.tipologia?.regolaOrdinamento);
    if (rs.length > 0) {
      await applicaRegoleACollezione(c.id, rs);
      fatte++;
    }
  }
  return fatte;
}

/**
 * Scrive `posizione = 0..n-1` seguendo l'ordine dato. A blocchi e non in una
 * transazione unica: una collezione grande può avere migliaia di prodotti e una
 * transazione così lunga andrebbe in timeout.
 */
export async function numeraPosizioni(collezioneId: string, ordineProdottoId: string[]): Promise<void> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId },
    select: { id: true, prodottoId: true },
  });
  const idPerProdotto = new Map(membri.map((m) => [m.prodottoId, m.id]));
  for (let i = 0; i < ordineProdottoId.length; i += 50) {
    await Promise.all(
      ordineProdottoId.slice(i, i + 50).map((pid, k) => {
        const rigaId = idPerProdotto.get(pid);
        return rigaId
          ? prisma.prodottoInCollezioneShopify.update({ where: { id: rigaId }, data: { posizione: i + k } })
          : Promise.resolve();
      })
    );
  }
}
