import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

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
// ⚠️ Un prodotto arrivato da fuori **non entra nel PLM come se l'avessimo
// disegnato noi**: nasce in fase `in_vendita` (esiste già e si vende) con
// l'origine scritta, e resta **escluso dalle analisi** finché qualcuno qui non
// decide il contrario — le classifiche di assortimento sono nostre, e l'offerta
// di un partner le falserebbe senza che si capisca perché.

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
  // ⭐ 10/09/2026 (regola utente): il NOME PER IL PARTNER («2 Colazioni in Famiglia» per la
  // «Colazione 5 Stelle - Clivati Milano»), con la spunta che dice se usarlo. La piattaforma
  // consegne lo mostra al fornitore nella proposta di vendita al posto del nome commerciale.
  nomePartner: true,
  nomePartnerAttivo: true,
  varianti: { select: { id: true, nome: true, sku: true, note: true } },
  // ⭐ 07/09/2026: su quali negozi sta, con l'id e lo stato di ciascuno (dal modulo o dall'import).
  pubblicazioni: { select: { negozio: true, shopifyId: true, handle: true, statoShopify: true } },
  origine: true,
  idEsterno: true,
  esclusoDaAnalisi: true,
  creatoIl: true,
  aggiornatoIl: true,
} as const;

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
    prodotti,
  });
}

// POST /api/v1/prodotti — riceve un prodotto nato in un'altra app.
//
// Corpo: { codice*, nome*, origine*, idEsterno?, descrizione?, categoria?,
//          costoProduzione?, prezzoVendita?, immagine?, fase? }
export async function POST(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return erroreApi(400, "Corpo della richiesta non è JSON valido.");
  }

  const codice = String(body.codice ?? "").trim();
  const nome = String(body.nome ?? "").trim();
  if (!codice || !nome) return erroreApi(400, "Servono «codice» (lo SKU) e «nome».");

  const numero = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const testo = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const comuni = {
    nome,
    descrizione: testo(body.descrizione),
    categoria: testo(body.categoria) ?? "BOUQUET",
    costoProduzione: numero(body.costoProduzione),
    prezzoVendita: numero(body.prezzoVendita),
    immagine: testo(body.immagine),
    origine: testo(body.origine) ?? "esterna",
    idEsterno: testo(body.idEsterno),
  };
  // ⭐ 11/09/2026 (regola utente): un prodotto NATO DAL PARTNER arriva dalla piattaforma col suo
  // nome anche come «nome partner» e con la fase «prototipo» (da approvare). Il nome partner si
  // scrive solo se viene mandato: un aggiornamento senza non cancella quello che c'è.
  const nomePartner = testo(body.nomePartner);
  const conNomePartner = nomePartner
    ? { nomePartner, nomePartnerAttivo: typeof body.nomePartnerAttivo === "boolean" ? body.nomePartnerAttivo : true }
    : {};
  const noteSviluppo = testo(body.noteSviluppo);

  const esistente = await prisma.prodotto.findUnique({ where: { codice } });
  if (esistente) {
    // ⚠️ La FASE non si tocca in aggiornamento: è una decisione del PLM, presa
    // qui. Un'app esterna che rimanda lo stesso prodotto non deve riportarlo
    // «in vendita» dopo che qualcuno l'aveva archiviato.
    const aggiornato = await prisma.prodotto.update({
      where: { codice },
      data: { ...comuni, ...conNomePartner },
      select: CAMPI,
    });
    return NextResponse.json({ creato: false, prodotto: aggiornato });
  }

  const creato = await prisma.prodotto.create({
    data: {
      codice,
      ...comuni,
      ...conNomePartner,
      ...(noteSviluppo ? { noteSviluppo } : {}),
      fase: testo(body.fase) ?? "in_vendita",
      // Fuori dalle analisi finché non lo decide una persona: vedi la nota in
      // testa al file.
      esclusoDaAnalisi: true,
      motivoEsclusione: `Arrivato da ${comuni.origine}: non è un prodotto disegnato qui.`,
    },
    select: CAMPI,
  });
  return NextResponse.json({ creato: true, prodotto: creato }, { status: 201 });
}
