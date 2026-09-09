import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { IVA_DEFAULT } from "@/lib/calc";

// API pubblica: IL MESE DELLE CONSEGNE, mandato dalla piattaforma consegne.
//
//   POST /api/consegne-mese
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//           X-App: <nome-app>     (facoltativo, per lo storico)
//   body JSON: {
//     "partner": "<nome o id>",     "anno": 2026, "mese": 8,
//     "venduto": 243.40,            // incassato da Deluxy per conto del partner
//     "commissioni": 48.68,         // imponibile delle commissioni trattenute
//     "aliquotaIva": 22,            // facoltativo (default 22)
//     "riferimento": "FAT-2026-12", // la fattura interna della piattaforma: E' LA CHIAVE
//     "descrizione": "Consegne Deluxy 01/08 – 31/08"
//   }
//
// COSA SCRIVE, e perché così:
//   · una VENDITA VENDOR del mese, con l'incasso lordo e la fee dedotta dai due
//     numeri (commissioni / venduto). Da lì l'app calcola da sé il dovuto al
//     partner, con la formula che ha già: incasso − commissione × (1 + IVA);
//   · una FATTURA SERVIZI per le commissioni, segnata GIA' PAGATA: sulle vendite
//     la commissione non la incassiamo dal partner, la tratteniamo dal suo
//     incasso. Se restasse «da pagare» comparirebbe nei solleciti e nel
//     «da incassare» un credito che nessuno deve versare;
//   · la riga del SALDO MENSILE, se non c'è, così il mese esiste anche quando
//     non c'è ancora nulla da bonificare. Non tocca `bonificoImporto`,
//     `dataPagamento` né `chiuso`: quelle sono decisioni di chi paga.
//
// IDEMPOTENTE. Rimandare lo stesso mese non raddoppia niente: le righe si
// riconoscono dal MARCATORE `[consegne <riferimento>]` scritto in descrizione, e
// vengono aggiornate invece che duplicate. È il compromesso scelto per non
// aggiungere una colonna allo schema (che è di questa app, e si tocca solo
// d'accordo): la chiave naturale (partner, anno, mese) da sola non bastava,
// perché un partner può avere anche vendite e fatture di altra origine.

