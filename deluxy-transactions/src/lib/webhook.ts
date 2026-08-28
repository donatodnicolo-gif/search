import { prisma } from "./db";
import { decifra, hmacSha256, sha256 } from "./crypto";

// Notifica all'app che ha chiesto il pagamento quando la richiesta cambia
// stato, così non deve stare a interrogare in continuazione.
//
// Dal 28/08/2026 (giuria) la forma è l'OUTBOX: ogni cambio di stato scrive una
// riga NotificaInvio; il primo tentativo parte subito, i successivi (30 s e
// 5 min dopo) li fa il cron /api/cron/notifiche. Ogni tentativo si RIFIRMA con
// timestamp fresco: il ricevente accetta ±5 minuti, un retry con la firma
// vecchia morirebbe sulla finestra. Dopo 3 tentativi la riga resta «fallita» e
// si rilancia a mano dal dettaglio della richiesta.
//
// La notifica è firmata con lo STESSO segreto HMAC della chiave API di quella
// app: chi riceve può verificare che arriva davvero da qui. Chi non verifica la
// firma non deve fidarsi del contenuto — vale anche al contrario.
//
// Non blocca mai il flusso: un webhook che non risponde non deve impedire
// un'approvazione. Chi vuole la certezza legge lo stato dall'API — e il pull
// di recupero è GET /api/v1/richieste?aggiornateDa= (Standard §7.3.5).

const TENTATIVI_MASSIMI = 3;
// Attese prima del 2° e del 3° tentativo.
const ATTESE_MS = [30_000, 300_000];

