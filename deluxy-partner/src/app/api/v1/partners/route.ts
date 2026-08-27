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
  if (!(await chiaveApiValida(req, "scrittura"))) {
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
    ...(testo(body.ammNome) ? { ammNome: testo(body.ammNome) } : {}),
    ...(testo(body.ammEmail) ? { ammEmail: testo(body.ammEmail) } : {}),
    ...(testo(body.ammTelefono) ? { ammTelefono: testo(body.ammTelefono) } : {}),
    // il gruppo di pagamento è un'etichetta: qui si tiene in MAIUSCOLO, altrimenti
    // «Chanel» e «CHANEL» diventano due gruppi che nello scadenzario non si sommano
    ...(testo(body.gruppo) ? { gruppo: testo(body.gruppo)!.toUpperCase() } : {}),
  };

  /**
   * ⚠️ LE COORDINATE BANCARIE NON SI RISCRIVONO DA QUI (27/08/2026, revisione
   * di sicurezza).
   *
   * Questa rotta si autentica con la chiave API condivisa fra cinque app, e
   * aggancia il partner anche per NOME: bastava conoscere il nome per cambiare
   * l'IBAN di un partner a credito. Il bonifico successivo esce da
   * `GET /api/sepa`, che quell'IBAN lo prende così com'è e lo mette nella
   * distinta pain.001 che l'operatore carica in home banking. L'unica barriera
   * era l'occhio di chi autorizza — e la modifica non lasciava traccia, perché
   * `registra()` veniva chiamata SOLO alla creazione.
   *
   * Alla creazione restano ammesse: una scheda nuova non ha un IBAN da
   * sostituire. Su una scheda che esiste, si cambiano da FINANCE, a mano, da
   * chi risponde di quel conto.
   */
  const ibanChiesto = testo(body.iban) ? testo(body.iban)!.replace(/\s/g, "").toUpperCase() : null;
  const intestatarioChiesto = testo(body.intestatarioConto);

  /** Il tentativo si SCRIVE, anche quando non cambia niente: un cambio di IBAN
   *  rifiutato in silenzio è un allarme che non suona. */
  async function annotaSeDiverso(id: string, nomePartner: string, attuale: { iban: string | null; intestatarioConto: string | null }) {
    const cambiaIban = !!ibanChiesto && ibanChiesto !== (attuale.iban ?? "").replace(/\s/g, "").toUpperCase();
    const cambiaIntestatario = !!intestatarioChiesto && intestatarioChiesto !== attuale.intestatarioConto;
    if (!cambiaIban && !cambiaIntestatario) return null;
    await registra({
      categoria: "partner",
      entita: "partner",
      entitaId: id,
      partner: nomePartner,
      azione: `RIFIUTATO cambio coordinate bancarie da API (${appOrigine(req) ?? "api"}): ${
        cambiaIban ? "IBAN" : ""
      }${cambiaIban && cambiaIntestatario ? " e " : ""}${
        cambiaIntestatario ? "intestatario" : ""
      }. Si cambiano da FINANCE, non da un'altra app.`,
    });
    return "coordinate bancarie non modificate: si cambiano da FINANCE";
  }

  try {
    // 1) già collegato al registro — come anagrafica principale del partner
    //    OPPURE come altra sede della stessa scheda (`AnagraficaCollegata`):
    //    nel registro «MONCLER» Firenze e Forte dei Marmi sono due record, qui
    //    sono un cliente solo, e senza questo controllo il richiamo della
    //    seconda sede creerebbe una scheda doppia.
    if (anagraficaId) {
      const principale = await prisma.partner.findFirst({ where: { anagraficaId } });
      if (principale) {
        const nota = await annotaSeDiverso(principale.id, principale.nome, principale);
        await prisma.partner.update({ where: { id: principale.id }, data: dati });
        revalidatePath(`/partner/${principale.id}`, "layout");
        return NextResponse.json({ esito: "aggiornato", id: principale.id, ...(nota ? { nota } : {}) });
      }
      // La stessa scheda vista da una SEDE SECONDARIA: si riconosce e basta.
      // ⚠️ Non si scrive niente. I dati della scheda vengono dalla sede
      // principale, e lasciare passare l'aggiornamento significherebbe che il
      // richiamo di Forte dei Marmi riscrive città e ragione sociale del
      // MONCLER di Firenze — visto succedere in prova.
      const sede = await prisma.anagraficaCollegata.findUnique({
        where: { anagraficaId },
        select: { partnerId: true },
      });
      if (sede) {
        return NextResponse.json({ esito: "aggiornato", id: sede.partnerId, nota: "sede secondaria: scheda già presente, non modificata" });
      }
    }

    // 2) stessa scheda, arrivata prima del registro: si collega, non si duplica
    const perNome = await prisma.partner.findUnique({ where: { nome } });
    if (perNome) {
      const nota = await annotaSeDiverso(perNome.id, perNome.nome, perNome);
      await prisma.partner.update({
        where: { id: perNome.id },
        data: { ...dati, ...(anagraficaId ? { anagraficaId } : {}) },
      });
      revalidatePath(`/partner/${perNome.id}`, "layout");
      revalidatePath("/partner", "layout");
      return NextResponse.json({ esito: "collegato", id: perNome.id, ...(nota ? { nota } : {}) });
    }

    // 3) non esiste: si crea
    const creato = await prisma.partner.create({
      data: {
        nome,
        attivo: true,
        ...(anagraficaId ? { anagraficaId } : {}),
        ...dati,
        // Solo qui: una scheda nuova non ha un conto da dirottare.
        ...(ibanChiesto ? { iban: ibanChiesto } : {}),
        ...(intestatarioChiesto ? { intestatarioConto: intestatarioChiesto } : {}),
      },
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
