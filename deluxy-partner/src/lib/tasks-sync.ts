import { prisma } from "./db";
import { chiave, env } from "./env";

// Sincronizzazione delle attività di Finance con **deluxy-tasks**, il registro
// centralizzato delle attività di una persona.
//
// Perché non basta l'elenco locale: un collega ha attività che arrivano da
// Finance, da AI Mail, da Scout. Se ognuna resta nella sua app, nessuno vede
// mai la lista vera di quello che deve fare. Tasks è il posto dove si vedono
// insieme; Finance resta il posto dove le attività finanziarie NASCONO.
//
// Va in due direzioni:
//   - SPINTA: ogni creazione/modifica qui fa un upsert là, sulla coppia
//     (sistema, idEsterno) — lo stesso task non si duplica mai.
//   - RITIRO: `/tasks/changes?since=<cursore>` racconta cosa è cambiato là
//     (es. un collega ha completato l'attività dalla UI condivisa) e si applica
//     qui. Il cursore si conserva, così un aggiornamento non si perde nemmeno
//     se questa app è stata spenta per un giorno.
//
// Env: TASKS_URL (default produzione), TASKS_API_KEY (chiave con scrittura,
// emessa da Tasks con `npm run chiave -- deluxy-finance --scrittura`),
// TASKS_UTENTE_DEFAULT (email a cui attribuire le attività senza assegnatario).

const CHIAVE_CURSORE = "tasks.cursore";
// Nome con cui Finance è registrata dentro Tasks: è la chiave con cui il
// registro separa le nostre attività da quelle delle altre app, e con cui
// numera le revisioni.
const SISTEMA = "deluxy-finance";

function baseUrl(): string {
  return (env("TASKS_URL") || "https://deluxy-tasks.vercel.app").replace(/\/$/, "");
}

export function tasksConfigurato(): boolean {
  return Boolean(chiave("TASKS_API_KEY"));
}

// ————— Traduzione fra i due vocabolari —————
// I due elenchi non usano le stesse parole: tradurre in un punto solo evita che
// una svista mandi «fatto» dove l'altro si aspetta «completata» e lasci per
// sempre l'attività aperta dalla parte sbagliata.
const STATO_VERSO_TASKS: Record<string, string> = {
  aperto: "aperta",
  in_corso: "in_corso",
  fatto: "completata",
};
const STATO_DA_TASKS: Record<string, string> = {
  aperta: "aperto",
  in_corso: "in_corso",
  completata: "fatto",
  annullata: "fatto", // qui non esiste «annullata»: si chiude, e lo dice la nota
};
const PRIORITA_VERSO_TASKS: Record<string, string> = { P0: "urgente", P1: "media", P2: "bassa" };
const PRIORITA_DA_TASKS: Record<string, string> = {
  urgente: "P0",
  alta: "P0",
  media: "P1",
  bassa: "P2",
};

/** A chi va attribuita l'attività nel registro condiviso, in ordine:
 *  1. l'assegnatario scritto qui, se è un'email;
 *  2. **chi è collegato adesso** — un'attività che scrivo io è mia finché non
 *     dico il contrario, ed è la risposta giusta nella stragrande maggioranza
 *     dei casi senza chiedere niente a nessuno;
 *  3. `TASKS_UTENTE_DEFAULT`, per chi entra con la password di team e non ha
 *     un'email propria. */
async function emailAssegnatario(assegnatario: string | null): Promise<string | null> {
  const a = (assegnatario ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a)) return a.toLowerCase();
  try {
    const { cookies } = await import("next/headers");
    const { SESSION_COOKIE, sessioneCorrente } = await import("./auth");
    const jar = await cookies();
    const s = await sessioneCorrente(jar.get(SESSION_COOKIE)?.value);
    if (s?.tipo === "utente" && s.email) return s.email.toLowerCase();
  } catch {
    // fuori da una richiesta (cron, script): si passa al default
  }
  return env("TASKS_UTENTE_DEFAULT")?.toLowerCase() ?? null;
}

