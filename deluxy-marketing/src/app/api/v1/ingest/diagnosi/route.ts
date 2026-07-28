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

  // ⚠️ Google manda una riga per ogni coppia (parola cercata × keyword): la
  // stessa ricerca intercettata da due keyword arriva DUE VOLTE, con la spesa
  // spezzata. Qui si tiene una riga per (campagna, testo), quindi si SOMMA
  // prima di scrivere — altrimenti vince l'ultima letta e la parola risulta
  // costare la metà. Lo script somma già dalla sua parte, ma l'ingest non può
  // fidarsi del mittente: una copia vecchia dello script manda ancora spezzato.
  type Accumulo = {
    campagnaId: string;
    testo: string;
    gruppo: string | null;
    keyword: string | null;
    corrispondenza: string | null;
    keywordDiverse: number | null;
    spesa: number | null;
    clic: number | null;
    impressioni: number | null;
    conversioni: number | null;
    ricavi: number | null;
    dal: Date | null;
    al: Date | null;
  };
  const accumulati = new Map<string, Accumulo & { spesaMax: number; viste: Set<string> }>();
  const somma = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0);

  for (const t of termini) {
    if (!t?.testo) { scartate++; continue; }
    const campagnaId = await campagnaDi(t);
    if (!campagnaId) { scartate++; continue; }
    const testo = String(t.testo);
    const chiave = `${campagnaId} ${testo}`;
    const spesaRiga = numero(t.spesa) ?? 0;
    const v = accumulati.get(chiave) ?? {
      campagnaId,
      testo,
      gruppo: null,
      keyword: null,
      corrispondenza: null,
      keywordDiverse: null,
      spesa: null,
      clic: null,
      impressioni: null,
      conversioni: null,
      ricavi: null,
      dal: data(t.dal),
      al: data(t.al),
      spesaMax: -1,
      viste: new Set<string>(),
    };
    // Quante keyword hanno intercettato questa ricerca: il mittente può
    // dichiararlo (script già sommato) oppure lo si conta dalle righe spezzate.
    if (t.keyword) v.viste.add(String(t.keyword));
    const dichiarate = intero((t as { keywordDiverse?: unknown }).keywordDiverse);
    v.keywordDiverse = Math.max(v.keywordDiverse ?? 0, dichiarate ?? 0, v.viste.size) || null;
    v.spesa = somma(v.spesa, numero(t.spesa));
    v.clic = somma(v.clic, intero(t.clic));
    v.impressioni = somma(v.impressioni, intero(t.impressioni));
    v.conversioni = somma(v.conversioni, numero(t.conversioni));
    v.ricavi = somma(v.ricavi, numero(t.ricavi));
    // Keyword e gruppo mostrati: quelli che hanno speso di più su questa
    // ricerca. Sommarli non vorrebbe dire niente, prenderne uno a caso nemmeno.
    if (spesaRiga > v.spesaMax) {
      v.spesaMax = spesaRiga;
      v.gruppo = t.gruppo ? String(t.gruppo) : v.gruppo;
      v.keyword = t.keyword ? String(t.keyword) : v.keyword;
      v.corrispondenza = t.corrispondenza ? String(t.corrispondenza) : v.corrispondenza;
    }
    accumulati.set(chiave, v);
  }

  // Una lettura sola e il confronto in memoria: con due query per termine (e
  // fino a 300 termini a passata) la funzione scadeva su Vercel.
  const campagneToccate = [...new Set([...accumulati.values()].map((v) => v.campagnaId))];
  const esistentiTermini = campagneToccate.length
    ? await prisma.termineRicerca.findMany({
        where: { campagnaId: { in: campagneToccate } },
        select: { id: true, campagnaId: true, testo: true },
      })
    : [];
  const idPerChiave = new Map(esistentiTermini.map((e) => [`${e.campagnaId} ${e.testo}`, e.id]));

  const daCreare: Accumulo[] = [];
  for (const [chiave, voce] of accumulati) {
    const { spesaMax: _scarto, viste: _scarto2, ...valori } = voce;
    const id = idPerChiave.get(chiave);
    if (id) {
      await prisma.termineRicerca.update({ where: { id }, data: valori });
      aggiornatiTermini++;
    } else {
      daCreare.push(valori);
    }
  }
  if (daCreare.length > 0) {
    await prisma.termineRicerca.createMany({ data: daCreare, skipDuplicates: true });
    nuoviTermini += daCreare.length;
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
