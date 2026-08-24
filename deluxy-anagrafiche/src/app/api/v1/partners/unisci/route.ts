import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { unisciAnagrafiche } from "@/lib/azioni";

// POST /api/v1/partners/unisci — unisce due anagrafiche che sono la stessa
// azienda scritta in due modi. È la stessa `unisciAnagrafiche()` che usa la UI
// del registro, esposta perché **anche le altre app trovano i doppioni**.
//
// PERCHÉ ESISTE (23/08/2026). In Deluxy Scout c'è una schermata Riconciliazione
// che unisce i negozi doppi. Ma quell'unione viveva solo dentro Scout: il
// registro restava con due anagrafiche, e siccome l'import fa `upsert on
// conflict (anagrafiche_id)`, al giro successivo **il doppione tornava**.
// Misurato il 23/08: su 364 coppie proposte, in 65 la scheda scartata era
// legata al registro — cioè 65 unioni che si disfacevano da sole.
//
// Body:
//   { sorgenteId, destinazioneId, prova?: boolean }
// La SORGENTE viene archiviata (mai cancellata) e la DESTINAZIONE resta: è la
// stessa regola della UI, e vuol dire che un'unione sbagliata si può sempre
// guardare in faccia.
//
// `prova: true` non scrive niente e racconta cosa succederebbe. Serve a chi
// chiama per far vedere le due schede prima di premere — e a noi per provare
// la rotta in produzione senza toccare i dati.
export async function POST(req: NextRequest) {
  // ⚠️ Scope: **scrittura piena**. Unire archivia un'anagrafica e sposta
  // referenti, feedback e riferimenti: non è l'upsert di un partner, ed è
  // giusto che una chiave di sola lettura (o di solo `partner`) non possa
  // farlo. Chi chiama da fuori deve avere una chiave di scrittura vera.
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const sorgenteId = typeof body.sorgenteId === "string" ? body.sorgenteId.trim() : "";
  const destinazioneId = typeof body.destinazioneId === "string" ? body.destinazioneId.trim() : "";
  if (!sorgenteId || !destinazioneId) {
    return erroreApi(400, "Servono `sorgenteId` (quella che viene archiviata) e `destinazioneId` (quella che resta)");
  }
  if (sorgenteId === destinazioneId) return erroreApi(400, "Sono la stessa anagrafica");

  const [sorgente, destinazione] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: sorgenteId },
      select: { id: true, nome: true, citta: true, attivo: true, _count: { select: { contatti: true } } },
    }),
    prisma.partner.findUnique({
      where: { id: destinazioneId },
      select: { id: true, nome: true, citta: true, attivo: true, _count: { select: { contatti: true } } },
    }),
  ]);
  // 404 col dettaglio di QUALE manca: con due id in gioco, «non trovata» da
  // solo costringe chi chiama a provarle una per una.
  if (!sorgente || !destinazione) {
    return erroreApi(404, `Anagrafica non trovata: ${!sorgente ? "sorgente" : ""}${!sorgente && !destinazione ? " e " : ""}${!destinazione ? "destinazione" : ""}`);
  }

  const scheda = (p: typeof sorgente) => ({
    id: p!.id,
    nome: p!.nome,
    citta: p!.citta,
    attivo: p!.attivo,
    referenti: p!._count.contatti,
  });

  if (body.prova === true) {
    return NextResponse.json({
      ok: true,
      prova: true,
      archivia: scheda(sorgente),
      resta: scheda(destinazione),
      // Il motivo per cui un'unione può essere rifiutata anche quando le due
      // schede esistono: si dice PRIMA, non dopo aver premuto.
      bloccata: destinazione.attivo ? null : "La destinazione è archiviata: ripristinala prima di unire.",
    });
  }

  const esito = await unisciAnagrafiche(sorgenteId, destinazioneId);
  if (!esito.ok) return erroreApi(409, esito.errore);

  return NextResponse.json({
    ok: true,
    archiviata: scheda(sorgente),
    resta: scheda(destinazione),
    spostati: esito.spostati,
    messaggio: `«${sorgente.nome}» unita a «${destinazione.nome}»: archiviata, non cancellata.`,
  });
}