async function chiamata(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  percorso: string,
  corpo?: unknown
): Promise<{ stato: number; dati: Record<string, unknown> | null }> {
  const key = chiave("TASKS_API_KEY");
  if (!key) throw new Error("TASKS_API_KEY non configurata.");
  const res = await fetch(`${baseUrl()}${percorso}`, {
    method: metodo,
    headers: { "x-api-key": key, ...(corpo ? { "content-type": "application/json" } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    cache: "no-store",
    // Tasks non deve mai far fallire un'azione di Finance: se tarda, si rinuncia.
    signal: AbortSignal.timeout(8000),
  });
  return { stato: res.status, dati: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

type TaskLocale = {
  id: string;
  titolo: string;
  note: string | null;
  stato: string;
  priorita: string;
  assegnatario: string | null;
  scadenza: Date | null;
  partnerId: string | null;
  partnerNome: string | null;
  riferimento: string | null;
  updatedAt: Date;
};

/** Manda (o aggiorna) l'attività nel registro centralizzato.
 *  **Non lancia mai**: se Tasks è giù o non configurata, l'attività resta
 *  comunque salvata qui. Un registro condiviso irraggiungibile non è un buon
 *  motivo per non poter scrivere un promemoria. */
export async function spingiTask(t: TaskLocale): Promise<void> {
  if (!tasksConfigurato()) return;
  const utenteEmail = await emailAssegnatario(t.assegnatario);
  if (!utenteEmail) return; // senza destinatario Tasks non saprebbe a chi metterla

  try {
    const { stato, dati } = await chiamata("POST", "/api/v1/tasks", {
      idEsterno: t.id,
      utenteEmail,
      utenteNome: t.assegnatario && !t.assegnatario.includes("@") ? t.assegnatario : undefined,
      titolo: t.titolo,
      descrizione: t.note ?? undefined,
      stato: STATO_VERSO_TASKS[t.stato] ?? "aperta",
      priorita: PRIORITA_VERSO_TASKS[t.priorita] ?? "media",
      scadenza: t.scadenza?.toISOString(),
      creataDa: "Deluxy Finance",
      link: `${env("APP_URL") || "https://deluxy-partner.vercel.app"}/tasks`,
      ...(t.partnerId
        ? { contestoTipo: "partner", contestoId: t.partnerId, contestoEtichetta: t.partnerNome ?? undefined }
        : {}),
      tag: [t.riferimento].filter(Boolean),
      // `asOf` protegge dalle regressioni: se là è arrivata una modifica più
      // recente della nostra, Tasks ignora questa scrittura invece di riportare
      // indietro il dato.
      asOf: t.updatedAt.toISOString(),
      revisioneOrigine: String(t.updatedAt.getTime()),
    });
    if (stato !== 200 && stato !== 201) return;
    const idRemoto = dati?.id ?? (dati?.task as Record<string, unknown> | undefined)?.id;
    await prisma.taskFinance.update({
      where: { id: t.id },
      data: { tasksId: idRemoto ? String(idRemoto) : undefined, tasksIl: new Date() },
    });
  } catch (e) {
    console.warn("[tasks] spinta non riuscita:", (e as Error).message);
  }
}

/** Archivia l'attività nel registro condiviso quando qui viene eliminata.
 *  Senza, resterebbe là in eterno una cosa da fare che non esiste più. */
export async function archiviaTask(tasksId: string | null): Promise<void> {
  if (!tasksConfigurato() || !tasksId) return;
  try {
    await chiamata("DELETE", `/api/v1/tasks/${encodeURIComponent(tasksId)}`);
  } catch (e) {
    console.warn("[tasks] archiviazione non riuscita:", (e as Error).message);
  }
}

export type EsitoRitiro = { aggiornate: number; errore?: string };

/** Applica qui quello che è cambiato là dall'ultima volta.
 *  Best-effort e silenzioso: si chiama al caricamento di `/tasks`, e se il
 *  registro non risponde la pagina si apre lo stesso con i dati locali. */
export async function ritiraAggiornamenti(): Promise<EsitoRitiro> {
  if (!tasksConfigurato()) return { aggiornate: 0 };
  try {
    const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE_CURSORE } });
    let since = riga?.valore ?? "0";
    let aggiornate = 0;

    // Il filtro `sistema` NON è un'ottimizzazione: le revisioni di Tasks sono
    // numerate PER SISTEMA. Senza filtro si legge il flusso di tutte le app e
    // si finisce per salvare un cursore di un'altra numerazione — poi
    // `since=<numero enorme>` non restituisce mai più niente e la
    // sincronizzazione si spegne in silenzio. (Successo davvero il 27/07/2026.)
    //
    // Si seguono anche le pagine: fermarsi alla prima vuol dire lasciare
    // indietro gli aggiornamenti più recenti, cioè proprio quelli che servono.
    for (let pagina = 0; pagina < 10; pagina++) {
    const { stato, dati } = await chiamata(
      "GET",
      `/api/v1/tasks/changes?since=${encodeURIComponent(since)}&sistema=${encodeURIComponent(SISTEMA)}&perPage=200`
    );
    if (stato !== 200 || !dati) return { aggiornate, errore: `Tasks ha risposto ${stato}` };

    const elenco = (dati.dati ?? []) as Record<string, unknown>[];
    for (const remota of elenco) {
      const idEsterno = remota.idEsterno ? String(remota.idEsterno) : null;
      if (!idEsterno) continue; // non è nostra
      const locale = await prisma.taskFinance.findUnique({ where: { id: idEsterno } });
      if (!locale) continue;

      const attiva = remota.attiva === undefined ? true : Boolean(remota.attiva);
      const statoRemoto = String(remota.stato ?? "");
      const nuovoStato = !attiva ? "fatto" : STATO_DA_TASKS[statoRemoto] ?? locale.stato;
      const nuovaPriorita = PRIORITA_DA_TASKS[String(remota.priorita ?? "")] ?? locale.priorita;
      if (nuovoStato === locale.stato && nuovaPriorita === locale.priorita) continue;

      await prisma.taskFinance.update({
        where: { id: locale.id },
        data: {
          stato: nuovoStato,
          priorita: nuovaPriorita,
          completatoIl: nuovoStato === "fatto" ? locale.completatoIl ?? new Date() : null,
          tasksIl: new Date(),
        },
      });
      aggiornate++;
    }

    // Il cursore si salva SOLO dopo aver applicato la pagina: se qualcosa
    // esplode a metà, la prossima volta si riparte da lì e non si perde niente.
    const cursore = dati.cursore != null ? String(dati.cursore) : null;
    if (cursore && cursore !== since) {
      await prisma.impostazione.upsert({
        where: { chiave: CHIAVE_CURSORE },
        update: { valore: cursore },
        create: { chiave: CHIAVE_CURSORE, valore: cursore },
      });
      since = cursore;
    }
    if (!dati.altre || elenco.length === 0) break;
    }
    return { aggiornate };
  } catch (e) {
    return { aggiornate: 0, errore: (e as Error).message };
  }
}
