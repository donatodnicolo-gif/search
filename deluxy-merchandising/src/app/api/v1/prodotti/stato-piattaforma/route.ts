import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/v1/prodotti/stato-piattaforma
//
// La piattaforma consegne dice che ne fa dei nostri prodotti: `attivo` o
// `archiviato`. Serve a chi lavora qui — un prodotto che il PLM considera «in
// vendita» ma che la piattaforma ha archiviato perché non lo consegna nessuno
// da due anni è una cosa da sapere, non un dettaglio tecnico.
//
// ⚠️ **Non tocca la `fase`**, ed è la ragione per cui questa rotta esiste
// separata dal POST che crea i prodotti. La fase è la nostra decisione (dove sta
// il prodotto nel suo ciclo di vita); lo stato della piattaforma è un fatto
// altrui. Sono due verità diverse sullo stesso prodotto, e schiacciarle in un
// campo solo ne farebbe sparire una — di solito la nostra, perché l'ultimo che
// scrive vince.
//
// Corpo: { stati: [{ codice, stato }] } — a lotti, perché altrimenti sarebbero
// migliaia di richieste per dire una parola ciascuna.
export async function POST(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  let body: { stati?: { codice?: string; stato?: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return erroreApi(400, "Corpo della richiesta non è JSON valido.");
  }

  const stati = Array.isArray(body?.stati) ? body.stati : [];
  if (!stati.length) return erroreApi(400, "Serve «stati»: una lista di { codice, stato }.");
  if (stati.length > 1000) return erroreApi(400, "Troppi elementi in un colpo solo: massimo 1000 per richiesta.");

  const AMMESSI = new Set(["attivo", "archiviato"]);
  const quando = new Date();
  let aggiornati = 0;
  const sconosciuti: string[] = [];
  const nonValidi: string[] = [];

  for (const riga of stati) {
    const codice = String(riga?.codice ?? "").trim();
    const stato = String(riga?.stato ?? "").trim().toLowerCase();
    if (!codice) continue;
    if (!AMMESSI.has(stato)) { nonValidi.push(codice); continue; }
    // updateMany e non update: un codice che qui non esiste non è un errore,
    // è semplicemente un prodotto che non ci riguarda.
    const { count } = await prisma.prodotto.updateMany({
      where: { codice },
      data: { statoPiattaforma: stato, statoPiattaformaIl: quando },
    });
    if (count) aggiornati += count;
    else sconosciuti.push(codice);
  }

  return NextResponse.json({
    ricevuti: stati.length,
    aggiornati,
    // Detto e non nascosto: chi manda deve poter capire perché il conto non torna.
    nonTrovatiQui: sconosciuti.length,
    statoNonValido: nonValidi.length,
    esempiNonTrovati: sconosciuti.slice(0, 10),
  });
}
