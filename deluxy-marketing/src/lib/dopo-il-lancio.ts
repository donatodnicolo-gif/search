import { prisma } from "@/lib/db";
import { accodaOperazione } from "@/lib/operazioni";
import { registra } from "@/lib/registro";
import { testoKeywordPulito } from "@/lib/dominio";

// IL SECONDO TEMPO DEL LANCIO: cosa si mette in coda QUANDO GOOGLE CONFERMA
// che la campagna esiste — gruppo, keyword, annuncio, località e negative.
//
// ⚠️⚠️ PERCHÉ IL LANCIO È IN DUE TEMPI. Il registro caricamenti del 19/08/2026
// l'ha dimostrato, e sono due guasti diversi nello stesso file:
//
//   · le righe di gruppo/keyword/annuncio → «The entity does not exist for
//     Campaign» **mentre la campagna veniva creata nello stesso caricamento**.
//     Le righe figlie non si agganciano a un'entità nata nello stesso giro.
//   · le righe di località (Campaign + Location ID) → «Missing value in
//     Campaign type / Budget / EU political ads»: Google non le ha lette come
//     località ma come definizioni di campagna monche. Quella forma di riga,
//     in un caricamento da Scripts, non esiste.
//
// Quindi il bulk upload fa **solo la campagna**, che è l'unica cosa senza
// un'API. Tutto il resto passa dai costruttori veri dello script
// (`newAdGroupBuilder`, `newKeywordBuilder`, `responsiveSearchAdBuilder`,
// `addLocation`, `createNegativeKeyword`), dove ogni operazione dice
// `isSuccessful()`: si sa com'è andata invece di sperarlo.
//
// ⚠️ E LE NEGATIVE NON SAREBBERO POTUTE ANDARE NEL CARICAMENTO COMUNQUE. Il
// bulk upload non risponde: per una keyword in più è un fastidio, per una
// NEGATIVA è il guasto peggiore che ci sia — la campagna erogherebbe proprio
// sulle ricerche che qualcuno aveva deciso di escludere, e nessuno se ne
// accorgerebbe.
//
// ⚠️ IL MOMENTO. Tutti questi costruttori vogliono la campagna **in mano**, e
// il caricamento è asincrono: nell'istante in cui lo script lo manda, su Google
// la campagna non esiste ancora. L'unico momento in cui si sa che esiste è
// quando l'anagrafica la nomina — ed è da lì che si parte.
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

/**
 * Mette in coda «Completa la campagna»: gruppo, keyword, annuncio e località.
 *
 * Una sola operazione per lancio, non una per pezzo: sono le parti di un'unica
 * decisione già approvata (il lancio), e spezzarle in venti righe da approvare
 * vorrebbe dire far ripetere venti volte una scelta fatta una volta sola. Le
 * negative invece restano una per riga, perché ognuna esclude qualcosa di
 * diverso e vale la pena poterle guardare — o togliere — a una a una.
 *
 * ⚠️ È ripetibile dal lato dello script: gruppo, keyword e annuncio già
 * presenti non si rifanno. Quindi rimetterla in coda dopo un errore parziale
 * non crea doppioni.
 */
export async function accodaCompletamentoLancio(campagneConfermate: string[]): Promise<number> {
  if (campagneConfermate.length === 0) return 0;

  const lanci = await prisma.operazioneAdv.findMany({
    where: { tipo: "nuova_campagna", stato: "eseguita", campagnaId: { in: campagneConfermate } },
    select: { id: true, campagnaId: true, account: true, bersaglio: true, parametri: true },
  });
  if (lanci.length === 0) return 0;

  let accodate = 0;
  for (const l of lanci) {
    // Se ce n'è già una, viva o eseguita, non se ne fa un'altra.
    const gia = await prisma.operazioneAdv.count({
      where: { tipo: "completa_campagna", campagnaId: l.campagnaId!, stato: { in: ["in_attesa", "approvata", "eseguita"] } },
    });
    if (gia > 0) continue;

    let p: Record<string, unknown> = {};
    try {
      p = JSON.parse(l.parametri ?? "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    const keywords = Array.isArray(p.keywords) ? p.keywords : [];
    const titoli = Array.isArray(p.titoli) ? p.titoli : [];
    const localitaId = Array.isArray(p.localitaId) ? p.localitaId : [];
    const localitaNomi = Array.isArray(p.localitaNomi) ? p.localitaNomi : [];
    // Niente da completare: nessuna operazione inutile in coda.
    if (keywords.length === 0 && titoli.length === 0 && localitaId.length === 0 && localitaNomi.length === 0) continue;

    const campagna = await prisma.campagna.findUnique({
      where: { id: l.campagnaId! },
      select: { idEsterno: true },
    });

    await accodaOperazione({
      data: {
        tipo: "completa_campagna",
        canale: "google_ads",
        account: l.account,
        bersaglio: l.bersaglio,
        idEsterno: campagna?.idEsterno ?? null,
        parametri: JSON.stringify({
          gruppo: p.gruppo,
          keywords,
          titoli,
          descrizioni: Array.isArray(p.descrizioni) ? p.descrizioni : [],
          finalUrl: p.finalUrl,
          localitaId,
          localitaNomi,
        }),
        motivo:
          `Google ha confermato la campagna «${l.bersaglio}»: adesso si possono aggiungere gruppo, ` +
          "keyword, annuncio e località. Non erano partiti col caricamento perché le righe figlie non " +
          "si agganciano a una campagna nata nello stesso caricamento — è quello che il registro " +
          "caricamenti ha mostrato il 19/08.",
        // L2 come il lancio: è la stessa decisione, nella sua seconda metà.
        livello: "L2",
        prima: "campagna senza gruppo",
        campagnaId: l.campagnaId,
      },
    });
    accodate++;

    await registra({
      autore: "sistema",
      tipo: "creazione",
      entita: "operazione",
      entitaId: l.id,
      titolo: `In coda: completa la campagna «${l.bersaglio}»`,
      dettaglio:
        `${keywords.length} keyword · ${titoli.length ? "1 annuncio RSA · " : ""}` +
        `${localitaId.length + localitaNomi.length} località. ` +
        "Il caricamento crea solo la campagna; il resto lo fa lo script con l'API, dove ogni " +
        "operazione dice se è riuscita.",
    });
  }
  return accodate;
}
