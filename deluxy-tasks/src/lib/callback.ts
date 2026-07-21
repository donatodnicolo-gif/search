import { createHmac } from "crypto";
import type { Task, TaskLivello } from "@prisma/client";
import { prisma } from "./db";
import { serializzaTask } from "./task-api";

type TaskConLivelli = Task & { livelli?: TaskLivello[] };

// "Richiamo" del progetto di origine: quando una task cambia qui e la modifica
// non arriva dal progetto stesso, Tasks fa un POST firmato al suo callbackUrl.
// Il progetto verifica la firma (HMAC-SHA256 del corpo con il proprio segreto)
// nell'header `x-tasks-signature: sha256=<hex>` e allinea il suo dato.

export type EventoCallback = "creata" | "aggiornata" | "completata" | "archiviata";

export function firma(corpo: string, segreto: string): string {
  return "sha256=" + createHmac("sha256", segreto).update(corpo).digest("hex");
}

// Invia il callback al progetto proprietario della task. Fire-and-forget con
// un piccolo timeout: non deve mai bloccare la risposta all'API. Se il progetto
// non è registrato o non ha callbackUrl, non fa nulla (la sync resta in pull).
export async function notificaProgetto(task: TaskConLivelli, evento: EventoCallback): Promise<void> {
  const progetto = await prisma.progetto.findUnique({ where: { sistema: task.sistema } });
  if (!progetto || !progetto.attivo || !progetto.callbackUrl) return;

  const corpo = JSON.stringify({
    evento,
    task: serializzaTask(task),
    inviatoIl: new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-tasks-event": evento,
  };
  if (progetto.callbackSegreto) headers["x-tasks-signature"] = firma(corpo, progetto.callbackSegreto);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(progetto.callbackUrl, {
      method: "POST",
      headers,
      body: corpo,
      signal: controller.signal,
    }).catch(() => {});
    clearTimeout(timer);
  } catch {
    // Il callback è best-effort: il progetto può comunque recuperare in pull
    // (GET /api/v1/tasks/changes). Non propaghiamo l'errore all'API.
  }
}
