import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notificaAutentica } from "@/lib/transactions";
import { registra } from "@/lib/registro";
import { partiteAperte, descriviPartite } from "@/lib/saldo-netto";
import { nomeMese } from "@/lib/calc";
import { euro } from "@/lib/format";

// POST /api/pagamenti/notifica — Deluxy Transactions avvisa che una richiesta
// ha cambiato stato.
//
// La firma si verifica SEMPRE prima di guardare il contenuto: senza, chiunque
// conoscesse questo indirizzo potrebbe raccontare a Finance che un pagamento è
// stato eseguito, e Finance scriverebbe un bonifico che non esiste.
//
// Quando lo stato diventa `pagata`, e solo allora, il mese viene annotato come
// bonificato: è il momento in cui il denaro è davvero uscito.
//
// Richieste «netto» (04/09/2026, partner in compensazione): la stessa
// richiesta copre PIÙ mesi — quelli a credito del partner e quelli a suo
// debito — e tutti portano lo stesso `richiestaRif`. Alla `pagata` si chiudono
// insieme: a ogni mese si annota il proprio delta (positivo = bonificato al
// partner, negativo = compensato con quello che il partner doveva), e la somma
// dei delta è il netto uscito dalla banca. Senza questo, i 48,30 € pagati
// finirebbero tutti sul mese premuto e gli altri quattro resterebbero aperti.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  const ok = notificaAutentica(
    corpo,
    req.headers.get("x-deluxy-timestamp") ?? "",
    req.headers.get("x-deluxy-signature") ?? ""
  );
  if (!ok) return NextResponse.json({ errore: "Firma non valida." }, { status: 401 });

  let dati: {
    riferimento?: string;
    riferimentoEsterno?: string;
    stato?: string;
    importoCent?: number;
    pagataIl?: string;
    // Come è uscito il denaro: "distinta", "qonto", oppure "fuori_app" — pagato
    // altrove (portale della banca, contanti, compensazione) e registrato a mano
    // dentro Transactions. Il mese si chiude comunque, ma nel registro deve
    // restare scritto che la prova del pagamento non ce l'ha l'app.
    pagatoCon?: string;
    motivo?: string;
  };
  try {
    dati = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ errore: "Corpo non leggibile." }, { status: 400 });
  }

  // Coda del messaggio da scrivere nel registro: il perché di un annullamento e
  // il «pagata fuori» sono le due cose che, senza, costringono ad aprire
  // Transactions per capire cosa è successo.
  const fuoriApp = dati.pagatoCon === "fuori_app";
  const contorno = [fuoriApp ? "pagata fuori dall'app" : null, dati.motivo ? `motivo: ${dati.motivo}` : null]
    .filter(Boolean)
    .join(" · ");

  // `riferimentoEsterno` è "saldo-<partnerId>-<anno>-<mese>": l'abbiamo scelto
  // noi quando abbiamo chiesto il pagamento, quindi da lì si risale al mese
  // senza doversi fidare di altro.
  const riferimentoEsterno = dati.riferimentoEsterno ?? "";

  // Richieste LIBERE (sezione «Richiedi pagamento»): il riferimento è
  // `libera-<id>`. Senza questo ramo resterebbero per sempre «in attesa» in
  // pagina, anche dopo essere state pagate davvero.
  const libera = /^libera-(.+)$/.exec(riferimentoEsterno);
  if (libera) {
    const richiesta = await prisma.richiestaPagamento.findUnique({ where: { id: libera[1] } });
    if (!richiesta) return NextResponse.json({ ok: true, nota: "Richiesta non trovata: ignorata." });
    await prisma.richiestaPagamento.update({
      where: { id: richiesta.id },
      data: { stato: String(dati.stato ?? richiesta.stato) },
    });
    await registra({
      azione: `Transactions: richiesta ${dati.riferimento ?? ""} → ${dati.stato ?? ""}`,
      categoria: "pagamenti",
      entita: "richiesta",
      entitaId: richiesta.id,
      partner: richiesta.partnerNome,
      dettaglio: [`${richiesta.beneficiario} · ${richiesta.causale}`, contorno].filter(Boolean).join(" · "),
    });
    return NextResponse.json({ ok: true });
  }

  // `-rN` è il numero di tentativo: una richiesta rifiutata e rifatta ha lo
  // stesso mese ma un riferimento diverso, e va comunque riconosciuta.
  const m = /^saldo-(.+)-(\d{4})-(\d{2})(?:-r\d+)?$/.exec(riferimentoEsterno);
  if (!m) return NextResponse.json({ ok: true, nota: "Riferimento non nostro: ignorata." });
  const [, partnerId, annoS, meseS] = m;
  const anno = Number(annoS);
  const mese = Number(meseS);
  const stato = String(dati.stato ?? "");
  const riferimento = String(dati.riferimento ?? "");

  // I mesi di questa richiesta: tutti quelli che portano il suo riferimento
  // (più d'uno per una richiesta «netto»), altrimenti il mese del riferimento
  // esterno — è il caso delle richieste nate prima del 04/09 e di quelle il
  // cui invio non ha ancora scritto il riferimento definitivo.
  let saldi = riferimento
    ? await prisma.saldoMensile.findMany({
        where: { partnerId, anno, richiestaRif: riferimento },
        select: { id: true, mese: true, bonificoImporto: true },
        orderBy: { mese: "asc" },
      })
    : [];
  if (saldi.length === 0) {
    const uno = await prisma.saldoMensile.findUnique({
      where: { partnerId_anno_mese: { partnerId, anno, mese } },
      select: { id: true, mese: true, bonificoImporto: true },
    });
    if (!uno) return NextResponse.json({ ok: true, nota: "Mese non trovato: ignorata." });
    saldi = [uno];
  }

  const pagata = stato === "pagata";
  const importo = typeof dati.importoCent === "number" ? dati.importoCent / 100 : null;
  const quando = dati.pagataIl ? new Date(dati.pagataIl) : new Date();
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { nome: true } });
  const righeRegistro: string[] = [];

  if (pagata && saldi.length > 1) {
    // Richiesta «netto»: ogni mese chiude col proprio delta, calcolato ADESSO
    // sui dati veri (se nel frattempo un mese è cambiato, la somma non torna
    // col pagato: si scrive lo stesso, e la differenza va nel registro).
    const { partite } = await partiteAperte(partnerId, anno);
    const perMese = new Map(partite.map((p) => [p.mese, p.delta]));
    let sommaDelta = 0;
    await prisma.$transaction(
      saldi.map((s) => {
        const delta = perMese.get(s.mese) ?? 0;
        sommaDelta += delta;
        return prisma.saldoMensile.update({
          where: { id: s.id },
          data: {
            richiestaStato: stato,
            bonificoImporto: Math.round(((s.bonificoImporto ?? 0) + delta) * 100) / 100,
            bonificoData: quando,
          },
        });
      })
    );
    righeRegistro.push(
      `compensazione ${anno} chiusa su ${saldi.length} mesi (${descriviPartite(partite.filter((p) => saldi.some((s) => s.mese === p.mese)))})`
    );
    if (importo != null && Math.abs(sommaDelta - importo) >= 0.01) {
      righeRegistro.push(
        `⚠️ pagato ${euro(importo)} ma i mesi oggi sommano ${euro(sommaDelta)}: qualcosa è cambiato dopo la richiesta, da guardare a mano`
      );
    } else if (importo != null) {
      righeRegistro.push(`bonifico netto ${euro(importo)}`);
    }
  } else {
    await prisma.$transaction(
      saldi.map((s) =>
        prisma.saldoMensile.update({
          where: { id: s.id },
          data: {
            richiestaStato: stato,
            // Il bonifico si scrive solo a pagamento avvenuto, e solo se non
            // c'era già: se un operatore l'aveva annotato a mano, la sua cifra
            // vince — è stata scritta da qualcuno che ha guardato il conto.
            ...(pagata && s.bonificoImporto == null && importo != null
              ? { bonificoImporto: importo, bonificoData: quando }
              : {}),
          },
        })
      )
    );
    if (pagata) righeRegistro.push(`bonifico annotato: ${importo != null ? importo.toFixed(2) : "importo non comunicato"}`);
    if (saldi.length > 1) righeRegistro.push(`mesi: ${saldi.map((s) => nomeMese(s.mese)).join(", ")}`);
  }

  await registra({
    azione: `Transactions: richiesta ${riferimento} → ${stato}`,
    categoria: "pagamenti",
    entita: "saldo",
    entitaId: saldi[0].id,
    partner: partner?.nome ?? null,
    dettaglio: [...righeRegistro, contorno].filter(Boolean).join(" · ") || null,
  });

  return NextResponse.json({ ok: true });
}