const MARCATORE = (rif: string) => `[consegne ${rif}]`;
const TIPOLOGIA = "Consegne Deluxy";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export async function POST(req: NextRequest) {
  const app = appOrigine(req);
  const indirizzo = ipRichiesta(req);

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: app, queryPartner: "consegne-mese", esito: "non_autorizzato", ip: indirizzo },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ errore: "Corpo JSON non valido." }, { status: 400 });
  }

  const chiPartner = String(body.partner ?? "").trim();
  const anno = Number(body.anno);
  const mese = Number(body.mese);
  const venduto = num(body.venduto);
  const commissioni = num(body.commissioni);
  const aliquotaIva = num(body.aliquotaIva) ?? IVA_DEFAULT;
  const riferimento = String(body.riferimento ?? "").trim();
  const descrizione = String(body.descrizione ?? "").trim();

  if (!chiPartner) return NextResponse.json({ errore: "Campo 'partner' obbligatorio." }, { status: 400 });
  if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) {
    return NextResponse.json({ errore: "Campo 'anno' non valido." }, { status: 400 });
  }
  if (!Number.isInteger(mese) || mese < 1 || mese > 12) {
    return NextResponse.json({ errore: "Campo 'mese' non valido (1-12)." }, { status: 400 });
  }
  if (venduto == null || venduto < 0) return NextResponse.json({ errore: "Campo 'venduto' non valido." }, { status: 400 });
  if (commissioni == null || commissioni < 0) {
    return NextResponse.json({ errore: "Campo 'commissioni' non valido." }, { status: 400 });
  }
  // ⚠️ Una commissione più grande dell'incasso non è un caso di frontiera: è un
  // errore di chi chiama, e passandola il dovuto uscirebbe negativo.
  if (venduto > 0 && commissioni > venduto) {
    return NextResponse.json({ errore: "Le commissioni superano il venduto." }, { status: 422 });
  }
  if (!riferimento) {
    return NextResponse.json({ errore: "Campo 'riferimento' obbligatorio: è la chiave che rende ripetibile l'invio." }, { status: 400 });
  }

  // Il partner si cerca per id o per nome, come nelle altre API.
  const partner =
    (await prisma.partner.findUnique({ where: { id: chiPartner } })) ??
    (await prisma.partner.findFirst({ where: { nome: { equals: chiPartner, mode: "insensitive" } } }));
  if (!partner) {
    const candidati = await prisma.partner.findMany({
      where: { nome: { contains: chiPartner.split(" ")[0] ?? chiPartner, mode: "insensitive" } },
      select: { nome: true },
      take: 8,
    });
    await prisma.richiestaVerifica.create({
      data: { origine: app, queryPartner: `consegne-mese ${chiPartner}`, esito: "non_trovato", ip: indirizzo },
    });
    return NextResponse.json(
      { errore: `Partner «${chiPartner}» non trovato.`, candidati: candidati.map((c) => c.nome) },
      { status: 404 },
    );
  }

  const marcatore = MARCATORE(riferimento);
  const testo = `${descrizione || "Consegne Deluxy"} ${marcatore}`.trim();
  // La fee è ciò che il rapporto dice, non un parametro a parte: si deduce dai
  // due importi. Con venduto a zero non c'è percentuale da dedurre.
  const feePercent = venduto > 0 ? Math.round((commissioni / venduto) * 10000) / 100 : 0;

  const scritto = await prisma.$transaction(async (tx) => {
    // 1) la vendita del mese
    const vecchiaVendita = await tx.venditaVendor.findFirst({
      where: { partnerId: partner.id, anno, mese, descrizione: { contains: marcatore } },
    });
    const vendita = vecchiaVendita
      ? await tx.venditaVendor.update({
          where: { id: vecchiaVendita.id },
          data: { incassoLordo: venduto, feePercent, descrizione: testo },
        })
      : await tx.venditaVendor.create({
          data: { partnerId: partner.id, anno, mese, incassoLordo: venduto, feePercent, descrizione: testo },
        });

    // 2) la fattura delle commissioni, GIA' SALDATA (trattenuta dall'incasso)
    let fattura = null;
    if (commissioni > 0) {
      const tipologia = await tx.tipologiaServizio.upsert({
        where: { nome: TIPOLOGIA },
        create: { nome: TIPOLOGIA },
        update: {},
      });
      const vecchiaFattura = await tx.fatturaServizio.findFirst({
        where: { partnerId: partner.id, anno, mese, descrizione: { contains: marcatore } },
      });
      const dati = {
        imponibile: commissioni,
        aliquotaIva,
        pagata: true,
        dataPagamento: new Date(),
        descrizione: testo,
        tipologiaId: tipologia.id,
      };
      fattura = vecchiaFattura
        ? await tx.fatturaServizio.update({ where: { id: vecchiaFattura.id }, data: dati })
        : await tx.fatturaServizio.create({ data: { partnerId: partner.id, anno, mese, ...dati } });
    }

    // 3) il mese esiste, anche se non c'è ancora nulla da bonificare.
    //    `update: {}` di proposito: bonifico, data di pagamento e chiusura sono
    //    decisioni di chi paga, e un reinvio non deve poterle sovrascrivere.
    const saldo = await tx.saldoMensile.upsert({
      where: { partnerId_anno_mese: { partnerId: partner.id, anno, mese } },
      create: { partnerId: partner.id, anno, mese },
      update: {},
    });
    return { vendita, fattura, saldo };
  });

  const dovuto = Math.round((venduto - commissioni * (1 + aliquotaIva / 100)) * 100) / 100;

  await prisma.richiestaVerifica.create({
    data: {
      origine: app,
      queryPartner: `consegne-mese ${partner.nome} ${mese}/${anno}`,
      partnerId: partner.id,
      partnerNome: partner.nome,
      esito: "trovato",
      rispostaSintesi: `venduto ${venduto.toFixed(2)} · commissioni ${commissioni.toFixed(2)} (saldate) · dovuto ${dovuto.toFixed(2)}`,
      ip: indirizzo,
    },
  });

  return NextResponse.json({
    ok: true,
    partner: { id: partner.id, nome: partner.nome },
    anno,
    mese,
    venduto,
    commissioni,
    feePercent,
    commissioniConIva: Math.round(commissioni * (1 + aliquotaIva / 100) * 100) / 100,
    dovutoAlPartner: dovuto,
    aggiornato: Boolean(scritto.vendita && scritto.fattura),
    riferimento,
    url: `https://deluxy-partner.vercel.app/partner/${partner.id}`,
  });
}
