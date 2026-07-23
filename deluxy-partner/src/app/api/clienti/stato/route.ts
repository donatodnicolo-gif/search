import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { schedeTutti, schedaVuota, GRAVITA, type SchedaCredito } from "@/lib/stato-credito";
import { analisiTutti, type SchedaAnalisi } from "@/lib/stato-analisi";
import { leggiRegole } from "@/lib/regole-stati";

// API pubblica: STATO DEL CLIENTE per le altre app Deluxy (Scout, Anagrafiche,
// AI Mail, Hub…). Due stati, che rispondono a due domande diverse:
//
//   • statoAnalisi      — che tipo di cliente è (P.P. / Nuovo / Dismesso),
//                         il campo "Cliente anno" della scheda partner.
//   • statoFinanziario  — come paga: regolare, da monitorare, in ritardo,
//                         scaduto grave, insoluto (vedi src/lib/stato-credito.ts),
//                         con esposizione, aging e comportamento storico.
//
//   GET /api/clienti/stato                      → tutti i clienti
//   GET /api/clienti/stato?partner=<nome|id>    → un cliente solo
//   GET /api/clienti/stato?anagraficaId=<id>    → un cliente per id del registro Anagrafiche
//   GET /api/clienti/stato?stato=insoluto,grave → solo quelli negli stati indicati
//   Header: X-API-Key: <chiave>  (la stessa di /api/verifiche e /api/riepilogo-finanziario)
//   Header: X-App: <nome-app>    (facoltativo, per lo storico richieste)
//
// Sola lettura: nessuna app esterna può cambiare questi stati da qui.

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

function risposta(
  p: {
    id: string; nome: string; ragioneSociale: string | null; anagraficaId: string | null;
    clienteAnno: string | null; attivo: boolean; ggPagamento: number; compensazione: boolean;
  },
  s: SchedaCredito,
  a?: SchedaAnalisi
) {
  return {
    partner: { id: p.id, nome: p.nome, ragioneSociale: p.ragioneSociale, anagraficaId: p.anagraficaId },
    statoAnalisi: {
      // "P.P." = partner in portafoglio; gli altri valori sono "Nuovo" e "Dismesso".
      // `codice` è il dato ufficiale (scritto nella scheda partner); `calcolato` è
      // quello che risulta dai movimenti con le regole in vigore.
      codice: p.clienteAnno ?? null,
      attivo: p.attivo,
      calcolato: a?.calcolato ?? null,
      discordante: a?.discordante ?? false,
      ultimoMovimento: a?.ultimoMovimento ?? null,
      motivo: a?.motivo ?? null,
    },
    statoFinanziario: {
      codice: s.stato,               // nessuna | regolare | monitorare | ritardo | grave | insoluto
      etichetta: s.etichetta,
      gravita: GRAVITA[s.stato],     // 0-5, per ordinare o filtrare
      motivo: s.motivo,
      azione: s.azione,
      esposizione: r2(s.esposizione),
      scaduto: r2(s.scaduto),
      aging: {
        correnti: r2(s.aging.correnti),
        g1_30: r2(s.aging.f30),
        g31_60: r2(s.aging.f60),
        g61_90: r2(s.aging.f90),
        oltre90: r2(s.aging.oltre90),
        senzaScadenza: r2(s.aging.senzaScadenza),
      },
      giorniRitardoMax: s.giorniRitardoMax,
      ritardoMedioAperto: s.ritardoMedioAperto,
      puntualitaPct: s.puntualita,             // % di importo storico incassato entro scadenza
      ritardoMedioStorico: s.ritardoMedioStorico, // giorni medi dopo la scadenza
      fattureAperte: s.fattureAperte,
      fattureScadute: s.fattureScadute,
    },
    condizioni: { giorniPagamento: p.ggPagamento, compensazione: p.compensazione },
    url: `https://deluxy-partner.vercel.app/partner/${p.id}`,
  };
}

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const rif = sp.get("partner")?.trim();
  const anagraficaId = sp.get("anagraficaId")?.trim();
  const filtroStato = (sp.get("stato") ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  const select = {
    id: true, nome: true, ragioneSociale: true, anagraficaId: true,
    clienteAnno: true, attivo: true, ggPagamento: true, compensazione: true,
  } as const;

  // ---- un cliente solo ----
  if (rif || anagraficaId) {
    const partner = anagraficaId
      ? await prisma.partner.findUnique({ where: { anagraficaId }, select })
      : (await prisma.partner.findUnique({ where: { id: rif! }, select })) ??
        (await prisma.partner.findFirst({ where: { nome: { equals: rif!, mode: "insensitive" } }, select })) ??
        (await prisma.partner.findFirst({ where: { nome: { contains: rif!, mode: "insensitive" } }, select }));
    const query = rif ?? `anagraficaId:${anagraficaId}`;
    if (!partner) {
      await log(req, query, "non_trovato");
      return NextResponse.json({ errore: "Cliente non trovato nel FINANCE." }, { status: 404 });
    }
    const [schede, analisi] = await Promise.all([schedeTutti(), analisiTutti()]);
    const s = schede.get(partner.id) ?? schedaVuota();
    await log(req, query, "trovato", `${partner.nome}: ${s.stato} (${Math.round(s.esposizione)} € esposti)`, partner);
    return NextResponse.json(risposta(partner, s, analisi.get(partner.id)));
  }

  // ---- elenco completo ----
  const [partners, schede, analisi] = await Promise.all([
    prisma.partner.findMany({ orderBy: { nome: "asc" }, select }),
    schedeTutti(),
    analisiTutti(),
  ]);
  let clienti = partners.map((p) => risposta(p, schede.get(p.id) ?? schedaVuota(), analisi.get(p.id)));
  if (filtroStato.length) clienti = clienti.filter((c) => filtroStato.includes(c.statoFinanziario.codice));
  // dal più a rischio: prima la gravità, poi l'importo scaduto
  clienti.sort(
    (a, b) =>
      b.statoFinanziario.gravita - a.statoFinanziario.gravita ||
      b.statoFinanziario.scaduto - a.statoFinanziario.scaduto
  );

  const somma = (f: (c: (typeof clienti)[number]) => number) => r2(clienti.reduce((a, c) => a + f(c), 0));
  // Le condizioni con cui gli stati sono stati calcolati: chi consuma l'API sa
  // esattamente cosa significa "insoluto" oggi (le soglie si cambiano dall'app).
  const regole = await leggiRegole();
  await log(req, filtroStato.join(",") || "tutti", "trovato", `${clienti.length} clienti`);
  return NextResponse.json({
    aggiornatoAl: new Date().toISOString(),
    base: `fatture servizi degli ultimi ${regole.credito.mesiStorico} mesi (importi IVA inclusa); le fatture compensate non sono esposizione`,
    regole,
    totali: {
      clienti: clienti.length,
      esposizione: somma((c) => c.statoFinanziario.esposizione),
      scaduto: somma((c) => c.statoFinanziario.scaduto),
    },
    clienti,
  });
}

async function log(
  req: NextRequest,
  query: string,
  esito: string,
  sintesi?: string,
  partner?: { id: string; nome: string } | null
) {
  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      partnerId: partner?.id ?? null,
      partnerNome: partner?.nome ?? null,
      esito,
      rispostaSintesi: sintesi ?? null,
      ip: ipRichiesta(req),
    },
  });
}
