"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { tokenDi } from "./negozi";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";
import { numeraPosizioni, applicaRegoleACollezione, regoleDaForm, FILTRO_IN_SCENA } from "./ordinamento-vetrina";

/** Applica una o più regole in priorità: propone l'ordine come punto di partenza. */
export async function applicaRegolaOrdinamento(collezioneId: string, fd: FormData) {
  await applicaRegoleACollezione(collezioneId, regoleDaForm(fd));
  revalidatePath(`/visual/${collezioneId}`);
}

/** Ritocco a mano: sposta un prodotto su o giù di una posizione. */
export async function spostaInCollezione(
  collezioneId: string,
  prodottoId: string,
  direzione: "su" | "giu"
) {
  // Ordinato per posizione e, a pari posizione, per nome: lo stesso ordine che
  // la pagina mostra, così le frecce spostano rispetto a quello che si vede.
  // **Solo i prodotti in scena**: gli archiviati stanno in mezzo nel database ma
  // non a schermo, e senza questo filtro una freccia avrebbe scavalcato un
  // prodotto invisibile sembrando non fare niente.
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodotto: FILTRO_IN_SCENA },
    orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
    select: { prodottoId: true },
  });
  const ordine = membri.map((m) => m.prodottoId);
  const i = ordine.indexOf(prodottoId);
  if (i === -1) return;
  const j = direzione === "su" ? i - 1 : i + 1;
  if (j < 0 || j >= ordine.length) return;
  [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  await numeraPosizioni(collezioneId, ordine);
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordineModificatoIl: new Date() },
  });
  revalidatePath(`/visual/${collezioneId}`);
}


/**
 * **Toglie un prodotto dalla collezione, sul negozio vero.**
 *
 * Toglierlo solo qui sarebbe una bugia che dura fino al prossimo import: le
 * appartenenze si rileggono da Shopify, e il prodotto tornerebbe. Quindi si
 * chiama `collectionRemoveProducts` e **solo se il negozio conferma** si toglie
 * anche la riga locale.
 *
 * Gli stessi paletti del riordino, per lo stesso motivo:
 * - **solo collezioni manuali** — in una smart collection chi ci sta dentro lo
 *   decide la regola di Shopify: togliere un prodotto a mano non è previsto, e
 *   alla prima rivalutazione tornerebbe comunque;
 * - serve un **token con `write_products`**.
 *
 * Il prodotto **non viene cancellato né archiviato**: esce da questa collezione
 * e basta. Resta a catalogo, nelle altre collezioni e nelle vendite.
 */
export async function rimuoviProdottoDaCollezione(collezioneId: string, prodottoId: string) {
  const errore = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) errore("Collezione non trovata.");
  if (c!.tipo !== "manuale") {
    errore(
      "È una collezione automatica: chi ci sta dentro lo decide la regola di Shopify. Per togliere questo prodotto va cambiata la regola sul negozio.",
    );
  }

  const riga = await prisma.prodottoInCollezioneShopify.findFirst({
    where: { collezioneId, prodottoId },
    select: { id: true, posizione: true, prodottoShopifyId: true, prodotto: { select: { nome: true } } },
  });
  if (!riga) errore("Questo prodotto non risulta in questa collezione.");
  if (!riga!.prodottoShopifyId) {
    errore("Di questo prodotto non conosciamo l'id su Shopify: rilancia l'import delle collezioni e riprova.");
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c!.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) errore(`Il negozio «${c!.negozio}» non è collegato: serve un token con write_products in Impostazioni.`);

  const r = await graphqlNegozio(
    accesso!.dominio,
    accesso!.token,
    `mutation($id: ID!, $productIds: [ID!]!) {
       collectionRemoveProducts(id: $id, productIds: $productIds) {
         job { id done }
         userErrors { field message }
       }
     }`,
    { id: c!.shopifyId, productIds: [riga!.prodottoShopifyId] },
  );
  // erroriDi e non l'estrazione a mano: conta anche lo status HTTP, così un 502
  // senza corpo non passa per un successo.
  const err = erroriDi(r, "collectionRemoveProducts");
  if (err.length) errore(`Shopify ha rifiutato: ${err.join(" · ")}`);

  // Solo adesso si toglie la riga qui: se il negozio avesse detto no, l'app
  // avrebbe mostrato una collezione diversa da quella vera.
  await prisma.prodottoInCollezioneShopify.delete({ where: { id: riga!.id } });

  // **Niente `redirect` quando va bene, ed è il punto.** Togliere è un gesto che
  // si ripete: si scorre la fila e se ne tolgono tre o quattro. Ogni `redirect`
  // è una navigazione, e una navigazione riporta la pagina all'inizio; ancorarla
  // alla riga non basta, perché il browser porta quella riga **in cima al
  // riquadro** e la vista si sposta lo stesso — segnalato dall'utente due volte.
  // Con la sola `revalidatePath` React riscrive l'elenco **in posto** e lo
  // scorrimento resta dov'era, esattamente come già succedeva con le frecce.
  // Il riscontro è la riga che sparisce: non serve un messaggio in cima.
  // Sull'**errore** invece il redirect resta: lì un messaggio ci vuole, e capita
  // di rado.
  revalidatePath(`/visual/${collezioneId}`);
}

