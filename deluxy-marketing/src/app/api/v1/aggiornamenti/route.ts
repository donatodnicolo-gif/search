import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/aggiornamenti?canale=google_ads&account=248-656-1148
// Le richieste di aggiornamento lasciate dal bottone "Aggiorna adesso".
//
// PERCHÉ ESISTE: gli Script di Google Ads girano dentro Google e nessuno può
// avviarli da fuori — non c'è un'API che li lanci. Il verso è l'opposto: è lo
// script che, a ogni sua partenza, chiede all'app se c'è qualcosa da rifare.
// Quindi "adesso" vuol dire "alla prossima partenza dello script": con la
// frequenza oraria su uno qualsiasi dei lavori, al massimo un'ora.
//
// Restituisce anche le richieste senza account: un account che passa di qui e
// trova una richiesta generica se la prende.
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const account = p.get("account");
  const soloCifre = (s: string) => s.replace(/\D/g, "");

  const richieste = await prisma.richiestaAggiornamento.findMany({
    where: { stato: "in_attesa", canale: p.get("canale") ?? "google_ads" },
    orderBy: { creataIl: "asc" },
    take: 20,
  });

  // Il confronto ignora i trattini: "248-656-1148" e "2486561148" sono lo
  // stesso account, e ogni sorgente li scrive a modo suo.
  const mie = richieste.filter(
    (r) => !r.account || !account || soloCifre(r.account) === soloCifre(account)
  );

  return NextResponse.json({
    richieste: mie.map((r) => ({
      id: r.id,
      lavoro: r.lavoro,
      giorni: r.giorni,
      account: r.account,
      motivo: r.motivo,
      chiestaIl: r.creataIl,
    })),
  });
}

// POST /api/v1/aggiornamenti — mette in coda una richiesta (lo fa anche il
// bottone dell'app). Body: { canale?, account?, lavoro?, giorni?, motivo? }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { canale?: string; account?: string; lavoro?: string; giorni?: number; motivo?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: valori di default
  }
  const canale = body.canale ?? "google_ads";
  const lavoro = body.lavoro ?? "metriche";
  const account = body.account ? String(body.account) : null;

  // Premere due volte non deve creare due richieste: la seconda ritorna la prima.
  const gia = await prisma.richiestaAggiornamento.findFirst({
    where: { stato: "in_attesa", canale, lavoro, account },
  });
  if (gia) return NextResponse.json({ richiesta: gia, nota: "era già in coda" });

  const richiesta = await prisma.richiestaAggiornamento.create({
    data: {
      canale,
      account,
      lavoro,
      giorni: Math.min(Math.max(Number(body.giorni ?? 7), 1), 400),
      motivo: body.motivo ?? null,
      richiestaDa: cliente.nome,
    },
  });
  return NextResponse.json({ richiesta }, { status: 201 });
}
