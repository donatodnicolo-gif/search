import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// Creazione e revoca delle chiavi API, dalla pagina Impostazioni.
//
// NON è sotto /api/v1: quelle sono le API che le altre app chiamano con una
// chiave, questa è una rotta interna e passa dal middleware, quindi la protegge
// la password dell'app. Una rotta che crea chiavi non può stare dietro una
// chiave: chi non ne ha ancora una non potrebbe usarla.
//
// La chiave appena creata torna nel CORPO della risposta e da nessuna altra
// parte: nel database resta solo lo SHA-256, e non finisce in un indirizzo —
// gli indirizzi si salvano nella cronologia, nei log dei proxy e nei preferiti.

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as { nome?: string; solaLettura?: boolean };
  const nome = String(corpo.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ errore: "Serve un nome: dice a cosa serve la chiave." }, { status: 400 });
  }
  if (await prisma.apiKey.findFirst({ where: { nome, attiva: true } })) {
    return NextResponse.json(
      { errore: `Esiste già una chiave attiva chiamata "${nome}". Revocala o usane un altro nome.` },
      { status: 409 }
    );
  }

  const chiave = `dmk_${randomBytes(24).toString("hex")}`;
  const record = await prisma.apiKey.create({
    data: {
      nome,
      hash: createHash("sha256").update(chiave).digest("hex"),
      scrittura: !corpo.solaLettura,
    },
  });

  // ⚠️ La creazione lascia una traccia (27/08/2026). Non e' una difesa: chi
  // conia una chiave ha gia' la password del team, quindi e' l'amministratore.
  // Ma una credenziale che nasce senza che nessuno possa dire QUANDO e con
  // quale ambito e' una cosa che, il giorno che qualcosa va storto, non si
  // ricostruisce. Il valore della chiave non entra nel registro: solo il nome
  // e l'ambito.
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "impostazione",
    entitaId: record.id,
    titolo: `Chiave API creata: ${record.nome}`,
    dettaglio: record.scrittura ? "Ambito: lettura e SCRITTURA" : "Ambito: sola lettura",
  }).catch(() => {});

  return NextResponse.json({ id: record.id, nome: record.nome, scrittura: record.scrittura, chiave });
}

// Revoca: la riga resta, con attiva = false. Cancellarla toglierebbe anche la
// traccia di quando era stata usata l'ultima volta, che è quello che si guarda
// quando qualcosa smette di funzionare.
export async function DELETE(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ errore: "id mancante" }, { status: 400 });
  const revocata = await prisma.apiKey.update({ where: { id }, data: { attiva: false } });
  await registra({
    autore: "utente",
    tipo: "stato",
    entita: "impostazione",
    entitaId: id,
    titolo: `Chiave API revocata: ${revocata.nome}`,
    dettaglio: "La riga resta, con attiva = false: si conserva quando era stata usata l'ultima volta.",
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
