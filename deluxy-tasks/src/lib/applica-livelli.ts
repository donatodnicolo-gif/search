import { prisma } from "./db";
import { indiceLivelloEffettivo, type LivelloInput } from "./livelli";

// Sostituisce l'intero set di livelli di una task e allinea i campi effettivi
// (priorita/scadenza/livelloSceltoId) al livello scelto. Va chiamata DOPO aver
// scritto la task (serve il suo id per la chiave esterna dei livelli). Non tocca
// la revisione: è parte della stessa scrittura logica di chi l'ha invocata.
export async function sincronizzaLivelli(
  taskId: string,
  livelli: LivelloInput[],
  notaScelta?: string | null,
): Promise<void> {
  await prisma.taskLivello.deleteMany({ where: { taskId } });

  if (!livelli.length) {
    // Nessun livello multiplo: resta il livello unico dato da priorita/scadenza.
    await prisma.task.update({ where: { id: taskId }, data: { livelloSceltoId: null } });
    return;
  }

  const creati = [];
  for (const l of livelli) {
    creati.push(
      await prisma.taskLivello.create({
        data: { taskId, priorita: l.priorita, data: l.data, nota: l.nota, ordine: l.ordine },
      }),
    );
  }

  const idx = indiceLivelloEffettivo(livelli, notaScelta);
  const scelto = creati[idx] ?? creati[0];
  await prisma.task.update({
    where: { id: taskId },
    data: { livelloSceltoId: scelto.id, priorita: scelto.priorita, scadenza: scelto.data },
  });
}

// Rende effettivo un livello già esistente (scelta del team dalla UI). Allinea
// priorita/scadenza a quel livello. Ritorna false se il livello non è della task.
export async function scegliLivello(taskId: string, livelloId: string): Promise<boolean> {
  const livello = await prisma.taskLivello.findUnique({ where: { id: livelloId } });
  if (!livello || livello.taskId !== taskId) return false;
  await prisma.task.update({
    where: { id: taskId },
    data: { livelloSceltoId: livello.id, priorita: livello.priorita, scadenza: livello.data },
  });
  return true;
}
