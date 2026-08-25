import { prisma } from "@/lib/db";
import { confermeOperazioni } from "@/lib/conferme-operazioni";
import { scriviInOut } from "@/lib/drive-scrittura";
import { ETICHETTA_BRAND } from "@/lib/dominio";

// Il DEPOSITO nel ponte: l'app scrive su Drive quello che ha fatto.
//
// ⚠️⚠️ PERCHÉ ESISTE (24/08/2026). Il ponte era stato costruito tutto il 27/07 —
// protocollo, regole append-only, scrittore, diagnosi — e **non era collegato a
// niente**: `scriviInOut()` aveva un solo chiamante, il bottone «Prova
// scrittura». Per un mese l'app ha eseguito operazioni su Google e Meta senza
// depositare una riga, e chi legge la cartella se n'è accorto prima di noi
// («su Drive l'app non ha messo nessun file su quello che è stato fatto»).
// Un ponte costruito e non percorso è indistinguibile da un ponte rotto.
//
// IL FORMATO NON È INVENTATO: è il §2 di `ads/Definitivi/MODELLO Ponte App
// Azioni.md`, il documento che governa lo scambio. Lì l'APPEND del log azioni è
// marcato **OBBLIGATORIO lo stesso giorno**, e il custode lo consolida nello
// sweep di inizio sessione. Un APPEND in un formato libero non lo consoliderebbe
// nessuno: sarebbe peggio di nessun APPEND, perché darebbe l'impressione che il
// ponte funzioni.
//
// ⚠️ APPEND-ONLY: `scriviInOut` rifiuta un nome che esiste già. Per questo il
// nome porta data **e ora** (`[AAAA-MM-GG HHMM]`), come chiede il modello: due
// depositi nello stesso giorno sono due file, non una riscrittura.

/** L'ultimo momento già depositato: da lì in poi si riparte. */
const CHIAVE_ULTIMO = "ponte.ultimoAppend";

/** Data e ora in Italia, nei due formati che il modello usa. */
function quando(d: Date): { nome: string; testo: string } {
  const p = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  const ora = v("hour") === "24" ? "00" : v("hour");
  return {
    nome: `${v("year")}-${v("month")}-${v("day")} ${ora}${v("minute")}`,
    testo: `${v("year")}-${v("month")}-${v("day")} ${ora}:${v("minute")}`,
  };
}

const CANALE: Record<string, string> = { google_ads: "Google", meta_ads: "Meta", tiktok: "TikTok" };

/** Cosa è stato fatto, in una riga: stato PRIMA → stato DOPO. */
function cosa(o: { tipo: string; prima: string | null; parametri: string | null }): string {
  let par: Record<string, unknown> = {};
  try {
    par = o.parametri ? (JSON.parse(o.parametri) as Record<string, unknown>) : {};
  } catch {
    par = {};
  }
  const dopo =
    o.tipo === "budget" && par.budget != null
      ? `${par.budget} €/g`
      : o.tipo.startsWith("pausa_")
        ? "in pausa"
        : o.tipo.startsWith("attiva_")
          ? "attiva"
          : o.tipo === "negativa"
            ? `esclusa «${String(par.testo ?? "")}»${par.corrispondenza ? ` (${par.corrispondenza})` : ""}`
            : o.tipo === "nuova_keyword"
              ? `keyword «${String(par.testo ?? "")}»${par.corrispondenza ? ` (${par.corrispondenza})` : ""}`
              : o.tipo === "nuova_campagna"
                ? "campagna creata (in pausa)"
                : o.tipo.replace(/_/g, " ");
  return `${o.prima ?? "—"} → ${dopo}`;
}

export type EsitoDeposito =
  | { ok: true; scritto: false; motivo: string }
  | { ok: true; scritto: true; nome: string; voci: number; contenuto?: string }
  | { ok: false; errore: string };

