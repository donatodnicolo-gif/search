import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// POST /api/v1/ingest/copy — keyword e testi degli annunci da Google Ads.
// Lo usa scripts/google-ads-script.js; va bene anche per altre fonti.
//
// REGOLA IMPORTANTE: lo stato deciso nell'app (attiva/vincente/esclusa…) è una
// scelta dell'utente e non viene MAI sovrascritto dall'import. Lo stato della
// piattaforma finisce in un campo suo (statoPiattaforma).
//
// Body: {
//   canale?: "google_ads",  account?: "825-518-1560",  brand?: "flowers",
//   keywords?: [{ idEsterno?, testo*, corrispondenza?, campagna*, gruppo?,
//                 spesa?, incasso?, clic?, impressioni?, conversioni?,
//                 punteggioQualita?, statoPiattaforma? }],
//   annunci?:  [{ idEsterno?, testo*, tipo*: "titolo"|"descrizione", posizione?,
//                 campagna*, gruppo?, finalUrl?, rendimento?, statoPiattaforma? }],
//   gruppi?:   [{ idEsterno?, testo* (nome del gruppo), campagna*, spesa?,
//                 incasso?, clic?, impressioni?, conversioni?, statoPiattaforma?,
//                 note? }]
// }
// I "gruppi" sono i gruppi di annunci (e, per Performance Max, i gruppi di
// asset): stessa riga di sempre con tipo "gruppo", ma con le metriche, perché
// la domanda vera è quale gruppo tiene su la campagna e quale la zavorra.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const keywords = Array.isArray(body.keywords) ? body.keywords : [];
  const annunci = Array.isArray(body.annunci) ? body.annunci : [];
  const gruppi = Array.isArray(body.gruppi) ? body.gruppi : [];
  if (keywords.length === 0 && annunci.length === 0 && gruppi.length === 0) {
    return erroreApi(400, "Niente da importare: servono 'keywords', 'annunci' o 'gruppi'");
  }

  const canale = body.canale ?? "google_ads";
  const adesso = new Date();
  const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const intero = (v: unknown) => (numero(v) != null ? Math.round(numero(v)!) : null);

  const brandDa = (testo: string): string => {
    if (body.brand) return body.brand;
    const t = testo.toLowerCase();
    if (/deluxyflower|flowers/.test(t)) return "flowers";
    if (/cake/.test(t)) return "cake";
    if (/deluxy|gifts|regali/.test(t)) return "gifts";
    return "cross";
  };

  // Riconosce la riga già presente: prima per id di piattaforma, poi per
  // (tipo, testo, campagna) — così le keyword importate dal Monitoraggio si
  // arricchiscono invece di duplicarsi.
  async function salva(
    tipo: string,
    r: Record<string, unknown>,
    dati: Record<string, unknown>
  ): Promise<"nuova" | "aggiornata"> {
    const campagna = String(r.campagna);
    const testo = String(r.testo);
    let riga = r.idEsterno
      ? await prisma.copyAnnuncio.findFirst({ where: { idEsterno: String(r.idEsterno), tipo } })
      : null;
    if (!riga) {
      riga = await prisma.copyAnnuncio.findFirst({ where: { tipo, testo, campagna } });
    }
    if (riga) {
      await prisma.copyAnnuncio.update({ where: { id: riga.id }, data: dati });
      return "aggiornata";
    }
    await prisma.copyAnnuncio.create({
      data: {
        tipo,
        testo,
        campagna,
        brand: brandDa(`${campagna} ${testo}`),
        canale,
        caratteri: testo.length,
        ...dati,
      },
    });
    return "nuova";
  }

  let nuoveKw = 0, aggiornateKw = 0, nuoviAnn = 0, aggiornatiAnn = 0, nuoviGr = 0, aggiornatiGr = 0;

  for (const k of keywords) {
    if (!k?.testo || !k?.campagna) continue;
    // Il testo porta con sé la corrispondenza, come nel Monitoraggio:
    // "fiori roma online (broad)" — così le due fonti si riconoscono.
    const testo = k.corrispondenza
      ? `${k.testo} (${String(k.corrispondenza).toLowerCase()})`
      : String(k.testo);
    const esito = await salva("keyword", { ...k, testo }, {
      gruppo: k.gruppo ?? null,
      idEsterno: k.idEsterno ? String(k.idEsterno) : null,
      spesa: numero(k.spesa),
      incasso: numero(k.incasso),
      clic: intero(k.clic),
      impressioni: intero(k.impressioni),
      conversioni: numero(k.conversioni),
      punteggioQualita: intero(k.punteggioQualita),
      statoPiattaforma: k.statoPiattaforma ?? null,
      metricheAl: adesso,
      fonte: canale,
    });
    if (esito === "nuova") nuoveKw++;
    else aggiornateKw++;
  }

  for (const a of annunci) {
    if (!a?.testo || !a?.campagna || !a?.tipo) continue;
    const esito = await salva(String(a.tipo), a, {
      gruppo: a.gruppo ?? null,
      posizione: intero(a.posizione),
      finalUrl: a.finalUrl ?? null,
      livello: a.livello ?? null,
      anteprima: a.anteprima ?? null,
      note: a.note ?? null,
      idEsterno: a.idEsterno ? String(a.idEsterno) : null,
      rendimento: a.rendimento ?? null,
      statoPiattaforma: a.statoPiattaforma ?? null,
      caratteri: String(a.testo).length,
      metricheAl: adesso,
      fonte: canale,
    });
    if (esito === "nuova") nuoviAnn++;
    else aggiornatiAnn++;
  }

  // I gruppi di annunci: come le keyword, ma con le metriche del gruppo intero.
  // Lo stato deciso nell'app non si tocca nemmeno qui.
  for (const g of gruppi) {
    if (!g?.testo || !g?.campagna) continue;
    const esito = await salva("gruppo", g, {
      gruppo: String(g.testo), // il gruppo è sé stesso: comodo per i filtri
      idEsterno: g.idEsterno ? String(g.idEsterno) : null,
      spesa: numero(g.spesa),
      incasso: numero(g.incasso),
      clic: intero(g.clic),
      impressioni: intero(g.impressioni),
      conversioni: numero(g.conversioni),
      statoPiattaforma: g.statoPiattaforma ?? null,
      note: g.note ?? null,
      metricheAl: adesso,
      fonte: canale,
    });
    if (esito === "nuova") nuoviGr++;
    else aggiornatiGr++;
  }

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account: body.account ? String(body.account) : null,
      tipo: gruppi.length > keywords.length + annunci.length
        ? "gruppi"
        : keywords.length >= annunci.length ? "copy" : "asset",
      chiave: cliente.nome,
      righe: keywords.length + annunci.length + gruppi.length,
      nuove: nuoveKw + nuoviAnn + nuoviGr,
      aggiornate: aggiornateKw + aggiornatiAnn + aggiornatiGr,
      esito: "ok",
    },
  });

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "copy",
    titolo: `Import copy da ${canale}${body.account ? ` (account ${body.account})` : ""}`,
    dettaglio: `keyword: ${nuoveKw} nuove, ${aggiornateKw} aggiornate · annunci: ${nuoviAnn} nuovi, ${aggiornatiAnn} aggiornati${gruppi.length ? ` · gruppi: ${nuoviGr} nuovi, ${aggiornatiGr} aggiornati` : ""}`,
  });

  return NextResponse.json(
    {
      keywords: { nuove: nuoveKw, aggiornate: aggiornateKw },
      annunci: { nuovi: nuoviAnn, aggiornati: aggiornatiAnn },
      gruppi: { nuovi: nuoviGr, aggiornati: aggiornatiGr },
    },
    { status: 201 }
  );
}
