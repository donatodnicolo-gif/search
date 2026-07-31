import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine } from "@/lib/apiauth";
import { registra } from "@/lib/registro";

// POST /api/v1/partners — l'altra metà dell'integrazione col registro
// Anagrafiche: quando lì un'azienda diventa CLIENTE, la scheda deve esistere
// anche qui, perché da quel momento le si fattura, si incassa e la si paga.
//
// È la prima API di FINANCE che SCRIVE: tutte le altre sono in lettura. Per
// questo l'unica cosa che sa fare è creare/aggiornare l'anagrafica di un
// partner — niente importi, niente saldi, niente pagamenti.
//
// ⚠️ Idempotente, e l'ordine dei tre casi è la parte che conta:
//   1. `anagraficaId` già noto → si aggiorna quello (il registro può richiamare
//      la stessa azienda mille volte, ed è giusto che non cambi niente);
//   2. stesso NOME → si attacca l'`anagraficaId` alla scheda che c'è già. In
//      FINANCE `nome` è @unique e i clienti storici sono qui da prima del
//      registro: senza questo passo si tenterebbe di duplicarli e le decine di
//      aziende già attive diventerebbero altrettanti doppioni;
//   3. nessuno dei due → si crea.
//
// Fee, giorni di pagamento e compensazione NON si toccano mai: sono patti
// commerciali, non dati anagrafici, e il registro non li conosce.
export const dynamic = "force-dynamic";

type Corpo = {
  anagraficaId?: string;
  nome?: string;
  ragioneSociale?: string | null;
  categoria?: string | null;
  citta?: string | null;
  email?: string | null;
  telefono?: string | null;
  pIva?: string | null;
  codiceFiscale?: string | null;
  iban?: string | null;
  intestatarioConto?: string | null;
  ammNome?: string | null;
  ammEmail?: string | null;
  ammTelefono?: string | null;
  gruppo?: string | null;
};

const testo = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

// «FIORISTA» → «Fiorista»: le categorie del registro sono in maiuscolo e negli
// elenchi di FINANCE si leggono accanto a nomi propri.
function categoriaLeggibile(c: string | null): string | null {
  if (!c) return null;
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

export async function POST(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida." }, { status: 401 });
  }

  let body: Corpo;
  try {
    body = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const nome = testo(body.nome);
  const anagraficaId = testo(body.anagraficaId);
  if (!nome) return NextResponse.json({ errore: "Manca «nome»." }, { status: 400 });

  // Solo i campi anagrafici, e solo quelli valorizzati: un campo assente nel
  // richiamo non deve cancellare quello che qui è già stato scritto a mano.
  const dati = {
    ...(testo(body.ragioneSociale) ? { ragioneSociale: testo(body.ragioneSociale) } : {}),
    ...(testo(body.categoria) ? { categoria: categoriaLeggibile(testo(body.categoria)) } : {}),
    ...(testo(body.citta) ? { citta: testo(body.citta) } : {}),
    ...(testo(body.email) ? { email: testo(body.email) } : {}),
    ...(testo(body.telefono) ? { telefono: testo(body.telefono) } : {}),
    ...(testo(body.iban) ? { iban: testo(body.iban)!.replace(/\s/g, "").toUpperCase() } : {}),
    ...(testo(body.intestatarioConto) ? { intestatarioConto: testo(body.intestatarioConto) } : {}),
    ...(testo(body.ammNome) ? { ammNome: testo(body.ammNome) } : {}),
    ...(testo(body.ammEmail) ? { ammEmail: testo(body.ammEmail) } : {}),
    ...(testo(body.ammTelefono) ? { ammTelefono: testo(body.ammTelefono) } : {}),
    // il gruppo di pagamento è un'etichetta: qui si tiene in MAIUSCOLO, altrimenti
    // «Chanel» e «CHANEL» diventano due gruppi che nello scadenzario non si sommano
    ...(testo(body.gruppo) ? { gruppo: testo(body.gruppo)!.toUpperCase() } : {}),
  };

  try {
    // 1) già collegato al registro
    if (anagraficaId) {
      const esistente = await prisma.partner.findFirst({ where: { anagraficaId } });
      if (esistente) {
        await prisma.partner.update({ where: { id: esistente.id }, data: dati });
        revalidatePath(`/partner/${esistente.id}`, "layout");
        return NextResponse.json({ esito: "aggiornato", id: esistente.id });
      }
    }

    // 2) stessa scheda, arrivata prima del registro: si collega, non si duplica
    const perNome = await prisma.partner.findUnique({ where: { nome } });
    if (perNome) {
      await prisma.partner.update({
        where: { id: perNome.id },
        data: { ...dati, ...(anagraficaId ? { anagraficaId } : {}) },
      });
      revalidatePath(`/partner/${perNome.id}`, "layout");
      revalidatePath("/partner", "layout");
      return NextResponse.json({ esito: "collegato", id: perNome.id });
    }

    // 3) non esiste: si crea
    const creato = await prisma.partner.create({
      data: { nome, attivo: true, ...(anagraficaId ? { anagraficaId } : {}), ...dati },
    });
    await registra({
      categoria: "partner",
      entita: "partner",
      entitaId: creato.id,
      partner: creato.nome,
      azione: `Creato dal registro Anagrafiche (${appOrigine(req) ?? "api"}): è diventato cliente`,
    });
    revalidatePath("/partner", "layout");
    revalidatePath("/", "layout");
    return NextResponse.json({ esito: "creato", id: creato.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}
