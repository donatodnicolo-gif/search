import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// POST /api/v1/ingest/diagnosi — quello che serve per capire una campagna oltre
// ai totali: cosa ha scritto davvero la gente (termini di ricerca) e come si
// spartisce la spesa (dispositivo, giorno, rete).
//
// Perché un endpoint a parte e non /ingest: questi dati non sono per giorno, ma
// per periodo. Rimandarli sostituisce la fotografia precedente dello stesso
// periodo invece di sommarsi — se si sommassero, una campagna sembrerebbe
// spendere il doppio a ogni passata dello script.
//
// REGOLA: lo stato deciso nell'app (pertinente / da escludere / escluso) è una
// scelta dell'utente e l'import non lo tocca mai.
//
// Body: {
//   canale?: "google_ads", account?: "248-656-1148",
//   terminiRicerca?: [{ idCampagna* | campagna*, testo*, keyword?, corrispondenza?,
//                       gruppo?, spesa?, clic?, impressioni?, conversioni?, ricavi?,
//                       dal?, al? }],
//   segmenti?:       [{ idCampagna* | campagna*, tipo*: "dispositivo"|"giorno"|"rete",
//                       valore*, spesa?, clic?, impressioni?, conversioni?, ricavi?,
//                       dal?, al? }]
// }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const termini = Array.isArray(body.terminiRicerca) ? body.terminiRicerca : [];
  const segmenti = Array.isArray(body.segmenti) ? body.segmenti : [];
  if (termini.length === 0 && segmenti.length === 0) {
    return erroreApi(400, "Niente da importare: servono 'terminiRicerca' o 'segmenti'");
  }

  const canale = body.canale ?? "google_ads";
  const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const intero = (v: unknown) => (numero(v) != null ? Math.round(numero(v)!) : null);
  const data = (v: unknown) => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  };

  // Le campagne si riconoscono per id di piattaforma, con il nome come ripiego.
  // Chi non si trova viene detto, non inventato.
  const cache = new Map<string, string | null>();
  const nonTrovate = new Set<string>();
  async function campagnaDi(r: { idCampagna?: unknown; campagna?: unknown }): Promise<string | null> {
    const idEsterno = r.idCampagna ? String(r.idCampagna) : null;
    const nome = r.campagna ? String(r.campagna) : null;
    const chiave = `${idEsterno ?? ""}|${nome ?? ""}`;
    if (cache.has(chiave)) return cache.get(chiave)!;
    let c = idEsterno
      ? await prisma.campagna.findFirst({ where: { idEsterno, canale }, select: { id: true } })
      : null;
    if (!c && nome) c = await prisma.campagna.findFirst({ where: { nome, canale }, select: { id: true } });
    if (!c && (nome || idEsterno)) nonTrovate.add(nome ?? idEsterno!);
    cache.set(chiave, c?.id ?? null);
    return c?.id ?? null;
  }

  let nuoviTermini = 0, aggiornatiTermini = 0, nuoviSegmenti = 0, aggiornatiSegmenti = 0, scartate = 0;

  for (const t of termini) {
    if (!t?.testo) { scartate++; continue; }
    const campagnaId = await campagnaDi(t);
    if (!campagnaId) { scartate++; continue; }
    const valori = {
      gruppo: t.gruppo ? String(t.gruppo) : null,
      keyword: t.keyword ? String(t.keyword) : null,
      corrispondenza: t.corrispondenza ? String(t.corrispondenza) : null,
      spesa: numero(t.spesa),
      clic: intero(t.clic),
      impressioni: intero(t.impressioni),
      conversioni: numero(t.conversioni),
      ricavi: numero(t.ricavi),
      dal: data(t.dal),
      al: data(t.al),
    };
    const esistente = await prisma.termineRicerca.findUnique({
      where: { campagnaId_testo: { campagnaId, testo: String(t.testo) } },
      select: { id: true },
    });
    if (esistente) {
      await prisma.termineRicerca.update({ where: { id: esistente.id }, data: valori });
      aggiornatiTermini++;
    } else {
      await prisma.termineRicerca.create({ data: { campagnaId, testo: String(t.testo), ...valori } });
      nuoviTermini++;
    }
  }

  for (const s of segmenti) {
    if (!s?.tipo || !s?.valore) { scartate++; continue; }
    const campagnaId = await campagnaDi(s);
    if (!campagnaId) { scartate++; continue; }
    const valori = {
      spesa: numero(s.spesa),
      clic: intero(s.clic),
      impressioni: intero(s.impressioni),
      conversioni: numero(s.conversioni),
      ricavi: numero(s.ricavi),
      dal: data(s.dal),
      al: data(s.al),
    };
    const chiave = { campagnaId, tipo: String(s.tipo), valore: String(s.valore) };
    const esistente = await prisma.segmentoCampagna.findUnique({
      where: { campagnaId_tipo_valore: chiave },
      select: { id: true },
    });
    if (esistente) {
      await prisma.segmentoCampagna.update({ where: { id: esistente.id }, data: valori });
      aggiornatiSegmenti++;
    } else {
      await prisma.segmentoCampagna.create({ data: { ...chiave, ...valori } });
      nuoviSegmenti++;
    }
  }

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account: body.account ? String(body.account) : null,
      tipo: "diagnosi",
      chiave: cliente.nome,
      righe: termini.length + segmenti.length,
      nuove: nuoviTermini + nuoviSegmenti,
      aggiornate: aggiornatiTermini + aggiornatiSegmenti,
      scartate,
      esito: scartate > 0 ? "parziale" : "ok",
    },
  });

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "metrica",
    titolo: `Diagnosi ${canale}${body.account ? ` da account ${body.account}` : ""}`,
    dettaglio:
      `termini: ${nuoviTermini} nuovi, ${aggiornatiTermini} aggiornati · ` +
      `segmenti: ${nuoviSegmenti} nuovi, ${aggiornatiSegmenti} aggiornati` +
      (scartate ? ` · ${scartate} righe scartate` : ""),
  });

  return NextResponse.json(
    {
      terminiRicerca: { nuovi: nuoviTermini, aggiornati: aggiornatiTermini },
      segmenti: { nuovi: nuoviSegmenti, aggiornati: aggiornatiSegmenti },
      righeScartate: scartate,
      campagneNonTrovate: [...nonTrovate].slice(0, 10),
    },
    { status: 201 }
  );
}
