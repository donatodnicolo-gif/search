import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { codificaChiave, decodificaChiave } from "@/lib/clienti";
import { fraQuantiGiorni, TIPI_EVENTO, TIPI_DELICATI } from "@/lib/eventi";

// /api/v1/eventi-clienti — le ricorrenze dei clienti (compleanni, anniversari…)
// per le altre app. Il registro le possiede (le deduce dagli ordini, una
// persona le conferma): chi vuole fare gli auguri le legge da qui, non se ne
// tiene una copia.
//
// GET  ?cliente=<codice|email>   solo le ricorrenze di quel cliente
//      ?prossimi=<giorni>        solo quelle che ricorrono entro N giorni
//      ?stato=da-confermare|confermato|ignorato|tutti   (default: tutti tranne «ignorato»)
//      ?tipo=<chiave>            compleanno | anniversario | …
//      page (1..), limit (default 100, max 500) — ordinate per prossimità
// Ogni riga porta `delicato: true` sui tipi a cui NON si mandano messaggi
// allegri (condoglianze): un'automazione che ignora quel campo fa danni.
//
// POST (chiave di scrittura) — una ricorrenza scritta da una persona:
//      { cliente, giorno, mese, destinatario?, titolo?, tipo?, citta?, note? }
//      Stessa identità del rilevamento (cliente+destinatario+giorno): se esiste
//      si aggiorna quel che la persona ha scritto, non si duplica.

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: {
    chiave?: string;
    stato?: string | { not: string };
    tipo?: string;
  } = {};

  const codice = p.get("cliente")?.trim();
  if (codice) {
    where.chiave = codice.includes("@")
      ? decodeURIComponent(codice).trim().toLowerCase()
      : decodificaChiave(codice);
  }

  const stato = p.get("stato")?.trim().toLowerCase();
  if (stato && stato !== "tutti") {
    const valido = ["da-confermare", "confermato", "ignorato"].includes(stato);
    if (!valido) return erroreApi(400, `Stato sconosciuto: ${stato}`);
    where.stato = stato;
  } else if (stato !== "tutti") {
    where.stato = { not: "ignorato" };
  }

  const tipo = p.get("tipo")?.trim().toLowerCase();
  if (tipo) {
    if (!TIPI_EVENTO.some((t) => t.chiave === tipo)) return erroreApi(400, `Tipo sconosciuto: ${tipo}`);
    where.tipo = tipo;
  }

  const prossimi = p.get("prossimi") ? Math.max(0, Number(p.get("prossimi")) || 0) : null;
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(500, Math.max(1, Number(p.get("limit") ?? "100") || 100));

  // La prossimità non è una colonna: si calcola su giorno/mese e si filtra qui.
  // Le ricorrenze sono migliaia, non milioni: leggerle e ordinarle in memoria
  // costa meno che replicare in SQL il salto di fine anno.
  const tutte = await prisma.eventoCliente.findMany({ where, orderBy: [{ mese: "asc" }, { giorno: "asc" }] });
  const conGiorni = tutte
    .map((e) => ({ e, fra: fraQuantiGiorni(e.giorno, e.mese) }))
    .filter((x) => (prossimi == null ? true : x.fra <= prossimi))
    .sort((a, b) => a.fra - b.fra || b.e.ricorrenze - a.e.ricorrenze);

  const pagina = conGiorni.slice((page - 1) * limit, page * limit);

  // Il nome del cliente vive negli ordini: una sola query per l'intera pagina,
  // sulle chiavi che sono email (le altre restano leggibili così come sono).
  const emails = [...new Set(pagina.map((x) => x.e.chiave).filter((c) => c.includes("@")))];
  const nomi = new Map(
    (
      await prisma.ordine.findMany({
        where: { clienteEmail: { in: emails, mode: "insensitive" } },
        select: { clienteEmail: true, clienteNome: true },
        distinct: ["clienteEmail"],
      })
    ).map((o) => [o.clienteEmail?.trim().toLowerCase() ?? "", o.clienteNome ?? ""]),
  );

  return NextResponse.json({
    totale: conGiorni.length,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(conGiorni.length / limit)),
    eventi: pagina.map(({ e, fra }) => ({
      id: e.id,
      cliente: codificaChiave(e.chiave),
      clienteNome: nomi.get(e.chiave) || e.chiave,
      clienteEmail: e.chiave.includes("@") ? e.chiave : null,
      giorno: e.giorno,
      mese: e.mese,
      fraGiorni: fra,
      destinatario: e.destinatario,
      citta: e.citta,
      titolo: e.titolo,
      tipo: e.tipo,
      delicato: TIPI_DELICATI.includes(e.tipo),
      ricorrenze: e.ricorrenze,
      primoAnno: e.primoAnno,
      ultimoAnno: e.ultimoAnno,
      ordini: e.ordini ? e.ordini.split(" ").filter(Boolean) : [],
      ultimaSpesa: e.ultimaSpesa,
      origine: e.origine,
      stato: e.stato,
      note: e.note,
      aggiornatoIl: e.aggiornatoIl,
    })),
  });
}

export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo non valido: serve un JSON");
  }

  const codice = String(body.cliente ?? "").trim();
  if (!codice) return erroreApi(400, "Manca il cliente (base64url della chiave, o l'email)");
  const chiave = codice.includes("@") ? codice.trim().toLowerCase() : decodificaChiave(codice);

  const giorno = Number(body.giorno);
  const mese = Number(body.mese);
  if (!Number.isInteger(giorno) || giorno < 1 || giorno > 31) return erroreApi(400, "Giorno non valido (1–31)");
  if (!Number.isInteger(mese) || mese < 1 || mese > 12) return erroreApi(400, "Mese non valido (1–12)");

  const tipo = String(body.tipo ?? "da-precisare").trim().toLowerCase() || "da-precisare";
  if (!TIPI_EVENTO.some((t) => t.chiave === tipo)) return erroreApi(400, `Tipo sconosciuto: ${tipo}`);

  const destinatario = String(body.destinatario ?? "").trim();
  const anno = new Date().getUTCFullYear();

  // Stessa identità del rilevamento: scrivere due volte aggiorna, non duplica.
  const evento = await prisma.eventoCliente.upsert({
    where: { chiave_destinatario_mese_giorno: { chiave, destinatario, mese, giorno } },
    create: {
      chiave,
      destinatario,
      giorno,
      mese,
      citta: String(body.citta ?? "").trim(),
      titolo: String(body.titolo ?? "").trim(),
      tipo,
      tipoDa: tipo === "da-precisare" ? "" : "manuale",
      ricorrenze: 1,
      primoAnno: anno,
      ultimoAnno: anno,
      origine: "manuale",
      stato: "confermato",
      note: body.note ? String(body.note) : null,
    },
    update: {
      // Solo ciò che una persona può voler correggere: i fatti dedotti
      // (ricorrenze, anni, ordini) restano del rilevamento.
      titolo: String(body.titolo ?? "").trim() || undefined,
      tipo,
      tipoDa: tipo === "da-precisare" ? undefined : "manuale",
      citta: String(body.citta ?? "").trim() || undefined,
      note: body.note ? String(body.note) : undefined,
      stato: "confermato",
    },
  });

  return NextResponse.json({
    ok: true,
    id: evento.id,
    cliente: codificaChiave(evento.chiave),
    giorno: evento.giorno,
    mese: evento.mese,
    destinatario: evento.destinatario,
    tipo: evento.tipo,
    stato: evento.stato,
  });
}