/**
 * Spinge su Shopify l'ordine curato qui, con `collectionReorderProducts`.
 *
 * Tre paletti, tutti dichiarati all'utente e mai aggirati:
 * - **solo collezioni manuali**: una smart collection si ordina da sola per
 *   regola, Shopify non accetta un ordine a mano;
 * - serve un **token con `write_products`** collegato al negozio della
 *   collezione;
 * - prima si mette il `sortOrder` a MANUAL, poi si riordina: altrimenti Shopify
 *   rifiuta le mosse.
 */
export async function spingiOrdineSuShopify(collezioneId: string) {
  const esito = await spingiOrdineSuShopifySilenzioso(collezioneId);
  if (esito !== true) {
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(esito)}`);
  }
  revalidatePath(`/visual/${collezioneId}`);
  redirect(
    `/visual/${collezioneId}?esito=ok&messaggio=${encodeURIComponent(
      "Ordine inviato a Shopify. Il negozio lo applica in pochi istanti."
    )}`
  );
}

/**
 * Lo stesso invio, ma **senza redirect**: torna `true` se è andata, altrimenti il
 * messaggio dell'errore. Serve alla rotazione automatica, che gira da un cron e
 * non ha nessuna pagina dove mandare l'utente — e a chiunque debba sapere com'è
 * finita invece di essere sbalzato altrove.
 */
export async function spingiOrdineSuShopifySilenzioso(collezioneId: string): Promise<true | string> {
  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) return "Collezione non trovata.";

  // **Nessun rifiuto per le collezioni automatiche.** Qui c'era un controllo
  // `tipo !== "manuale"` che le escludeva, con la spiegazione «l'ordine lo decide
  // la regola»: sbagliata. Su Shopify il `ruleSet` decide **chi entra**, il
  // `sortOrder` decide **in che ordine** — e una smart collection può avere
  // benissimo `sortOrder: MANUAL`. Al 03/08/2026 erano **212 collezioni su 343**,
  // il gruppo più grosso, escluse dal riordino per un motivo che non esisteva.
  // Se il sortOrder non è MANUAL lo si mette, come già si faceva più sotto.

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) {
    return `Il negozio «${c.negozio}» non è collegato: collega un token con write_products in Impostazioni.`;
  }

  // Si manda **solo la fila in scena**: mettere in ordine anche gli archiviati
  // vorrebbe dire decidere la posizione di prodotti che il cliente non vede, e
  // la fila spinta non corrisponderebbe a quella mostrata qui.
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodottoShopifyId: { not: null }, prodotto: FILTRO_IN_SCENA },
    orderBy: { posizione: "asc" },
    select: { prodottoShopifyId: true },
  });
  if (membri.length === 0) {
    return "Nessun prodotto in vendita con un id Shopify: o sono tutti archiviati sul negozio, o va rilanciato l'import delle collezioni.";
  }

  // 1) sortOrder = MANUAL (se non lo è già): senza, il riordino viene rifiutato.
  if (c.ordinamento !== "MANUAL") {
    const r1 = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `mutation($input: CollectionInput!) {
         collectionUpdate(input: $input) { collection { id sortOrder } userErrors { field message } }
       }`,
      { input: { id: c.shopifyId, sortOrder: "MANUAL" } }
    );
    const err = erroriDi(r1, "collectionUpdate");
    if (err.length) return `Shopify non ha messo l'ordine su «manuale»: ${err.join(" · ")}`;
    // Da qui in poi la collezione **non si riordina più da sola** sul negozio:
    // era «${c.ordinamento}», adesso è manuale. È una conseguenza vera del
    // gesto, e va detta in pagina prima di premere, non scoperta dopo.
  }

  // 2) le mosse, a blocchi: si riordina tutto verso la testa nell'ordine curato.
  const moves = membri.map((m, i) => ({ id: m.prodottoShopifyId as string, newPosition: String(i) }));
  for (let i = 0; i < moves.length; i += 200) {
    const r2 = await graphqlNegozio(
      accesso.dominio,
      accesso.token,
      `mutation($id: ID!, $moves: [MoveInput!]!) {
         collectionReorderProducts(id: $id, moves: $moves) {
           job { id done }
           userErrors { field message }
         }
       }`,
      { id: c.shopifyId, moves: moves.slice(i, i + 200) }
    );
    const err = erroriDi(r2, "collectionReorderProducts");
    if (err.length) return `Shopify ha rifiutato il riordino: ${err.join(" · ")}`;
  }

  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordinamento: "MANUAL", ordineSpintoIl: new Date() },
  });
  return true;
}