/**
 * Opzioni del deposito.
 *
 * ⚠️ `anteprima` esiste perché un APPEND **malformato è peggio di nessun
 * APPEND**: il custode lo consolida a occhi chiusi, e un formato libero gli
 * sporca il consolidamento senza che nessuno se ne accorga. Con l'anteprima il
 * testo si legge PRIMA che nasca il file — e il ponte è append-only, quindi
 * un file sbagliato non si corregge, si può solo affiancare.
 */
export type OpzioniDeposito = {
  anteprima?: boolean;
  /**
   * Da quando raccogliere, se non dall'ultimo deposito. Serve al **recupero
   * dello storico**: il giro normale parte da dove si era fermato, ma la prima
   * volta il ponte va riempito all'indietro, o il custode riceve un log che
   * comincia a metà di una storia che non ha mai visto.
   */
  da?: Date;
  /**
   * Anche i tentativi FALLITI. Di norma no — un APPEND è il log di ciò che è
   * stato fatto — ma «tutto quello che è stato fatto» comprende anche ciò che
   * si è provato e non è passato: un annuncio rifiutato da Google è un fatto
   * che il progetto di brand deve conoscere, non un non-evento.
   */
  falliti?: boolean;
};

/**
 * Deposita nel ponte le operazioni eseguite dall'ultimo deposito in poi.
 *
 * ⚠️ Non scrive un file vuoto: se non è stato fatto niente, non c'è niente da
 * raccontare, e un APPEND senza voci costringerebbe il custode a consolidare
 * il nulla a ogni giro.
 */
