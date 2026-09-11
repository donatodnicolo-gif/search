import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  campiDaPiattaforma,
  daPiattaforma,
  mancanzePerApprovare,
  seoAutomatica,
  variantiDaPiattaforma,
  type ProdottoDaPiattaforma,
} from "@/lib/prodotti-dal-partner";

export const dynamic = "force-dynamic";

// Prodotti di Merchandising per le altre app Deluxy.
//
// Perché esiste: il prodotto nasce in due posti diversi e nessuno dei due è
// sbagliato. Quelli **nostri** nascono qui — è il PLM: brief, materiali,
// palette, costi, collezioni, fase del ciclo di vita. Quelli di un **partner**
// nascono nella piattaforma consegne, perché è lì che il partner ha il suo
// account e carica la propria offerta.
//
// Questa rotta serve a chiudere il giro nelle due direzioni:
//   GET  → la piattaforma tira i prodotti nati qui;
//   POST → la piattaforma manda quelli nati da lei.
//
// ⚠️ Il POST **non crea un doppione**: la chiave è il `codice` (lo SKU), e un
// prodotto già presente viene aggiornato. Un'integrazione che ritenta è la
// norma, non l'eccezione.
//
// ⭐ 11/09/2026 (regola utente) — **un prodotto caricato da un partner entra in
// «Attesa approvazione»**, con tutto quello che il partner ha scritto:
// categoria, plus del prodotto, note di specifica, prezzo pubblico, varianti,
// chi è il partner. Non entra nell'assortimento finché qualcuno qui non dice di
// sì, e l'approvazione torna alla piattaforma. I campi che accettiamo e quelli
// che la piattaforma manda oggi davvero sono elencati in
// `docs/CONTRATTO-APP-DELIVERY.md`.

/** Quello che si mostra fuori: niente campi interni di lavorazione. */
const CAMPI = {
  id: true,
  codice: true,
  nome: true,
  fase: true,
  categoria: true,
  descrizione: true,
  costoProduzione: true,
  prezzoVendita: true,
  immagine: true,
  tipoShopify: true,
  vendorShopify: true,
  // 06/09/2026: la casa della tipologia di vendita è qui, e la piattaforma consegne
  // la legge da questa rotta invece di riclassificare per conto suo.
  tipologiaVendita: true,
  // ⭐ 07/09/2026: la NOTA DI SPECIFICA («20-25 fiori», «18-20 cm»): la piattaforma consegne
  // se la porta fino al fioraio, che deve sapere quanti fiori mettere nel bouquet.
  note: true,
  // ⭐ 10/09/2026 (regola utente): il NOME PER I PARTNER («2 Colazioni in Famiglia» per la
  // «Colazione 5 Stelle - Clivati Milano»), con la spunta che dice se usarlo. La piattaforma
  // consegne lo mostra al fornitore nella proposta di vendita al posto del nome commerciale.
  nomePartner: true,
  nomePartnerAttivo: true,
  // ⭐ 11/09/2026: il plus del prodotto (di là si chiama `shortDesc`) e chi l'ha caricato.
  plusProdotto: true,
  prezzoPartner: true,
  partnerPiattaformaId: true,
  partnerInsegna: true,
  varianti: { select: { id: true, nome: true, sku: true, note: true } },
  // ⭐ 07/09/2026: su quali negozi sta, con l'id e lo stato di ciascuno (dal modulo o dall'import).
  pubblicazioni: { select: { negozio: true, shopifyId: true, handle: true, statoShopify: true } },
  origine: true,
  idEsterno: true,
  esclusoDaAnalisi: true,
  creatoIl: true,
  aggiornatoIl: true,
} as const;

/**
 * ⭐ 11/09/2026 — l'esito dell'approvazione, **leggibile** da chi ci chiede i
 * prodotti. La piattaforma consegne tiene una sua colonna `approved`: così può
 * allinearla anche solo leggendo, senza aspettare che gliela scriviamo noi.
 *
 * «Approvato» vuol dire che il PLM ha dato il via: la fase è `approvato` o
 * `in_vendita`. Un prodotto in attesa non è «non approvato per sempre» — è una
 * domanda ancora aperta, e i due casi si distinguono.
 */
function conApprovazione<T extends { fase: string }>(p: T) {
  return {
    ...p,
    approvato: p.fase === "approvato" || p.fase === "in_vendita",
    attesaApprovazione: p.fase === "attesa_approvazione",
  };
}