/** Gli id scelti con le caselle, nell'ordine in cui il form li manda. */
const sceltiDa = (fd: FormData) => fd.getAll("scelti").map(String).filter(Boolean);

/**
 * **Sposta in blocco i prodotti scelti**: all'inizio, alla fine, o a una
 * posizione precisa.
 *
 * Con 64 righe spostarne dieci con le frecce vuol dire un centinaio di clic:
 * questa è la stessa cosa, fatta una volta.
 *
 * I prodotti scelti **mantengono l'ordine relativo** che avevano: chi era prima
 * resta prima. Riordinarli anche fra loro sarebbe una seconda decisione che
 * nessuno ha chiesto.
 *
 * La posizione è quella **che si legge in pagina** (1 = primo). Fuori intervallo
 * si accosta all'estremo più vicino invece di rifiutare: chi scrive 999 sta
 * dicendo «in fondo».
 */
export async function spostaSceltiInCollezione(
  collezioneId: string,
  dove: "inizio" | "fine" | "posizione",
  fd: FormData,
) {
  const scelti = sceltiDa(fd);
  if (scelti.length === 0) return;

  // Solo la fila in scena, come le frecce: gli archiviati non si mettono in
  // ordine perché il cliente non li vede.
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodotto: FILTRO_IN_SCENA },
    orderBy: [{ posizione: "asc" }, { prodotto: { nome: "asc" } }],
    select: { prodottoId: true },
  });
  const ordine = membri.map((m) => m.prodottoId);
  const insieme = new Set(scelti);
  const spostati = ordine.filter((x) => insieme.has(x)); // nell'ordine attuale
  const restanti = ordine.filter((x) => !insieme.has(x));
  if (spostati.length === 0) return;

  let indice: number;
  if (dove === "inizio") indice = 0;
  else if (dove === "fine") indice = restanti.length;
  else {
    const n = Number.parseInt(String(fd.get("posizione") ?? ""), 10);
    // In pagina la prima riga è la 1; qui gli indici partono da 0.
    indice = Number.isFinite(n) ? Math.min(Math.max(n - 1, 0), restanti.length) : restanti.length;
  }

  const nuovo = [...restanti.slice(0, indice), ...spostati, ...restanti.slice(indice)];
  await numeraPosizioni(collezioneId, nuovo);
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { ordineModificatoIl: new Date() },
  });
  // Nessun redirect: React riscrive la fila in posto e lo scorrimento resta.
  revalidatePath(`/visual/${collezioneId}`);
  revalidatePath(`/collezioni/shopify/${collezioneId}`);
}

/**
 * **Toglie in blocco i prodotti scelti dalla collezione, sul negozio.**
 *
 * A blocchi di **250**, che è quanti ne accetta `collectionRemoveProducts` per
 * chiamata (il commento diceva «Shopify la accetta» — vero solo fino a 250, e
 * con «Tutti» la pagina ne spunta fino a 300). Ogni blocco cancella le sue
 * righe locali **subito dopo** la conferma del negozio, non tutte alla fine:
 * se il secondo blocco fallisce, il primo è uscito sul sito e deve risultare
 * uscito anche qui — stessa lezione di `potaCollezione`.
 */
