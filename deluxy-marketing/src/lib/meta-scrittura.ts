// Scrivere su Meta: l'esecuzione delle operazioni GIÀ APPROVATE nell'app.
//
// ⚠️ **Perché questo file è diverso da tutto il resto del connettore Meta.**
// Fin qui `lib/meta.ts` legge soltanto. Qui si spende: una chiamata sbagliata
// accende una campagna, ne raddoppia il budget o la spegne. Tre cose che
// valgono soldi veri, e nessuna si annulla da sola.
//
// ⚠️ **E la differenza con Google è di natura, non di dettaglio.** Su Google
// l'esecuzione la fa lo *script dentro Google Ads*: il segreto non esce mai
// dall'account. Qui la fa **l'app**, quindi un token con `ads_management` —
// cioè col potere di far uscire denaro — vive come variabile d'ambiente su
// Vercel. È il motivo per cui la catena coda → approvazione a mano → esito
// non è una formalità: è l'unica cosa che sta fra un errore e la spesa.
//
// STATO: **spento finché il permesso non c'è.** Oggi il token del Business
// Manager ha `ads_read`; `ads_management` va chiesto su due fronti separati —
// lo scope del token E il permesso sull'asset in Business Manager. Finché
// manca, `metaPuoScrivere()` è falso e da qui non parte niente: non si prova
// e basta, si dice che non si può.

