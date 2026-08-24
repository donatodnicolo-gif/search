import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AMBITI, OBIETTIVI } from "@/lib/premi-tipi";

// I **premi al raggiungimento**: creazione, modifica e cancellazione.
//
// ⚠️ Un premio è un **impegno verso una persona**, quindi qui si valida invece
// di fidarsi del form: un ambito che non esiste, un obiettivo che l'app non sa
// misurare o un destinatario mancante trasformerebbero il premio in una riga
// che non paga nessuno — e che nessuno scopre finché non è il momento di pagare.

const ambitoValido = (v: string) => AMBITI.some((a) => a.key === v);
const obiettivoValido = (v: string) => OBIETTIVI.some((o) => o.key === v);
const serveRif = (v: string) => OBIETTIVI.find((o) => o.key === v)?.serveRif ?? false;

function valida(b: Record<string, unknown>): { errore: string } | null {
  const nome = String(b.nome ?? "").trim();
  if (!nome) return { errore: "Serve un nome: senza, nell'elenco non si capisce di quale premio si parla." };
  if (nome.length > 80) return { errore: "Nome troppo lungo." };

  const ambito = String(b.ambito ?? "");
  if (!ambitoValido(ambito)) return { errore: "Ambito non valido." };
  if (ambito === "TEAM" && !String(b.teamId ?? "")) return { errore: "Scegli la squadra a cui va il premio." };
  if (ambito === "PERSONA" && !String(b.dipendenteId ?? ""))
    return { errore: "Scegli la persona a cui va il premio." };

  const tipo = String(b.obiettivoTipo ?? "");
  if (!obiettivoValido(tipo)) return { errore: "Obiettivo non valido." };
  if (serveRif(tipo) && !String(b.obiettivoRif ?? ""))
    return { errore: "Scegli su quale brand o linea si misura l'obiettivo." };

  const dal = Number(b.dal);
  const al = Number(b.al);
  if (!Number.isInteger(dal) || !Number.isInteger(al) || dal < 1 || al > 12 || dal > al)
    return { errore: "Il periodo dev'essere fra 1 e 12, e il mese iniziale non può venire dopo quello finale." };

  const importo = Number(b.importo);
  // Un premio a zero non è un errore di battitura da correggere in silenzio, ma
  // non è nemmeno un premio: si rifiuta dicendolo.
  if (!Number.isFinite(importo) || importo <= 0)
    return { errore: "L'importo dev'essere maggiore di zero." };

  // ⚠️ La soglia può essere **negativa**: su EBITDA un obiettivo realistico
  // quest'anno è «perdere meno di X». Si controlla solo che sia un numero.
  if (!Number.isFinite(Number(b.soglia))) return { errore: "La soglia dev'essere un numero." };

  return null;
}

function dati(b: Record<string, unknown>) {
  const ambito = String(b.ambito);
  const tipo = String(b.obiettivoTipo);
  return {
    nome: String(b.nome).trim(),
    ambito,
    // Si azzerano i riferimenti che **non c'entrano** con l'ambito scelto:
    // lasciarli scritti farebbe riapparire una squadra vecchia il giorno in cui
    // qualcuno rimette il premio su TEAM.
    teamId: ambito === "TEAM" ? String(b.teamId) : null,
    dipendenteId: ambito === "PERSONA" ? String(b.dipendenteId) : null,
    obiettivoTipo: tipo,
    obiettivoRif: serveRif(tipo) ? String(b.obiettivoRif) : null,
    soglia: Number(b.soglia),
    dal: Number(b.dal),
    al: Number(b.al),
    importo: Number(b.importo),
    note: String(b.note ?? "").trim() || null,
  };
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  const anno = Number(b.year);
  if (!anno) return NextResponse.json({ error: "anno mancante" }, { status: 400 });
  const male = valida(b);
  if (male) return NextResponse.json({ error: male.errore }, { status: 400 });

  const creato = await prisma.premio.create({ data: { year: anno, ...dati(b) } });
  return NextResponse.json({ ok: true, id: creato.id });
}

export async function PUT(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  // Il **riconoscimento a mano** si manda da solo, senza il resto del premio:
  // è il gesto di chi decide di pagare (o non pagare) e non deve poter
  // riscrivere per sbaglio l'obiettivo mentre lo fa.
  if (b.riconosciuto !== undefined && b.nome === undefined) {
    const v = b.riconosciuto;
    const riconosciuto = v === null ? null : v === true;
    const p = await prisma.premio.update({ where: { id }, data: { riconosciuto } });
    return NextResponse.json({ ok: true, riconosciuto: p.riconosciuto });
  }

  const male = valida(b);
  if (male) return NextResponse.json({ error: male.errore }, { status: 400 });
  await prisma.premio.update({ where: { id }, data: dati(b) });
  return NextResponse.json({ ok: true });
}

// Un premio si **cancella** davvero: al contrario di una chiave API non è una
// traccia di accesso da conservare, è una riga di budget scritta per sbaglio.
export async function DELETE(req: Request) {
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.premio.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