/** Dove va la notifica: override per-richiesta, altrimenti default della chiave. */
function urlDestinazione(r: { urlNotifica: string | null; chiaveApi: { urlNotifica: string } | null }): string | null {
  const url = r.urlNotifica || r.chiaveApi?.urlNotifica || "";
  // Solo https: una notifica con dentro importo e beneficiario non viaggia in chiaro.
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

/**
 * Registra la notifica nell'outbox e prova subito a spedirla. Da chiamare dopo
 * ogni cambio di stato visibile da fuori. Non solleva mai.
 */
export async function notificaOrigine(richiestaId: string, extra?: { motivo?: string }): Promise<void> {
  try {
    const r = await prisma.richiesta.findUnique({
      where: { id: richiestaId },
      select: { id: true, urlNotifica: true, chiaveApiId: true, chiaveApi: { select: { urlNotifica: true } } },
    });
    if (!r?.chiaveApiId) return; // richiesta manuale: nessuno da avvisare
    if (!urlDestinazione({ urlNotifica: r.urlNotifica, chiaveApi: r.chiaveApi })) return;

    const notifica = await prisma.notificaInvio.create({
      data: { richiestaId, motivo: extra?.motivo ?? null, prossimoTentativo: new Date() },
    });
    await spedisciNotifica(notifica.id);
  } catch {
    // outbox non scrivibile: il paracadute resta il pull dell'app chiamante
  }
}

/**
 * Un tentativo di spedizione. Costruisce il payload leggendo lo stato CORRENTE
 * (non quello di quando è nata la riga: se nel frattempo la richiesta è andata
 * avanti, meglio l'esito vero) e firma con timestamp fresco.
 */
export async function spedisciNotifica(notificaId: string): Promise<boolean> {
  const notifica = await prisma.notificaInvio.findUnique({ where: { id: notificaId } });
  if (!notifica || notifica.stato === "inviata") return true;

  const r = await prisma.richiesta.findUnique({
    where: { id: notifica.richiestaId },
    include: {
      chiaveApi: true,
      allegati: { select: { id: true, nome: true, tipo: true, byte: true, ruolo: true, sha256: true } },
    },
  });

  const fallisci = async (esito: string) => {
    const tentativi = notifica.tentativi + 1;
    const esaurita = tentativi >= TENTATIVI_MASSIMI;
    await prisma.notificaInvio
      .update({
        where: { id: notificaId },
        data: {
          tentativi,
          ultimoEsito: esito.slice(0, 200),
          stato: esaurita ? "fallita" : "da_inviare",
          prossimoTentativo: esaurita ? null : new Date(Date.now() + (ATTESE_MS[tentativi - 1] ?? 300_000)),
        },
      })
      .catch(() => {});
    return false;
  };

  if (!r?.chiaveApi) return fallisci("chiave api mancante");
  const url = urlDestinazione({ urlNotifica: r.urlNotifica, chiaveApi: r.chiaveApi });
  if (!url) return fallisci("nessun url di notifica https");

  try {
    const corpo = JSON.stringify({
      riferimento: r.riferimento,
      riferimentoEsterno: r.riferimentoEsterno,
      stato: r.stato,
      importoCent: r.importoCent,
      valuta: r.valuta,
      metodo: r.metodo,
      decisaIl: r.decisaIl?.toISOString() ?? null,
      pagataIl: r.pagataIl?.toISOString() ?? null,
      // Come è uscito il denaro: "distinta", "qonto", oppure "fuori_app" —
      // pagata altrove e registrata qui a mano. Chi riceve deve poter
      // distinguere un pagamento provato da uno dichiarato: campo aggiunto,
      // non sostituito, così chi legge solo `stato` continua a funzionare.
      pagatoCon: r.pagatoCon ?? null,
      // Il perché, quando c'è: annullamenti e chiusure a mano lo portano con sé,
      // altrimenti dall'altra parte resta un cambio di stato senza spiegazione.
      motivo: notifica.motivo ?? null,
      // SOLO i metadati: i byte si scaricano con la GET firmata
      // /api/v1/richieste/<rif>/allegati/<id>, mai dal webhook. Lo sha256
      // permette a chi scarica di verificare che il file sia quello annunciato.
      allegati: r.allegati.map((a) => ({
        id: a.id,
        nome: a.nome,
        tipo: a.tipo,
        byte: a.byte,
        ruolo: a.ruolo,
        sha256: a.sha256,
      })),
    });
    const timestamp = String(Date.now());
    const segreto = decifra(r.chiaveApi.segretoHmac);
    const firma = hmacSha256(segreto, `${timestamp}\n${sha256(corpo)}`);

    const risposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-deluxy-timestamp": timestamp,
        "x-deluxy-signature": `sha256=${firma}`,
        "x-deluxy-evento": notifica.evento,
      },
      body: corpo,
      signal: AbortSignal.timeout(4000),
    });
    if (!risposta.ok) return fallisci(`http ${risposta.status}`);

    await prisma.notificaInvio.update({
      where: { id: notificaId },
      data: { stato: "inviata", inviataIl: new Date(), tentativi: notifica.tentativi + 1, ultimoEsito: `http ${risposta.status}` },
    });
    return true;
  } catch (e) {
    return fallisci(e instanceof Error ? e.message : "errore di rete");
  }
}

/** Il giro del cron: riprova ciò che aspetta. Ritorna quante ha processate. */
export async function processaNotificheInSospeso(limite = 20): Promise<{ processate: number; inviate: number }> {
  const inAttesa = await prisma.notificaInvio.findMany({
    where: { stato: "da_inviare", prossimoTentativo: { lte: new Date() } },
    orderBy: { creataIl: "asc" },
    take: limite,
    select: { id: true },
  });
  let inviate = 0;
  for (const n of inAttesa) {
    if (await spedisciNotifica(n.id)) inviate++;
  }
  return { processate: inAttesa.length, inviate };
}

/** Rilancio manuale dal dettaglio: azzera il conto dei tentativi. */
export async function rilanciaNotifica(notificaId: string): Promise<boolean> {
  await prisma.notificaInvio.update({
    where: { id: notificaId },
    data: { stato: "da_inviare", tentativi: 0, prossimoTentativo: new Date() },
  });
  return spedisciNotifica(notificaId);
}