const VERSIONE = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSIONE}`;

function token(): string | null {
  const t = process.env.META_ACCESS_TOKEN;
  return t && t.trim().length > 20 ? t.trim() : null;
}

/**
 * Se l'app può scrivere su Meta. Non basta avere un token: serve che quel
 * token abbia `ads_management`.
 *
 * ⚠️ **Il permesso non si deduce, si chiede a Meta.** Un token con solo
 * `ads_read` è indistinguibile da uno completo finché non si prova a
 * scrivere — e «provare a scrivere» per scoprirlo vorrebbe dire fare la
 * modifica. Per questo esiste `/me/permissions`, che lo dice senza toccare
 * niente. La risposta si tiene in memoria per il giro corrente: è una
 * domanda sola, non una per operazione.
 */
export async function metaPuoScrivere(): Promise<{ puo: boolean; perche: string }> {
  const t = token();
  if (!t) {
    return {
      puo: false,
      perche:
        "META_ACCESS_TOKEN non impostato: senza token l'app non può né leggere né scrivere.",
    };
  }
  // La variabile è una sicura in più: anche col permesso, la scrittura resta
  // spenta finché qualcuno non la accende di proposito.
  if (process.env.META_SCRITTURA !== "attiva") {
    return {
      puo: false,
      perche:
        "Scrittura su Meta disattivata: manca META_SCRITTURA=attiva fra le variabili d'ambiente. È un interruttore voluto — il permesso da solo non basta ad accendere la spesa.",
    };
  }
  try {
    const r = await fetch(`${BASE}/me/permissions?access_token=${encodeURIComponent(t)}`, {
      cache: "no-store",
    });
    const dati = (await r.json()) as { data?: { permission: string; status: string }[]; error?: { message?: string } };
    if (dati.error) {
      return { puo: false, perche: `Meta non risponde sui permessi: ${dati.error.message ?? "errore"}` };
    }
    const ok = (dati.data ?? []).some(
      (p) => p.permission === "ads_management" && p.status === "granted"
    );
    return ok
      ? { puo: true, perche: "Token con ads_management concesso." }
      : {
          puo: false,
          perche:
            "Il token ha ads_read ma non ads_management: si rigenera chiedendo quello scope, E in Business Manager i tre account vanno assegnati all'utente di sistema con «Gestisci campagne», non «Visualizza prestazioni». Sono due cose separate: farne una sola non basta.",
        };
  } catch (e) {
    return { puo: false, perche: `Non riesco a chiedere i permessi a Meta: ${String(e)}` };
  }
}

// ⚠️ Le operazioni che su Meta ESISTONO. Non è un sottoinsieme per prudenza:
// Meta non ha keyword né negative, quindi `pausa_keyword`, `attiva_keyword` e
// `negativa` lì non vogliono dire niente. Offrirle sarebbe promettere una cosa
// che la piattaforma non sa fare.
export const OPERAZIONI_META = [
  "pausa_campagna",
  "attiva_campagna",
  "pausa_gruppo", // su Meta è l'ad set
  "attiva_gruppo",
  "budget",
] as const;

export type EsitoScrittura = { riuscita: boolean; dettaglio: string; prima?: string; dopo?: string };

/** Una POST alla Graph API, con l'errore riportato per quello che dice. */
async function scrivi(percorso: string, campi: Record<string, string>): Promise<EsitoScrittura> {
  const t = token();
  if (!t) return { riuscita: false, dettaglio: "token assente" };
  const corpo = new URLSearchParams({ ...campi, access_token: t });
  try {
    const r = await fetch(`${BASE}/${percorso}`, { method: "POST", body: corpo, cache: "no-store" });
    const dati = (await r.json()) as { success?: boolean; id?: string; error?: { message?: string; code?: number } };
    if (dati.error) {
      // Gli stessi due guasti di sempre, e vanno distinti anche qui: 190 è il
      // token, 200 è il permesso sull'asset. Curarli allo stesso modo fa
      // perdere giorni.
      const c = dati.error.code;
      const spiega =
        c === 190
          ? " — è il TOKEN (scaduto o senza scope): va rigenerato."
          : c === 200
            ? " — è il PERMESSO sull'asset: si sistema in Business Manager, non toccando il token."
            : "";
      return { riuscita: false, dettaglio: `${dati.error.message ?? "errore Meta"}${spiega}` };
    }
    return { riuscita: true, dettaglio: "applicata su Meta" };
  } catch (e) {
    return { riuscita: false, dettaglio: `chiamata fallita: ${String(e)}` };
  }
}

/**
 * Rilegge un oggetto Meta DOPO averlo scritto.
 *
 * ⚠️ È la lezione già pagata tre volte su Google: una scrittura che non si
 * rilegge fa registrare all'app un successo che potrebbe non essere avvenuto,
 * e nessuno lo saprebbe mai. Qui la POST torna `{success:true}`, che è più di
 * quanto dica `createNegativeKeyword` — ma «la chiamata è stata accettata» e
 * «il valore adesso è quello» restano due frasi diverse: su Meta un budget
 * può finire sul livello sbagliato, e uno stato può essere superato da quello
 * del genitore.
 *
 * Torna `null` quando la rilettura non riesce: e `null` NON è un errore, è un
 * «non lo so» — che si dichiara invece di trasformarlo in un fallimento.
 */
async function rileggi(id: string, campi: string): Promise<Record<string, unknown> | null> {
  const t = token();
  if (!t) return null;
  try {
    const r = await fetch(
      `${BASE}/${id}?fields=${encodeURIComponent(campi)}&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store" }
    );
    const dati = (await r.json()) as Record<string, unknown> & { error?: unknown };
    if (dati.error) return null;
    return dati;
  } catch {
    return null;
  }
}

/** Mette in pausa o riattiva una campagna o un ad set: stessa chiamata. */
export async function cambiaStatoMeta(
  idEsterno: string,
  acceso: boolean,
  cosa: "campagna" | "gruppo"
): Promise<EsitoScrittura> {
  const stato = acceso ? "ACTIVE" : "PAUSED";
  const esito = await scrivi(idEsterno, { status: stato });
  if (!esito.riuscita) return esito;

  // ⚠️ `effective_status` è quello che conta davvero: una campagna può
  // risultare ACTIVE e non erogare perché il genitore è fermo o l'account è
  // sospeso. Si riportano tutti e due quando non coincidono, invece di
  // scegliere quello che fa più bella figura.
  const letto = await rileggi(idEsterno, "status,effective_status");
  const ora = letto ? String(letto.status ?? "") : null;
  const davvero = letto ? String(letto.effective_status ?? "") : null;
  const nota =
    ora == null
      ? " (non ho potuto rileggere per confermare)"
      : ora === stato
        ? davvero && davvero !== stato
          ? ` (confermato rileggendo, ma Meta lo dà come ${davvero}: c'è qualcosa sopra che lo tiene fermo)`
          : " (confermato rileggendo)"
        : ` - ATTENZIONE: rileggendo, Meta lo riporta ancora come ${ora}`;

  return {
    riuscita: true,
    dettaglio: `${cosa === "campagna" ? "campagna" : "ad set"} → ${stato} su Meta${nota}`,
    dopo: acceso ? "attiva" : "in pausa",
  };
}

