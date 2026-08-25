import { NextRequest, NextResponse } from "next/server";
import { sincronizzaDrive } from "@/lib/drive";

// GET /api/cron/drive — l'indice della cartella ADV, riallineato da solo.
//
// ⚠️⚠️ PERCHÉ ESISTE (25/08/2026). L'app **scriveva** su Drive per conto suo
// (il ponte deposita APPEND e RISULTATI ogni sera) ma **leggeva** solo quando
// qualcuno premeva un bottone. Risultato misurato: l'ultima indicizzazione era
// del 17/08, il documento più recente che l'app conosceva era del 07/08 e la
// tabella `Analisi` si fermava al 04/08 — mentre su Drive, in quegli otto
// giorni, erano stati depositati tredici file veri, fra cui l'analisi Meta che
// ha poi trovato un difetto di questa app. Una memoria che scrive e non
// rilegge non è una memoria.
//
// ⚠️ Non serviva niente di nuovo per farlo: `sincronizzaDrive()` sceglie da sé
// la strada. Se la cartella è configurata come **URL o id di Drive** (lo è:
// `drive.cartella`) e la chiave API c'è (c'è), usa l'API di Drive, che gira
// benissimo qui. Il percorso `G:\…` è solo il ripiego per lo sviluppo locale,
// e su Vercel non esiste: era **quello** il motivo per cui sembrava che la
// sync potesse girare solo dal PC dell'utente. Non era vero.
//
// Orario: 06:10 UTC, cioè prima del giro dei RISULTATI del lunedì (06:40) e
// prima che qualcuno apra l'app. Ogni giorno: le analisi arrivano quando
// arrivano, e un indice vecchio di una settimana fa dire «non ne sono state
// depositate» quando invece nessuno era passato a guardare.
//
// ⚠️ La passata si ferma da sola prima del limite della funzione e riprende
// dal punto in cui era (`ripartiDa`): una cartella grande non si indicizza in
// un colpo, e farsi uccidere a metà è peggio che fermarsi con ordine.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const segreto = (process.env.CRON_SECRET || "").trim();
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non impostato: l'endpoint del cron resta chiuso." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const esito = await sincronizzaDrive();
  if (esito.errore) {
    return NextResponse.json(
      { errore: esito.errore, radice: esito.radice, trovati: esito.trovati },
      { status: 502 },
    );
  }
  return NextResponse.json(
    {
      radice: esito.radice,
      trovati: esito.trovati,
      nuovi: esito.nuovi,
      aggiornati: esito.aggiornati,
      rimossi: esito.rimossi,
      analisi: esito.analisi,
      // ⚠️ «interrotta» non è un errore: è una passata che si è fermata per
      // tempo e riprenderà. Va detto, o un indice a metà si legge come completo
      // — che è esattamente l'errore del censimento troncato.
      interrotta: esito.interrotta,
    },
    { status: 200 },
  );
}
