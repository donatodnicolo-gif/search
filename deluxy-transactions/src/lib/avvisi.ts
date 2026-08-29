import { prisma } from "./db";
import { decifra, hmacSha256, sha256 } from "./crypto";

// L'avviso «è arrivata una richiesta di pagamento», sul telefono di chi paga.
//
// Chiesto dall'utente il 29/08/2026. Questa app non ha WhatsApp: ce l'ha il
// Customer Service, che avvisa già da solo per le richieste nate lì. Per le
// richieste delle ALTRE app (Scout, Finance, Piattaforma) l'avviso lo chiede
// Transactions, chiamando il CS su POST /api/pagamenti/avvisa.
//
// Il canale è quello che c'è già: si firma con il segreto HMAC della chiave
// «deluxy-messaging» (lo stesso dei webhook degli esiti) — nessuna chiave
// nuova, nessun segreto nuovo da custodire. Fail-open di proposito: un avviso
// che non parte non deve MAI far fallire la creazione di una richiesta.

function urlCsAvvisa(): string {
  const base = ((process.env.CS_URL ?? "").trim() || "https://deluxy-messaging.vercel.app").replace(/\/+$/, "");
  return `${base}/api/pagamenti/avvisa`;
}

export async function avvisaCsNuovaRichiesta(r: {
  id: string;
  riferimento: string;
  origine: string;
  importoCent: number;
  valuta: string;
  beneficiario: string;
  metodo: string;
  iban: string;
  riferimentoPagamento: string | null;
  causale: string;
}): Promise<void> {
  try {
    // Le richieste del CS si avvisano già da sole al salvataggio; le manuali
    // le crea la persona che è GIÀ dentro quest'app.
    if (r.origine === "deluxy-messaging" || r.origine === "manuale") return;

    const chiaveCs = await prisma.chiaveApi.findFirst({
      where: { nome: "deluxy-messaging", attiva: true, revocataIl: null },
      select: { segretoHmac: true },
    });
    if (!chiaveCs) return; // canale CS non attivo: niente avviso, nessun errore

    const corpo = JSON.stringify({
      origine: r.origine,
      id: r.id,
      riferimento: r.riferimento,
      importoCent: r.importoCent,
      valuta: r.valuta,
      beneficiario: r.beneficiario,
      metodo: r.metodo,
      // L'IBAN intero: il senso dell'avviso è poter pagare dal telefono. Il
      // canale è firmato e il destinatario è il pagatore.
      ...(r.metodo === "iban" ? { iban: r.iban } : {}),
      ...(r.riferimentoPagamento ? { riferimentoPagamento: r.riferimentoPagamento } : {}),
      causale: r.causale,
    });
    const timestamp = String(Date.now());
    const segreto = decifra(chiaveCs.segretoHmac);
    const firma = hmacSha256(segreto, `${timestamp}\n${sha256(corpo)}`);

    await fetch(urlCsAvvisa(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-deluxy-timestamp": timestamp,
        "x-deluxy-signature": `sha256=${firma}`,
        "x-deluxy-evento": "richiesta.creata",
      },
      body: corpo,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // rete giù, segreto illeggibile: la richiesta è comunque in coda, e chi
    // vuole la vede nella pagina — l'avviso è una comodità, non la verità
  }
}