/**
 * Cambia il budget giornaliero.
 *
 * ⚠️ **Due trappole, ognuna delle quali costa denaro.**
 *
 * 1. `daily_budget` va in **CENTESIMI** della valuta dell'account, non in
 *    euro: mandare `25` vuol dire 0,25 €, mandare `2500` vuol dire 25 €.
 *    Sbagliare per difetto spegne la campagna, per eccesso la fa correre.
 *    Qui si converte in un punto solo e si arrotonda all'intero, perché Meta
 *    rifiuta i decimali.
 *
 * 2. Il budget su Meta può stare sulla **campagna** (CBO) oppure su ogni
 *    **ad set**. Scriverlo sul livello sbagliato non fa niente — o, peggio,
 *    ne aggiunge uno secondo che convive col primo. Chi chiama deve dire su
 *    quale livello sta agendo: qui non si indovina.
 */
export async function budgetMeta(idEsterno: string, euroAlGiorno: number): Promise<EsitoScrittura> {
  if (!(euroAlGiorno > 0)) return { riuscita: false, dettaglio: `budget non valido: ${euroAlGiorno}` };
  const centesimi = Math.round(euroAlGiorno * 100);
  const esito = await scrivi(idEsterno, { daily_budget: String(centesimi) });
  if (!esito.riuscita) return esito;

  // ⚠️ Si rilegge il valore, non ci si fida del `success`. Il budget su Meta
  // può stare sulla campagna (CBO) o sugli ad set: scriverlo dove non vive
  // può essere accettato e non cambiare niente, e sarebbe la peggiore delle
  // risposte — «fatto» su una modifica che non c'è.
  const letto = await rileggi(idEsterno, "daily_budget");
  const suGoogleCent = letto?.daily_budget != null ? Number(letto.daily_budget) : null;
  const nota =
    suGoogleCent == null
      ? " - non ho potuto rileggere il budget per confermarlo"
      : suGoogleCent === centesimi
        ? " (confermato rileggendo)"
        : ` - ATTENZIONE: rileggendo, Meta riporta ${(suGoogleCent / 100).toFixed(2)} €/g. Il budget potrebbe stare sugli ad set e non sulla campagna.`;

  return {
    riuscita: true,
    dettaglio: `budget → ${euroAlGiorno.toFixed(2)} €/g (${centesimi} centesimi, come li vuole Meta)${nota}`,
    dopo: `${euroAlGiorno.toFixed(2)} €/g`,
  };
}

/**
 * Esegue le operazioni Meta **già approvate a mano**, una alla volta.
 *
 * È il gemello di `eseguiOperazioni` dello script Google, con una differenza
 * che non si può nascondere: là il motore gira *dentro* Google Ads, qui gira
 * dentro l'app. Quindi qui valgono le stesse regole, scritte a mano:
 *  · si prendono SOLO le operazioni in stato `approvata` — mai le in_attesa;
 *  · si esegue una alla volta e si riferisce l'esito **subito dopo ognuna**;
 *  · se l'esito non si riesce a registrare **ci si ferma**: rifarla al giro
 *    dopo vorrebbe dire una seconda modifica sulla stessa campagna.
 *
 * Non tocca niente finché `metaPuoScrivere()` non dice di sì.
 */