// GET /api/v1/prodotti
// Filtri: ?fase=in_vendita&origine=merchandising&q=&da=<ISO>
// Paginazione: ?page=1&limit=50 (max 200)
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, Number(p.get("limit") ?? "50") || 50));

  const where: Record<string, unknown> = {
    // I prodotti «uniti» a un altro sono doppioni riconciliati: fuori da qui,
    // o l'app a valle conterebbe due volte lo stesso bouquet.
    unitoAId: null,
  };
  if (p.get("fase")) where.fase = p.get("fase");
  if (p.get("origine")) where.origine = p.get("origine");
  if (p.get("q")) where.nome = { contains: p.get("q") as string, mode: "insensitive" };
  // `da` serve a chi sincronizza: solo quello che è cambiato da un certo momento.
  const da = p.get("da")?.trim();
  if (da) {
    const quando = new Date(da);
    if (Number.isNaN(quando.getTime())) {
      return erroreApi(400, "«da» non è una data valida: serve una ISO 8601, es. 2026-08-01T00:00:00Z");
    }
    where.aggiornatoIl = { gte: quando };
  }

  const [totale, prodotti] = await Promise.all([
    prisma.prodotto.count({ where }),
    prisma.prodotto.findMany({
      where,
      select: CAMPI,
      orderBy: { aggiornatoIl: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    prodotti: prodotti.map(conApprovazione),
  });
}

// POST /api/v1/prodotti — riceve un prodotto nato in un'altra app.
//
// Corpo: i nomi della piattaforma (`sku`, `name`, `shortDesc`, `publicPrice`,
// `category`, `partnerId`, `variants`…) oppure i nostri (`codice`, `nome`,
// `plusProdotto`, `prezzoVendita`, `categoria`, `varianti`…): si accettano
// tutti e due, perché l'app che chiama non deve tradurre due volte.
export async function POST(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  let body: ProdottoDaPiattaforma;
  try {
    body = (await req.json()) as ProdottoDaPiattaforma;
  } catch {
    return erroreApi(400, "Corpo della richiesta non è JSON valido.");
  }

  const codice = String(body.codice ?? body.sku ?? "").trim();
  const categorie = await prisma.categoriaProdotto.findMany({ select: { chiave: true, nome: true } });
  const campi = campiDaPiattaforma(body, categorie);
  if (!codice || !campi.nome) return erroreApi(400, "Servono «codice» (lo SKU) e «nome».");

  const varianti = variantiDaPiattaforma(body);
  const avvisi: string[] = [];
  if (campi.categoria === "DA_CLASSIFICARE") {
    const chiesta = String(body.categoria ?? body.categoryName ?? body.category?.name ?? "").trim();
    avvisi.push(
      chiesta
        ? `La categoria «${chiesta}» non esiste qui: il prodotto è «Da classificare» e va scelta prima di approvarlo.`
        : "Il prodotto arriva senza categoria: va scelta prima di approvarlo.",
    );
  }
  if (!(campi.prezzoVendita > 0)) avvisi.push("Manca il prezzo pubblico: senza, il prodotto non si può approvare.");

  const esistente = await prisma.prodotto.findUnique({
    where: { codice },
    select: { id: true, fase: true, varianti: { select: { id: true, nome: true, sku: true } } },
  });

  if (esistente) {
    // ⚠️ La FASE non si tocca in aggiornamento: è una decisione del PLM, presa
    // qui. Un'app esterna che rimanda lo stesso prodotto non deve riportarlo
    // «in vendita» dopo che qualcuno l'aveva archiviato — né riaprire
    // un'approvazione già data.
    const aggiornato = await prisma.prodotto.update({
      where: { codice },
      data: {
        nome: campi.nome,
        descrizione: campi.descrizione,
        categoria: campi.categoria,
        costoProduzione: campi.costoProduzione,
        prezzoVendita: campi.prezzoVendita,
        immagine: campi.immagine,
        origine: campi.origine,
        idEsterno: campi.idEsterno,
        // I campi che il partner può cambiare di là: si riscrivono solo se
        // arrivano valorizzati — un aggiornamento parziale non cancella quello
        // che qualcuno ha scritto qui.
        ...(campi.plusProdotto ? { plusProdotto: campi.plusProdotto } : {}),
        ...(campi.note ? { note: campi.note } : {}),
        ...(campi.nomePartner ? { nomePartner: campi.nomePartner, nomePartnerAttivo: campi.nomePartnerAttivo } : {}),
        ...(campi.prezzoPartner != null ? { prezzoPartner: campi.prezzoPartner } : {}),
        ...(campi.ggDispMin != null ? { ggDispMin: campi.ggDispMin } : {}),
        ...(campi.nonFisicoShopify != null ? { nonFisicoShopify: campi.nonFisicoShopify } : {}),
        ...(campi.partnerPiattaformaId ? { partnerPiattaformaId: campi.partnerPiattaformaId } : {}),
        ...(campi.partnerInsegna ? { partnerInsegna: campi.partnerInsegna } : {}),
        ...(campi.partnerIdShopify ? { partnerIdShopify: campi.partnerIdShopify } : {}),
      },
      select: CAMPI,
    });
    const nuove = await allineaVarianti(esistente.id, esistente.varianti, varianti, campi.prezzoVendita, campi.costoProduzione);
    if (nuove) avvisi.push(`${nuove} varianti aggiunte dalla piattaforma.`);
    return NextResponse.json({ creato: false, prodotto: conApprovazione(aggiornato), avvisi });
  }

  // ⭐ La fase di partenza. Un prodotto della piattaforma va in **attesa di
  // approvazione**: esiste e si vende già di là, ma entra nel nostro
  // assortimento solo quando qualcuno qui lo guarda. Chi manda da un'altra app
  // (o dichiara una fase) resta come prima.
  const fase = String(body.fase ?? "").trim() || (daPiattaforma(campi.origine) ? "attesa_approvazione" : "in_vendita");
  // ⭐ La SEO si riempie da sola con le regole del modulo (richiesta utente).
  const seo = seoAutomatica(campi);

  const creato = await prisma.prodotto.create({
    data: {
      codice,
      ...campi,
      ...seo,
      fase,
      // Fuori dalle analisi finché non lo decide una persona: le classifiche di
      // assortimento sono nostre, e l'offerta di un partner le falserebbe senza
      // che si capisca perché. All'approvazione rientra.
      esclusoDaAnalisi: true,
      motivoEsclusione: `Arrivato da ${campi.origine}: in attesa di approvazione.`,
      varianti: varianti.length
        ? {
            create: varianti.map((v, i) => ({
              nome: v.nome,
              sku: v.sku,
              deltaPrezzo: v.prezzo != null ? v.prezzo - campi.prezzoVendita : 0,
              deltaCosto: v.prezzoPartner != null ? v.prezzoPartner - campi.costoProduzione : 0,
              prezzoPartner: v.prezzoPartner,
              note: v.note,
              giacenza: v.giacenza,
              ordine: i,
            })),
          }
        : undefined,
      tappe: {
        create: {
          da: "—",
          a: fase,
          nota: [
            `Arrivato da ${campi.origine}${campi.partnerInsegna ? ` — partner ${campi.partnerInsegna}` : ""}.`,
            varianti.length ? `${varianti.length} varianti.` : "",
            seo.seoTitolo ? "SEO compilata dalle regole." : "",
            ...avvisi,
          ].filter(Boolean).join(" "),
          origine: "api",
        },
      },
    },
    select: CAMPI,
  });

  // Quello che manca per poter approvare: si dice subito a chi ce l'ha mandato.
  const mancanze = mancanzePerApprovare({
    nome: campi.nome,
    codice,
    prezzoVendita: campi.prezzoVendita,
    categoria: campi.categoria,
    tipologiaVendita: campi.tipologiaVendita,
    descrizione: campi.descrizione,
    plusProdotto: campi.plusProdotto,
  });

  return NextResponse.json(
    { creato: true, prodotto: conApprovazione(creato), avvisi, perApprovare: mancanze },
    { status: 201 },
  );
}

/**
 * Le varianti che il partner ha e la scheda no.
 *
 * ⚠️ **Non si toglie niente**: una variante sparita dal corpo che arriva può
 * essere un aggiornamento parziale, e cancellarla qui vorrebbe dire perdere il
 * suo storico di vendite. Si aggiunge quello che manca, riconosciuto per SKU e
 * in mancanza per nome — la stessa regola dell'import da Shopify.
 */
async function allineaVarianti(
  prodottoId: string,
  gia: { id: string; nome: string; sku: string | null }[],
  arrivate: { nome: string; sku: string | null; prezzo: number | null; prezzoPartner: number | null; note: string | null; giacenza: number }[],
  prezzoBase: number,
  costoBase: number,
): Promise<number> {
  if (!arrivate.length) return 0;
  const perSku = new Set(gia.map((v) => (v.sku ?? "").trim().toUpperCase()).filter(Boolean));
  const perNome = new Set(gia.map((v) => v.nome.trim().toLowerCase()));
  let nuove = 0;
  for (const [i, v] of arrivate.entries()) {
    const sku = (v.sku ?? "").trim().toUpperCase();
    if ((sku && perSku.has(sku)) || perNome.has(v.nome.trim().toLowerCase())) continue;
    // Uno SKU già di un'altra scheda non si prende: è un doppione da
    // riconciliare, e rubarlo romperebbe il legame con gli ordini.
    if (sku) {
      const altrove = await prisma.variante.findUnique({ where: { sku: v.sku as string }, select: { id: true } });
      if (altrove) continue;
    }
    await prisma.variante.create({
      data: {
        prodottoId,
        nome: v.nome,
        sku: v.sku,
        deltaPrezzo: v.prezzo != null ? v.prezzo - prezzoBase : 0,
        deltaCosto: v.prezzoPartner != null ? v.prezzoPartner - costoBase : 0,
        prezzoPartner: v.prezzoPartner,
        note: v.note,
        giacenza: v.giacenza,
        ordine: gia.length + i,
      },
    });
    nuove++;
  }
  return nuove;
}
