import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida } from "@/lib/apiauth";

// API pubblica di SOLA LETTURA: i movimenti bancari (estratto conto Qonto/Vivid e
// file importati). Nasce perché il **controllo degli ordini** — quali incassi
// sono arrivati e quanto è stato pagato al fornitore — si fa in **Deluxy Orders**,
// che è il registro degli ordini: qui restano i movimenti, che sono di Finance,
// e Orders se li legge.
//
//   GET /api/v1/movimenti?page=1&limit=200
//   Filtri: da / a (data del movimento, ISO), segno=entrate|uscite,
//           daImport=<iso> (importati in Finance dopo quel momento: è
//           l'incrementale, e si basa su `createdAt` perché la data del
//           movimento può essere vecchia anche se il movimento è arrivato oggi)
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//
// `hash` è l'identità stabile del movimento (unica in Finance): chi lo copia lo
// usa per non duplicare nulla. `stato` dice se Finance l'ha già usato per
// qualcosa (una fattura, una spesa): un movimento «registrata» non va offerto
// come incasso libero di un ordine.
//
// NON espone: partnerId, categoria di costo interna, esito. Chi controlla gli
// ordini non ne ha bisogno e i dati che non servono non si mandano fuori.

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? "200") || 200));
  const segno = sp.get("segno")?.trim();

  const where: NonNullable<Parameters<typeof prisma.transazioneBancaria.findMany>[0]>["where"] = {};
  const da = sp.get("da")?.trim();
  const a = sp.get("a")?.trim();
  if (da || a) {
    where.data = {};
    if (da) where.data.gte = new Date(da);
    if (a) where.data.lte = new Date(`${a}T23:59:59.999Z`);
  }
  const daImport = sp.get("daImport")?.trim();
  if (daImport) {
    const quando = new Date(daImport);
    if (!Number.isNaN(quando.getTime())) where.createdAt = { gte: quando };
  }
  if (segno === "entrate") where.importo = { gt: 0 };
  else if (segno === "uscite") where.importo = { lt: 0 };

  const [totale, movimenti] = await Promise.all([
    prisma.transazioneBancaria.count({ where }),
    prisma.transazioneBancaria.findMany({
      where,
      // Ordine per `createdAt` e non per `data`: chi importa in modo
      // incrementale riprende da qui, e la data del movimento non cresce.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    movimenti: movimenti.map((m) => ({
      id: m.id,
      hash: m.hash,
      data: m.data.toISOString(),
      importo: m.importo, // > 0 accredito, < 0 addebito
      divisa: m.divisa,
      descrizione: m.descrizione,
      controparte: m.controparte,
      fonte: m.fonte,
      stato: m.stato, // nuova | registrata | ignorata (come lo vede Finance)
      importatoIl: m.createdAt.toISOString(),
    })),
  });
}
