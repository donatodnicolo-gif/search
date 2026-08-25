import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { ANNO_CORRENTE } from "@/lib/calc";
import { prisma } from "@/lib/db";

// POST /api/v1/persone — un'altra app PROPONE una persona al roster dell'anno.
// Nasce per deluxy-personale (la casa dei dati HR): da lì una persona
// pubblicata arriva anche qui, come SEME di pianificazione — tipo DIPENDENTE
// e importo 0 finché chi fa il budget non li completa (importo 0 = non sposta
// il P&L di un euro). Il proprietario del roster resta questa app: la rotta
// non aggiorna né cancella mai una riga esistente.
//
// Auth: chiave emessa con scope «scrittura» (lo scope lo decide il metodo).
// Corpo: { nome*, ruolo?, team?, anno?, prova? } — prova: true valida e dice
// cosa succederebbe, senza scrivere (lo stile «prova a vuoto» di casa).

export const dynamic = "force-dynamic";

// Stessa normalizzazione con cui il Hub riconosce le persone di questa app:
// minuscole, senza accenti, spazi compressi.
function normalizza(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const negata = await autentica(req);
  if (negata) return negata;

  let corpo: { nome?: string; ruolo?: string; team?: string; anno?: number; prova?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ errore: "Corpo JSON mancante o non valido." }, { status: 400 });
  }

  const nome = (corpo.nome ?? "").trim();
  if (!nome) return NextResponse.json({ errore: "Serve il nome della persona." }, { status: 400 });
  const anno = Number.isInteger(corpo.anno) ? Number(corpo.anno) : ANNO_CORRENTE;
  const prova = corpo.prova === true;

  // Già nel roster? La riga NON si sovrascrive (chi possiede il dato fonde),
  // ma la proposta può COMPLETARE i campi ancora vuoti — ruolo e team — che
  // vuoti non sono una scelta, sono un buco. Cosa è stato completato si
  // dichiara nella risposta.
  const esistenti = await prisma.dipendente.findMany({
    where: { year: anno },
    select: { id: true, nome: true, ruolo: true, teamId: true },
  });
  const chiaveNome = normalizza(nome);
  const doppione = esistenti.find((e) => normalizza(e.nome) === chiaveNome);
  if (doppione) {
    const completamenti: { ruolo?: string; teamId?: string } = {};
    const completati: string[] = [];
    const ruoloProposto = (corpo.ruolo ?? "").trim();
    if (!doppione.ruolo && ruoloProposto) {
      completamenti.ruolo = ruoloProposto;
      completati.push("ruolo");
    }
    const teamProposto = (corpo.team ?? "").trim();
    if (!doppione.teamId && teamProposto) {
      const team = await prisma.team.findFirst({
        where: { nome: { equals: teamProposto, mode: "insensitive" } },
      });
      if (team) {
        completamenti.teamId = team.id;
        completati.push("team");
      }
    }
    if (!prova && completati.length > 0) {
      await prisma.dipendente.update({ where: { id: doppione.id }, data: completamenti });
    }
    return NextResponse.json(
      { creata: false, motivo: "gia_presente", id: doppione.id, anno, completati },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Il team si aggancia per nome se esiste; se non esiste NON si crea (i team
  // li disegna chi fa il budget), si dice solo che non s'è trovato.
  const avvisi: string[] = [];
  let teamId: string | null = null;
  const teamNome = (corpo.team ?? "").trim();
  if (teamNome) {
    const team = await prisma.team.findFirst({
      where: { nome: { equals: teamNome, mode: "insensitive" } },
    });
    if (team) teamId = team.id;
    else avvisi.push(`Team «${teamNome}» non trovato: la persona entra senza team.`);
  }

  const oggiIt = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const dati = {
    year: anno,
    nome,
    ruolo: (corpo.ruolo ?? "").trim() || null,
    // Il seme più neutro che il modello permetta: tipo va scelto (il campo è
    // obbligatorio) e DIPENDENTE è il caso più comune; importo 0 = costo zero
    // finché qualcuno non scrive quello vero. La nota dichiara tutto.
    tipo: "DIPENDENTE",
    importo: 0,
    teamId,
    note: `Proposta da deluxy-personale il ${oggiIt}: tipo, importo e contributi da completare qui.`,
  };

  if (prova) {
    return NextResponse.json(
      { prova: true, creerebbe: dati, avvisi },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const creata = await prisma.dipendente.create({ data: dati });
  return NextResponse.json(
    { creata: true, id: creata.id, anno, team: teamId ? teamNome : null, avvisi },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
