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
//                 campagna*, gruppo?, finalUrl?, rendimento?, statoPiattaforma? }]
// }
// I GRUPPI di annunci non passano di qui: sono un'entità loro con le proprie
// metriche giornaliere (modello Gruppo) e arrivano da POST /api/v1/ingest.
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
  if (keywords.length === 0 && annunci.length === 0) {
    return erroreApi(400, "Niente da importare: servono 'keywords' o 'annunci'");
  }

  const canale = body.canale ?? "google_ads";
  const adesso = new Date();
  // Su quanti giorni sono calcolati i numeri di questa consegna: lo dice lo
  // script (`GIORNI_COPY` per keyword e testi, `GIORNI_ASSET` per gli asset).
  //
  // ⚠️ Si scrive SOLO insieme ai numeri, mai da solo: un giro di soli stati non
  // porta numeri, e scrivergli sopra una finestra farebbe credere che quelli
  // vecchi si riferiscano a un periodo che non è il loro.
  const giorniMetriche =
    body.giorniMetriche != null && Number(body.giorniMetriche) > 0
      ? Math.round(Number(body.giorniMetriche))
      : null;
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

  let nuoveKw = 0, aggiornateKw = 0, nuoviAnn = 0, aggiornatiAnn = 0;

  // Gli ANNUNCI citati in questa consegna, con le campagne in cui stanno:
  // servono in fondo per staccare gli agganci che Google non conferma più.
  const annunciVisti = new Set<string>();
  const campagneConAnnunci = new Set<string>();

  for (const k of keywords) {
    if (!k?.testo || !k?.campagna) continue;
    // Il testo porta con sé la corrispondenza, come nel Monitoraggio:
    // "fiori roma online (broad)" — così le due fonti si riconoscono.
    const testo = k.corrispondenza
      ? `${k.testo} (${String(k.corrispondenza).toLowerCase()})`
      : String(k.testo);
    // ⚠️ Stessa regola degli asset: i numeri si scrivono SOLO se ci sono.
    //
    // Il giro degli stati (AZIONE = "stati-keyword") manda le keyword in pausa,
    // che per definizione non hanno metriche nel periodo. Se quei null
    // finissero nell'update cancellerebbero spesa e clic scritti dal giro delle
    // metriche, e una keyword che ha speso 200 € risulterebbe a zero. Lo stato
    // si aggiorna, i numeri restano quelli buoni.
    const numeriKw: Record<string, unknown> = {};
    if (k.spesa != null) numeriKw.spesa = numero(k.spesa);
    if (k.incasso != null) numeriKw.incasso = numero(k.incasso);
    if (k.clic != null) numeriKw.clic = intero(k.clic);
    if (k.impressioni != null) numeriKw.impressioni = intero(k.impressioni);
    if (k.conversioni != null) numeriKw.conversioni = numero(k.conversioni);
    if (k.punteggioQualita != null) numeriKw.punteggioQualita = intero(k.punteggioQualita);
    // `metricheAl` data la fotografia dei NUMERI: un giro di soli stati non la
    // sposta, o la pagina direbbe che i numeri sono freschi quando non lo sono.
    if (Object.keys(numeriKw).length > 0) {
      numeriKw.metricheAl = adesso;
      if (giorniMetriche != null) numeriKw.metricheGiorni = giorniMetriche;
    }

    const esito = await salva("keyword", { ...k, testo }, {
      gruppo: k.gruppo ?? null,
      idEsterno: k.idEsterno ? String(k.idEsterno) : null,
      ...(k.statoPiattaforma != null ? { statoPiattaforma: String(k.statoPiattaforma) } : {}),
      ...numeriKw,
      fonte: canale,
    });
    if (esito === "nuova") nuoveKw++;
    else aggiornateKw++;
  }

  for (const a of annunci) {
    if (!a?.testo || !a?.campagna || !a?.tipo) continue;
    if (Array.isArray(a.annunci) && a.annunci.length > 0) {
      for (const x of a.annunci) annunciVisti.add(String(x));
      campagneConAnnunci.add(String(a.campagna));
    }
    // I numeri di un asset (sitelink, callout, snippet, immagine) arrivano solo
    // se la vista di Google li ha retti: lo script prova con le metriche e, se
    // la query viene rifiutata, ripiega sulla sola anagrafica.
    //
    // ⚠️ Quando mancano NON si scrivono. `salva()` fa un update con tutti i
    // campi passati: mandare null azzererebbe i numeri del giro riuscito, e la
    // tabella direbbe che quel sitelink non ha mai speso niente — che è la
    // risposta sbagliata alla domanda "quale ha reso di più".
    const numeriAsset: Record<string, unknown> = {};
    if (a.spesa != null) numeriAsset.spesa = numero(a.spesa);
    if (a.incasso != null) numeriAsset.incasso = numero(a.incasso);
    if (a.clic != null) numeriAsset.clic = intero(a.clic);
    if (a.impressioni != null) numeriAsset.impressioni = intero(a.impressioni);
    if (a.conversioni != null) numeriAsset.conversioni = numero(a.conversioni);
    const esito = await salva(String(a.tipo), a, {
      gruppo: a.gruppo ?? null,
      posizione: intero(a.posizione),
      finalUrl: a.finalUrl ?? null,
      livello: a.livello ?? null,
      anteprima: a.anteprima ?? null,
      note: a.note ?? null,
      // Gli annunci che usano questo testo: arrivano come elenco, si tengono
      // come stringa separata da virgole. Se lo script è vecchio e non li
      // manda, NON si azzera quello che c'è già.
      ...(Array.isArray(a.annunci) && a.annunci.length > 0
        ? { annunci: a.annunci.map((x: unknown) => String(x)).join(",") }
        : {}),
      idEsterno: a.idEsterno ? String(a.idEsterno) : null,
      rendimento: a.rendimento ?? null,
      ...numeriAsset,
      ...(Object.keys(numeriAsset).length > 0 && giorniMetriche != null
        ? { metricheGiorni: giorniMetriche }
        : {}),
      statoPiattaforma: a.statoPiattaforma ?? null,
      caratteri: String(a.testo).length,
      metricheAl: adesso,
      fonte: canale,
    });
    if (esito === "nuova") nuoviAnn++;
    else aggiornatiAnn++;
  }

  // ── Gli agganci annuncio→testo si SOSTITUISCONO, non si accumulano ────────
  // L'elenco `annunci` di una riga che arriva viene già riscritto per intero
  // qui sopra. Il problema sono le righe che NON arrivano più: un titolo tolto
  // da un RSA restava in archivio col vecchio aggancio, e un annuncio arrivava
  // a mostrare 21 titoli su un massimo di 15. Per ogni annuncio citato in
  // questa consegna, l'aggancio si stacca dalle righe che la consegna non ha
  // confermato. Si stacca l'AGGANCIO, non la riga: la storia del testo (spesa,
  // rendimento, stato) resta.
  //
  // ⚠️ La consegna arriva a blocchi che possono spezzare un annuncio a metà:
  // le righe consegnate da poco (stessa corsa, `metricheAl` fresco) non si
  // toccano — il loro elenco è appena stato riscritto ed è quello vero. Si
  // guarda `metricheAl` e non `aggiornataIl` perché questo stesso stacco
  // aggiorna `aggiornataIl`: usarla come spia farebbe saltare la pulizia dei
  // blocchi successivi.
  // ⚠️ Un annuncio MAI citato nella consegna non dice niente: le sue righe non
  // si toccano. Sostituire dove la consegna parla, tacere dove tace.
  let agganciStaccati = 0;
  if (annunciVisti.size > 0) {
    const stessaCorsa = new Date(adesso.getTime() - 2 * 60 * 60 * 1000);
    const righeNonArrivate = await prisma.copyAnnuncio.findMany({
      where: {
        canale,
        campagna: { in: [...campagneConAnnunci] },
        tipo: { in: ["titolo", "descrizione"] },
        annunci: { not: null },
        OR: [{ metricheAl: null }, { metricheAl: { lt: stessaCorsa } }],
      },
      select: { id: true, annunci: true },
    });
    for (const r of righeNonArrivate) {
      const agganci = (r.annunci ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const rimasti = agganci.filter((id) => !annunciVisti.has(id));
      if (rimasti.length === agganci.length) continue;
      await prisma.copyAnnuncio.update({
        where: { id: r.id },
        data: { annunci: rimasti.length > 0 ? rimasti.join(",") : null },
      });
      agganciStaccati++;
    }
  }

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account: body.account ? String(body.account) : null,
      tipo: keywords.length >= annunci.length ? "copy" : "asset",
      chiave: cliente.nome,
      righe: keywords.length + annunci.length,
      nuove: nuoveKw + nuoviAnn,
      aggiornate: aggiornateKw + aggiornatiAnn,
      esito: "ok",
    },
  });

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "copy",
    titolo: `Import copy da ${canale}${body.account ? ` (account ${body.account})` : ""}`,
    dettaglio: `keyword: ${nuoveKw} nuove, ${aggiornateKw} aggiornate · annunci: ${nuoviAnn} nuovi, ${aggiornatiAnn} aggiornati${agganciStaccati > 0 ? ` · ${agganciStaccati} testi staccati da annunci che non li usano più` : ""}`,
  });

  return NextResponse.json(
    {
      keywords: { nuove: nuoveKw, aggiornate: aggiornateKw },
      annunci: { nuovi: nuoviAnn, aggiornati: aggiornatiAnn, agganciStaccati },
    },
    { status: 201 }
  );
}
