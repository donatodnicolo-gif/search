import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notificaAutentica } from "@/lib/transactions";
import { registra } from "@/lib/registro";

// POST /api/pagamenti/notifica — Deluxy Transactions avvisa che una richiesta
// ha cambiato stato.
//
// La firma si verifica SEMPRE prima di guardare il contenuto: senza, chiunque
// conoscesse questo indirizzo potrebbe raccontare a Finance che un pagamento è
// stato eseguito, e Finance scriverebbe un bonifico che non esiste.
//
// Quando lo stato diventa `pagata`, e solo allora, il mese viene annotato come
// bonificato: è il momento in cui il denaro è davvero uscito.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  const ok = notificaAutentica(
    corpo,
    req.headers.get("x-deluxy-timestamp") ?? "",
    req.headers.get("x-deluxy-signature") ?? ""
  );
  if (!ok) return NextResponse.json({ errore: "Firma non valida." }, { status: 401 });

  let dati: { riferimento?: string; riferimentoEsterno?: string; stato?: string; importoCent?: number; pagataIl?: string };
  try {
    dati = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ errore: "Corpo non leggibile." }, { status: 400 });
  }

  // `riferimentoEsterno` è "saldo-<partnerId>-<anno>-<mese>": l'abbiamo scelto
  // noi quando abbiamo chiesto il pagamento, quindi da lì si risale al mese
  // senza doversi fidare di altro.
  // `-rN` è il numero di tentativo: una richiesta rifiutata e rifatta ha lo
  // stesso mese ma un riferimento diverso, e va comunque riconosciuta.
  const m = /^saldo-(.+)-(\d{4})-(\d{2})(?:-r\d+)?$/.exec(dati.riferimentoEsterno ?? "");
  if (!m) return NextResponse.json({ ok: true, nota: "Riferimento non nostro: ignorata." });
  const [, partnerId, annoS, meseS] = m;
  const anno = Number(annoS);
  const mese = Number(meseS);
  const stato = String(dati.stato ?? "");

  const saldo = await prisma.saldoMensile.findUnique({
    where: { partnerId_anno_mese: { partnerId, anno, mese } },
    select: { id: true, bonificoImporto: true },
  });
  if (!saldo) return NextResponse.json({ ok: true, nota: "Mese non trovato: ignorata." });

  const pagata = stato === "pagata";
  const importo = typeof dati.importoCent === "number" ? dati.importoCent / 100 : null;

  await prisma.saldoMensile.update({
    where: { id: saldo.id },
    data: {
      richiestaStato: stato,
      // Il bonifico si scrive solo a pagamento avvenuto, e solo se non c'era
      // già: se un operatore l'aveva annotato a mano, la sua cifra vince — è
      // stata scritta da qualcuno che ha guardato il conto.
      ...(pagata && saldo.bonificoImporto == null && importo != null
        ? { bonificoImporto: importo, bonificoData: dati.pagataIl ? new Date(dati.pagataIl) : new Date() }
        : {}),
    },
  });

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { nome: true } });
  await registra({
    azione: `Transactions: richiesta ${dati.riferimento ?? ""} → ${stato}`,
    categoria: "pagamenti",
    entita: "saldo",
    entitaId: saldo.id,
    partner: partner?.nome ?? null,
    dettaglio: pagata ? `bonifico annotato: ${importo != null ? importo.toFixed(2) : "importo non comunicato"}` : null,
  });

  return NextResponse.json({ ok: true });
}
