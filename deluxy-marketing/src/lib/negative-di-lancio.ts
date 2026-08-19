import { prisma } from "@/lib/db";
import { accodaOperazione } from "@/lib/operazioni";
import { registra } from "@/lib/registro";
import { testoKeywordPulito } from "@/lib/dominio";

// Le parole da escludere di una campagna appena nata: si mettono in coda
// QUANDO GOOGLE CONFERMA che la campagna esiste, non prima.
//
// ⚠️ PERCHÉ NON NEL CARICAMENTO. Le altre cose del lancio (budget, strategia,
// lingua, località, keyword, annuncio) viaggiano nel bulk upload, che però
// **non risponde**: se una riga viene rifiutata l'errore resta nel registro
// caricamenti dentro Google Ads e non torna mai indietro. Per una keyword in
// più è un fastidio; per una NEGATIVA è il guasto peggiore che ci sia — la
// campagna erogherebbe proprio sulle ricerche che qualcuno aveva deciso di
// escludere, e nessuno se ne accorgerebbe. Lo script invece sa aggiungere le
// negative con `createNegativeKeyword` e **rileggerle** (`negativaPresente`,
// dall'08/08/2026): è l'unica strada su cui l'esito si può credere.
//
// ⚠️ PERCHÉ NON SUBITO. `createNegativeKeyword` vuole la campagna in mano, e
// il bulk upload è asincrono: nell'istante in cui lo script manda il
// caricamento, la campagna su Google non esiste ancora. L'unico momento in cui
// si sa che esiste è quando l'anagrafica la nomina — ed è da lì che si parte.
//
// ⚠️ NASCONO «DA APPROVARE», non approvate. Chi ha approvato il lancio ha
// approvato anche queste, ma approvarle da sole vorrebbe dire che l'app scrive
// su Google senza che una persona abbia guardato la riga: è la rete che regge
// tutto il resto e non la si buca per comodità. Si approvano in blocco.

/**
 * Mette in coda le negative dei lanci che Google ha appena confermato.
 *
 * Va chiamata dopo aver salvato l'anagrafica, con gli id delle campagne che in
 * questo giro hanno ricevuto per la prima volta un `idEsterno`. Non fa niente
 * se non c'è niente da fare — ed è il caso quasi sempre.
 */
export async function accodaNegativeDiLancio(campagneConfermate: string[]): Promise<number> {
  if (campagneConfermate.length === 0) return 0;

  const lanci = await prisma.operazioneAdv.findMany({
    where: {
      tipo: "nuova_campagna",
      stato: "eseguita",
      campagnaId: { in: campagneConfermate },
    },
    select: { id: true, campagnaId: true, account: true, bersaglio: true, parametri: true, approvataDa: true },
  });
  if (lanci.length === 0) return 0;

  let accodate = 0;
  for (const l of lanci) {
    let negative: string[] = [];
    try {
      const p = JSON.parse(l.parametri ?? "{}") as { negative?: unknown };
      negative = Array.isArray(p.negative) ? p.negative.map((n) => String(n).trim()).filter(Boolean) : [];
    } catch {
      negative = [];
    }
    if (negative.length === 0) continue;

    // ⚠️ Non rifarle se ci sono già: questa funzione gira a ogni anagrafica, e
    // una campagna resta «appena confermata» solo il primo giro — ma un
    // ripristino o una rilettura potrebbero riportarci qui. Il controllo è sul
    // testo, dentro la stessa campagna.
    const esistenti = await prisma.operazioneAdv.findMany({
      where: { tipo: "negativa", campagnaId: l.campagnaId! },
      select: { parametri: true },
    });
    const gia = new Set<string>();
    for (const e of esistenti) {
      try {
        const p = JSON.parse(e.parametri ?? "{}") as { testo?: unknown };
        if (typeof p.testo === "string") gia.add(p.testo.trim().toLowerCase());
      } catch {
        // parametri illeggibili: meglio contarla come assente e rischiare un
        // doppione visibile in coda che saltare un'esclusione decisa.
      }
    }

    const daFare = negative.filter((n) => !gia.has(n.toLowerCase()));
    if (daFare.length === 0) continue;

    // L'id di piattaforma della campagna: adesso c'è (è la condizione che ci
    // ha portati qui) e allo script risparmia la ricerca per nome.
    const campagna = await prisma.campagna.findUnique({
      where: { id: l.campagnaId! },
      select: { idEsterno: true, canale: true },
    });

    for (const grezzo of daFare) {
      const testo = testoKeywordPulito(grezzo);
      if (!testo) continue;
      await accodaOperazione({
        data: {
          tipo: "negativa",
          canale: campagna?.canale ?? "google_ads",
          account: l.account,
          bersaglio: l.bersaglio,
          idEsterno: campagna?.idEsterno ?? null,
          // ⚠️ Sempre ESATTA. È la corrispondenza che blocca solo quella
          // ricerca: una negativa generica può spegnere mezza campagna, e qui
          // nessuno sta guardando le singole parole una per una.
          parametri: JSON.stringify({ testo, corrispondenza: "exact" }),
          motivo:
            `Parte del lancio della campagna «${l.bersaglio}»` +
            `${l.approvataDa ? `, approvato da ${l.approvataDa}` : ""}: Google ha confermato che la campagna esiste, ` +
            "quindi adesso le esclusioni si possono aggiungere davvero.",
          // ⚠️ L0, come TUTTE le negative altrove nell'app, e non è cosmetico:
          // `MODIFICHE_CHE_PESANO` sono L1/L2/L3, quindi una negativa marcata
          // L1 farebbe scattare il blackout di 72 ore sulla campagna — sedici
          // volte di fila. È lo stesso difetto corretto il 04/08, quando una
          // sola negativa congelava la campagna per tre giorni.
          livello: "L0",
          prima: "assente",
          campagnaId: l.campagnaId,
        },
      });
      accodate++;
    }

    await registra({
      autore: "sistema",
      tipo: "creazione",
      entita: "operazione",
      entitaId: l.id,
      titolo: `In coda: ${daFare.length} parole da escludere per «${l.bersaglio}»`,
      dettaglio:
        "Google ha confermato la campagna con l'anagrafica: le negative del lancio diventano operazioni " +
        "da approvare. Non sono partite col caricamento apposta — il bulk upload non dice se le accetta, " +
        "e una negativa che sparisce in silenzio fa erogare la campagna dove non doveva.",
    });
  }
  return accodate;
}
