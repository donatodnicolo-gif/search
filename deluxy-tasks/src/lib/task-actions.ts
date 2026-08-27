"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { leggiSessione, SESSION_COOKIE, type Sessione } from "./auth";
import { prisma } from "./db";
import { nomePersona } from "./persone";
import { isPriorita, PRIORITA_DEFAULT } from "./priorita";
import { isAdmin } from "./ruoli";
import { SISTEMA_UI } from "./sistemi";
import { emailiVisibili } from "./squadre";
import { STATO_DEFAULT } from "./stati";

// Creazione di un'attività dalla UI (bottone «Nuova attività» in dashboard).
// Le task nate qui hanno `sistema = "tasks"` (SISTEMA_UI) e nessun `idEsterno`:
// non appartengono a un'altra app, quindi nessun callback e nessuna app le
// sovrascrive; entrano nel feed `changes` come tutte le altre (revisione 1)
// e il Calendario le vede se hanno una scadenza.

export type NuovaTaskInput = {
  titolo: string;
  descrizione?: string;
  utenteEmail: string;
  priorita?: string;
  scadenza?: string; // "YYYY-MM-DD" o vuoto
  link?: string;
};

// `campo` dice QUALE campo ha causato l'errore, così la UI lo mostra lì
// (Libro UX&UI, legge 5: l'errore sta presso il campo). Assente = errore generale.
export type CampoNuovaTask = "titolo" | "utenteEmail" | "priorita" | "scadenza" | "link";
export type EsitoNuovaTask =
  | { ok: true; id: string }
  | { ok: false; messaggio: string; campo?: CampoNuovaTask };

/** Chi sta creando. Senza segreto (sviluppo) non c'è sessione: vista admin. */
async function chiSono(): Promise<{ sessione: Sessione | null; admin: boolean } | { errore: string }> {
  if (!process.env.TASKS_SESSION_SECRET) return { sessione: null, admin: true };
  const jar = await cookies();
  const sessione = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!sessione) return { errore: "Sessione scaduta: rientra." };
  return { sessione, admin: isAdmin(sessione.ruolo) };
}

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function creaTaskAction(input: NuovaTaskInput): Promise<EsitoNuovaTask> {
  const io = await chiSono();
  if ("errore" in io) return { ok: false, messaggio: io.errore };

  const titolo = (input.titolo ?? "").trim();
  if (!titolo) return { ok: false, messaggio: "Scrivi un titolo.", campo: "titolo" };
  if (titolo.length > 200)
    return { ok: false, messaggio: "Titolo troppo lungo (massimo 200 caratteri).", campo: "titolo" };

  const utenteEmail = (input.utenteEmail ?? "").trim().toLowerCase();
  if (!RE_EMAIL.test(utenteEmail))
    return { ok: false, messaggio: "Scegli a chi assegnarla (email valida).", campo: "utenteEmail" };

  // Un non-admin può assegnare solo a sé o alla propria squadra.
  if (!io.admin && io.sessione) {
    const visibili = await emailiVisibili(io.sessione.email);
    if (!visibili.includes(utenteEmail)) {
      return {
        ok: false,
        messaggio: "Puoi assegnare attività solo a te o alla tua squadra.",
        campo: "utenteEmail",
      };
    }
  }

  const priorita = input.priorita?.trim() || PRIORITA_DEFAULT;
  if (!isPriorita(priorita)) return { ok: false, messaggio: "Priorità non valida.", campo: "priorita" };

  let scadenza: Date | null = null;
  const dataTesto = (input.scadenza ?? "").trim();
  if (dataTesto) {
    if (!RE_DATA.test(dataTesto))
      return { ok: false, messaggio: "Data di scadenza non valida.", campo: "scadenza" };
    // Giorno intero: mezzogiorno UTC, così in Italia resta lo stesso giorno.
    scadenza = new Date(`${dataTesto}T12:00:00.000Z`);
    if (isNaN(scadenza.getTime()))
      return { ok: false, messaggio: "Data di scadenza non valida.", campo: "scadenza" };
  }

  const link = (input.link ?? "").trim();
  if (link && !/^https?:\/\//i.test(link)) {
    return { ok: false, messaggio: "Il link deve iniziare con http:// o https://.", campo: "link" };
  }

  const descrizione = (input.descrizione ?? "").trim();

  try {
    const task = await prisma.task.create({
      data: {
        sistema: SISTEMA_UI,
        idEsterno: null,
        utenteEmail,
        utenteNome: await nomePersona(utenteEmail),
        titolo,
        descrizione: descrizione || null,
        stato: STATO_DEFAULT,
        priorita,
        scadenza,
        link: link || null,
        creataDa: io.sessione?.email ?? null,
        ultimoAttore: "ui",
      },
    });
    revalidatePath("/");
    return { ok: true, id: task.id };
  } catch {
    return { ok: false, messaggio: "Non sono riuscito a salvare l'attività (database)." };
  }
}