export async function rimuoviSceltiDaCollezione(collezioneId: string, fd: FormData) {
  const scelti = sceltiDa(fd);
  if (scelti.length === 0) return;
  // **La spunta di conferma e' obbligatoria.** Senza, un clic distratto con
  // «Tutti» attivo svuota una vetrina vera: e' successo su
  // «Home-Page-Last-Minute», passata da 51 prodotti attivi a 5. Il pulsante da
  // solo non basta come consenso per una scrittura in blocco sul negozio.
  if (String(fd.get("confermoRimozione") ?? "") !== "1") {
    redirect(
      `/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(
        "Per togliere piu' prodotti insieme serve anche la spunta «Ho controllato quali sono»: e' una scrittura sul negozio e cambia subito la vetrina.",
      )}`,
    );
  }

  const errore = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) errore("Collezione non trovata.");
  if (c!.tipo !== "manuale") {
    errore(
      "È una collezione automatica: chi ci sta dentro lo decide la regola di Shopify. Per togliere questi prodotti va cambiata la regola sul negozio.",
    );
  }

  const righe = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodottoId: { in: scelti }, prodottoShopifyId: { not: null } },
    select: { id: true, prodottoShopifyId: true },
  });
  if (righe.length === 0) {
    errore("Di questi prodotti non conosciamo l'id su Shopify: rilancia l'import delle collezioni e riprova.");
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c!.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) errore(`Il negozio «${c!.negozio}» non è collegato: serve un token con write_products in Impostazioni.`);

  const PER_CHIAMATA = 250;
  let tolti = 0;
  for (let i = 0; i < righe.length; i += PER_CHIAMATA) {
    const blocco = righe.slice(i, i + PER_CHIAMATA);
    const r = await graphqlNegozio(
      accesso!.dominio,
      accesso!.token,
      `mutation($id: ID!, $productIds: [ID!]!) {
         collectionRemoveProducts(id: $id, productIds: $productIds) {
           job { id done }
           userErrors { field message }
         }
       }`,
      { id: c!.shopifyId, productIds: blocco.map((x) => x.prodottoShopifyId as string) },
    );
    const err = erroriDi(r, "collectionRemoveProducts");
    if (err.length) {
      errore(
        tolti === 0
          ? `Shopify ha rifiutato: ${err.join(" · ")}`
          : `Shopify ha rifiutato dopo i primi ${tolti}: ${err.join(" · ")}. Quei ${tolti} sono usciti davvero; ripremi per gli altri.`,
      );
    }
    await prisma.prodottoInCollezioneShopify.deleteMany({ where: { id: { in: blocco.map((x) => x.id) } } });
    tolti += blocco.length;
  }
  revalidatePath(`/visual/${collezioneId}`);
  revalidatePath(`/collezioni/shopify/${collezioneId}`);
}

/**
 * **Aggiunge i prodotti scelti alla collezione, sul negozio.**
 *
 * Speculare alla rimozione, con gli stessi paletti e lo stesso ordine: prima
 * `collectionAddProducts` su Shopify, e **solo se il negozio accetta** nascono
 * le righe qui. Al contrario si mostrerebbe una collezione che il cliente non
 * vede, e il primo import la smentirebbe.
 *
 * Solo **collezioni manuali**: in una smart collection chi entra lo decide la
 * regola di Shopify, e un prodotto messo a mano ne uscirebbe alla prima
 * rivalutazione.
 *
 * I nuovi entrano **in fondo**: davanti scavalcherebbero una fila già decisa.
 */
export async function aggiungiProdottiACollezione(collezioneId: string, fd: FormData) {
  const scelti = fd.getAll("aggiungi").map(String).filter(Boolean);
  if (scelti.length === 0) return;

  const errore = (m: string) =>
    redirect(`/visual/${collezioneId}?esito=errore&messaggio=${encodeURIComponent(m)}`);

  const c = await prisma.collezioneShopify.findUnique({ where: { id: collezioneId } });
  if (!c) errore("Collezione non trovata.");
  if (c!.tipo !== "manuale") {
    errore(
      "È una collezione automatica: chi ci sta dentro lo decide la regola di Shopify. Per farci entrare questi prodotti va cambiata la regola sul negozio.",
    );
  }

  const prodotti = await prisma.prodotto.findMany({
    where: { id: { in: scelti }, shopifyId: { not: null } },
    select: { id: true, shopifyId: true },
  });
  if (prodotti.length === 0) {
    errore("Di questi prodotti non conosciamo l'id su Shopify: rilancia l'import e riprova.");
  }

  const negozio = await prisma.negozioShopify.findFirst({ where: { nome: c!.negozio }, select: { id: true } });
  const accesso = negozio ? await tokenDi(negozio.id) : null;
  if (!accesso) errore(`Il negozio «${c!.negozio}» non è collegato: serve un token con write_products in Impostazioni.`);

  const rAgg = await graphqlNegozio(
    accesso!.dominio,
    accesso!.token,
    `mutation($id: ID!, $productIds: [ID!]!) {
       collectionAddProducts(id: $id, productIds: $productIds) {
         collection { id }
         userErrors { field message }
       }
     }`,
    { id: c!.shopifyId, productIds: prodotti.map((p) => p.shopifyId as string) },
  );
  const err = erroriDi(rAgg, "collectionAddProducts");
  if (err.length) errore(`Shopify ha rifiutato: ${err.join(" · ")}`);

  const ultima = await prisma.prodottoInCollezioneShopify.aggregate({
    where: { collezioneId },
    _max: { posizione: true },
  });
  let posizione = (ultima._max.posizione ?? -1) + 1;
  await prisma.prodottoInCollezioneShopify.createMany({
    data: prodotti.map((p) => ({
      collezioneId,
      prodottoId: p.id,
      prodottoShopifyId: p.shopifyId as string,
      posizione: posizione++,
    })),
    skipDuplicates: true,
  });

  revalidatePath(`/visual/${collezioneId}`);
  revalidatePath(`/collezioni/shopify/${collezioneId}`);
}
