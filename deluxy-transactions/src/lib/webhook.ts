import { prisma } from "./db";
import { decifra, hmacSha256, sha256 } from "./crypto";

// Notifica all'app che ha chiesto il pagamento quando la richiesta cambia
// stato, così non deve stare a interrogare in continuazione.
//
// La notifica è firmata con lo STESSO segreto HMAC della chiave API di quella
// app: chi riceve può verificare che arriva davvero da qui. Chi non verifica la
// firma non deve fidarsi del contenuto — vale anche al contrario.
//
// Non blocca mai il flusso: un webhook che non risponde non deve impedire
// un'approvazione. Chi vuole la certezza legge lo stato dall'API.

export async function notificaOrigine(richiestaId: string): Promise<void> {
  try {
    const r = await prisma.richiesta.findUnique({
      where: { id: richiestaId },
      include: { chiaveApi: true },
    });
    if (!r?.urlNotifica || !r.chiaveApi) return;
    // Solo https: una notifica con dentro importo e beneficiario non viaggia in chiaro.
    if (!/^https:\/\//i.test(r.urlNotifica)) return;

    const corpo = JSON.stringify({
      riferimento: r.riferimento,
      riferimentoEsterno: r.riferimentoEsterno,
      stato: r.stato,
      importoCent: r.importoCent,
      valuta: r.valuta,
      decisaIl: r.decisaIl?.toISOString() ?? null,
      pagataIl: r.pagataIl?.toISOString() ?? null,
    });
    const timestamp = String(Date.now());
    const segreto = decifra(r.chiaveApi.segretoHmac);
    const firma = hmacSha256(segreto, `${timestamp}\n${sha256(corpo)}`);

    await fetch(r.urlNotifica, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-deluxy-timestamp": timestamp,
        "x-deluxy-signature": `sha256=${firma}`,
        "x-deluxy-evento": "richiesta.stato",
      },
      body: corpo,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // rete, url morto, segreto illeggibile: si prosegue in silenzio
  }
}