export async function depositaAppendAzioni(opzioni: OpzioniDeposito = {}): Promise<EsitoDeposito> {
  const segno = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_ULTIMO } }).catch(() => null);
  const da = segno ? new Date(segno.valore) : null;
  // Al primo giro non si riversa nel ponte tutta la storia dell'app: si parte
  // dalle ultime 24 ore. Il passato lo hanno già i progetti di brand, e un
  // APPEND con dentro un mese non lo consolida nessuno.
  const inizio =
    opzioni.da ?? (da && !isNaN(da.getTime()) ? da : new Date(Date.now() - 24 * 3600_000));

  const stati = opzioni.falliti ? ["eseguita", "fallita"] : ["eseguita"];
  const operazioni = await prisma.operazioneAdv.findMany({
    // ⚠️ Le fallite non hanno `eseguitaIl`: si ordinano e si filtrano sulla
    // creazione, o sparirebbero dal recupero proprio perché sono fallite.
    where: {
      stato: { in: stati },
      OR: [{ eseguitaIl: { gt: inizio } }, { eseguitaIl: null, creataIl: { gt: inizio } }],
    },
    orderBy: [{ eseguitaIl: "asc" }, { creataIl: "asc" }],
  });
  if (operazioni.length === 0) {
    return { ok: true, scritto: false, motivo: `Nessuna operazione eseguita dopo il ${quando(inizio).testo}.` };
  }

  // Il brand: sta sulla campagna, non sull'operazione.
  const idCampagne = [...new Set(operazioni.map((o) => o.campagnaId).filter((x): x is string => Boolean(x)))];
  const campagne = idCampagne.length
    ? await prisma.campagna.findMany({ where: { id: { in: idCampagne } }, select: { id: true, brand: true, idEsterno: true, nome: true } })
    : [];
  const perId = new Map(campagne.map((c) => [c.id, c]));

  // ⚠️ La CONFERMA INDIPENDENTE, non l'esito dello script. Il modello chiede
  // «Esito verifica immediata»: la verifica immediata dello script dice solo
  // che Google non ha protestato sul momento — ed è proprio quella che il
  // 23/08 ha dichiarato un dubbio su venti negative che erano tutte a posto.
  // Qui va quello che Google ha rimandato DOPO, nei giri di lettura.
  const conferme = await confermeOperazioni(operazioni);

  const adesso = new Date();
  const q = quando(adesso);
  const righe = operazioni.map((o) => {
    const c = o.campagnaId ? perId.get(o.campagnaId) : undefined;
    const brand = ETICHETTA_BRAND[c?.brand ?? ""] ?? c?.brand ?? "—";
    const idEsterno = o.idEsterno ?? c?.idEsterno ?? null;
    const oggetto = `${c?.nome ?? o.bersaglio}${idEsterno ? ` (${idEsterno})` : ""}`;
    // L'autorizzazione: nell'app è l'approvazione in coda, con nome e data. È
    // il nostro equivalente di «richiesta utente in chat», e si dice com'è —
    // non si scrive «briefing» se un briefing non c'era.
    const autorizzazione = o.approvataIl
      ? `approvata in coda${o.approvataDa ? ` da ${o.approvataDa}` : ""} il ${quando(o.approvataIl).testo}`
      : "senza approvazione registrata";
    const conf = conferme.get(o.id);
    // ⚠️ Una FALLITA non ha una conferma da Google — non è mai arrivata a
    // Google. Il suo esito è il rifiuto, e si scrive quello, marcato: leggere
    // «—» al posto di «rifiutata» farebbe sembrare la riga incompleta invece
    // che negativa.
    const verifica =
      o.stato === "fallita"
        ? `NON ESEGUITA — ${o.esito ?? "rifiutata, motivo non registrato"}`
        : conf
          ? `${conf.etichetta} — ${conf.frase}`
          : (o.esito ?? "—");
    return (
      `- [${quando(o.eseguitaIl ?? o.creataIl).testo}] [App-Azioni] Canale: ${CANALE[o.canale] ?? o.canale} [${brand}]` +
      ` · Campagna/oggetto: ${oggetto}` +
      ` · Cosa: ${cosa(o)}` +
      ` · Autorizzazione: ${autorizzazione}` +
      ` · Esito verifica immediata: ${verifica}`
    );
  });

  const contenuto =
    `# APPEND 00.2 — App-Azioni — [${q.testo}] (consolida il custode)\n` +
    `\n` +
    // Da quando a quando: senza, chi consolida non sa se una voce manca perché
    // non è successa o perché il periodo non la copriva.
    `Periodo coperto: dal ${quando(inizio).testo} al ${q.testo} · ${operazioni.length} voci` +
    (opzioni.falliti ? " (eseguite e NON eseguite)" : " (solo eseguite)") +
    ` · scritto dall'app deluxy-marketing.\n` +
    `\n` +
    righe.join("\n") +
    `\n`;

  const nome = `APPEND 00.2 App-Azioni ${q.nome}.md`;
  if (opzioni.anteprima) {
    return { ok: true, scritto: true, nome, voci: operazioni.length, contenuto };
  }
  const esito = await scriviInOut(nome, contenuto);
  if (!esito.ok) return { ok: false, errore: esito.errore ?? "Scrittura rifiutata." };

  // ⚠️ Il segno si sposta SOLO dopo una scrittura riuscita: se si spostasse
  // prima, un errore di rete farebbe sparire quelle operazioni dal ponte per
  // sempre — e nessuno se ne accorgerebbe, perché il giro dopo ripartirebbe
  // da dopo.
  // ⚠️ Il segno tiene il momento PIÙ RECENTE fra quelli depositati, non
  // l'ultimo della lista: con le fallite dentro, l'ordinamento mescola
  // `eseguitaIl` e `creataIl`, e prendere «l'ultima riga» sposterebbe il
  // segno indietro — facendo ridepositare domani cose già depositate.
  const ultimo = new Date(
    Math.max(...operazioni.map((o) => (o.eseguitaIl ?? o.creataIl).getTime())),
  ).toISOString();
  await prisma.impostazione.upsert({
    where: { chiave: CHIAVE_ULTIMO },
    update: { valore: ultimo },
    create: { chiave: CHIAVE_ULTIMO, valore: ultimo },
  });

  return { ok: true, scritto: true, nome, voci: operazioni.length };
}
