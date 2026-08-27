import { NextRequest, NextResponse } from "next/server";
import { ANNO_CORRENTE } from "@/lib/calc";
import { controllaMesiChiusi } from "@/lib/sentinella-consegne";
import { MESI } from "@/lib/format";

// LA CORSA DELLA SENTINELLA — GET /api/cron/sentinella-consegne
//
// Legge il costo delle consegne dei mesi **chiusi** e lo confronta con l'ultima
// lettura registrata: se un mese che si credeva fermo si è mosso, lo dice.
// Registra la fotografia di oggi solo dove è cambiato qualcosa.
//
// ⚠️ **L'identità è la PRIMA cosa che succede.** Vercel chiama i cron con
// `Authorization: Bearer <CRON_SECRET>`; senza quel segreto configurato la
// rotta è **chiusa per tutti**, non aperta per tutti — è la stessa scelta della
// corsa notturna della piattaforma, e la trappola («l'auth dopo lo
// smistamento») è già stata pagata una volta in questo ecosistema.
//
// ⚠️ La rotta sta sotto `/api/cron/`, che il middleware protegge come tutto il
// resto: il segreto serve perché il cron di Vercel non ha una sessione.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const segreto = (process.env.CRON_SECRET ?? "").trim();
  const inviato = (req.headers.get("authorization") ?? "").trim();
  if (!segreto || inviato !== `Bearer ${segreto}`) {
    return NextResponse.json(
      { errore: "Questa rotta la chiama il cron: serve CRON_SECRET." },
      { status: 401 }
    );
  }

  const esito = await controllaMesiChiusi(ANNO_CORRENTE, { registra: true });
  if (!esito.ok) {
    // ⚠️ Un errore qui NON è «niente si è mosso»: è «non lo so». Chi legge
    // l'esito del cron deve poter distinguere le due cose, o il silenzio della
    // piattaforma passerà per una buona notizia.
    return NextResponse.json(
      { ok: false, motivo: "la piattaforma non ha risposto", errore: esito.errore },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    anno: ANNO_CORRENTE,
    mesiChiusiControllati: esito.controllati,
    mossi: esito.mossi.map((m) => ({
      mese: MESI[m.month - 1],
      prima: Math.round(m.prima * 100) / 100,
      adesso: Math.round(m.adesso * 100) / 100,
      differenza: Math.round(m.differenza * 100) / 100,
      lettoPrimaIl: m.quando,
    })),
    // Detto anche quando non si è mosso niente: un esito che esiste solo
    // quando c'è una brutta notizia non si distingue da un cron che non gira.
    nota:
      esito.mossi.length === 0
        ? "Nessun mese chiuso si è mosso dall'ultima lettura."
        : `${esito.mossi.length} mesi chiusi sono cambiati: il conto economico dei mesi passati non è più quello di ieri.`,
  });
}