export async function eseguiOperazioniMeta(opzioni: { limite?: number } = {}) {
  const { prisma } = await import("./db");
  const permesso = await metaPuoScrivere();
  if (!permesso.puo) {
    return { eseguite: 0, fallite: 0, saltate: 0, nota: permesso.perche, spento: true };
  }

  const operazioni = await prisma.operazioneAdv.findMany({
    where: { canale: "meta_ads", stato: "approvata" },
    orderBy: { approvataIl: "asc" },
    take: opzioni.limite ?? 10,
  });
  if (operazioni.length === 0) {
    return { eseguite: 0, fallite: 0, saltate: 0, nota: "niente di approvato in coda", spento: false };
  }

  let eseguite = 0;
  let fallite = 0;
  let saltate = 0;

  for (const op of operazioni) {
    // ⚠️ Senza id di piattaforma non si tocca niente: cercare «la campagna che
    // si chiama così» su Meta significa poter colpire un omonimo di un altro
    // account. Meglio fermarsi e dirlo.
    if (!op.idEsterno) {
      saltate++;
      continue;
    }
    if (!(OPERAZIONI_META as readonly string[]).includes(op.tipo)) {
      // Su Meta non esiste: si segna fallita col motivo, non si prova.
      fallite++;
      await riferisci(op.id, false, `«${op.tipo}» non esiste su Meta: la piattaforma non ha keyword né negative.`);
      continue;
    }

    let esito: EsitoScrittura;
    if (op.tipo === "pausa_campagna") esito = await cambiaStatoMeta(op.idEsterno, false, "campagna");
    else if (op.tipo === "attiva_campagna") esito = await cambiaStatoMeta(op.idEsterno, true, "campagna");
    else if (op.tipo === "pausa_gruppo") esito = await cambiaStatoMeta(op.idEsterno, false, "gruppo");
    else if (op.tipo === "attiva_gruppo") esito = await cambiaStatoMeta(op.idEsterno, true, "gruppo");
    else {
      const p = op.parametri ? (JSON.parse(op.parametri) as { budget?: number }) : {};
      esito = await budgetMeta(op.idEsterno, Number(p.budget));
    }

    if (esito.riuscita) eseguite++;
    else fallite++;
    // Se l'app non registra l'esito ci si ferma: è la stessa regola dello
    // script Google, e per lo stesso motivo.
    const registrato = await riferisci(op.id, esito.riuscita, esito.dettaglio, esito.dopo);
    if (!registrato) break;
  }

  return { eseguite, fallite, saltate, nota: null, spento: false };
}

/**
 * Registra l'esito. Fa le stesse cose che fa l'endpoint usato dallo script
 * Google — e in particolare **crea la `Modifica`**, che non è burocrazia: è
 * quella riga a far partire il blackout e a lasciare il paper-trail. Senza,
 * un'operazione eseguita su Meta sarebbe invisibile al change control, e la
 * campagna risulterebbe «mai toccata» il giorno dopo.
 */
async function riferisci(id: string, riuscita: boolean, dettaglio: string, dopo?: string) {
  const { prisma } = await import("./db");
  try {
    const op = await prisma.operazioneAdv.update({
      where: { id },
      data: {
        stato: riuscita ? "eseguita" : "fallita",
        eseguitaIl: new Date(),
        esito: dopo ? `${dettaglio} (${dopo})` : dettaglio,
      },
    });
    if (riuscita && op.campagnaId) {
      await prisma.modifica.create({
        data: {
          campagnaId: op.campagnaId,
          livello: op.livello,
          descrizione: `${op.tipo} su ${op.bersaglio} (eseguita su Meta dall'app)`,
          prima: op.prima,
          dopo: dopo ?? null,
          autore: "meta",
        },
      });
      // Lo stato dell'app segue quello che è appena successo davvero.
      if (op.tipo === "pausa_campagna" || op.tipo === "attiva_campagna") {
        await prisma.campagna.update({
          where: { id: op.campagnaId },
          data: {
            stato: op.tipo === "pausa_campagna" ? "in_pausa" : "attiva",
            statoPiattaforma: op.tipo === "pausa_campagna" ? "PAUSED" : "ENABLED",
          },
        });
      }
    }
    if (riuscita && op.gruppoId && (op.tipo === "pausa_gruppo" || op.tipo === "attiva_gruppo")) {
      const fermo = op.tipo === "pausa_gruppo";
      await prisma.gruppo.update({
        where: { id: op.gruppoId },
        data: { stato: fermo ? "in_pausa" : "attivo", statoPiattaforma: fermo ? "PAUSED" : "ENABLED" },
      });
    }
    return true;
  } catch {
    return false;
  }
}
