"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

// Le fasce di prezzo si modificano solo qui. Non c'è nessuna azione per
// «assegnare la fascia a un prodotto», ed è voluto: la fascia è quella in cui
// cade il prezzo, quindi cambiare i confini è l'unico modo di cambiare come si
// legge il catalogo — e vale per tutti i prodotti nello stesso istante.

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function numero(fd: FormData, k: string): number | null {
  const s = testo(fd, k);
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function aggiorna() {
  for (const p of ["/fasce", "/anagrafica", "/prodotti", "/classificazione"]) revalidatePath(p);
}

export async function salvaFasciaAzione(id: string | null, fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) redirect("/fasce?errore=" + encodeURIComponent("Serve il nome della fascia."));

  const da = numero(fd, "da") ?? 0;
  const a = numero(fd, "a");
  if (a !== null && a <= da)
    redirect(
      "/fasce?errore=" +
        encodeURIComponent(`«${nome}» finirebbe prima di cominciare: da ${da} € a ${a} €.`),
    );

  const dati = { nome, da, a, descrizione: testo(fd, "descrizione") || null };

  if (id) {
    await prisma.fasciaPrezzo.update({ where: { id }, data: dati });
  } else {
    const esiste = await prisma.fasciaPrezzo.findUnique({ where: { nome } });
    if (esiste)
      redirect("/fasce?errore=" + encodeURIComponent(`Esiste già una fascia chiamata «${nome}».`));
    // In coda per posizione, ma l'elenco si legge comunque per prezzo crescente.
    const ultima = await prisma.fasciaPrezzo.findFirst({ orderBy: { ordine: "desc" } });
    await prisma.fasciaPrezzo.create({ data: { ...dati, ordine: (ultima?.ordine ?? 0) + 1 } });
  }
  aggiorna();
  redirect("/fasce");
}

export async function eliminaFasciaAzione(id: string, _fd: FormData) {
  // Nessun prodotto «perde» la sua fascia: la fascia non è scritta da nessuna
  // parte sul prodotto. Togliendo uno scalino, i prodotti che ci stavano dentro
  // finiscono in quello che copre il loro prezzo — o, se resta scoperto, nel
  // buco che la pagina segnala in cima.
  await prisma.fasciaPrezzo.delete({ where: { id } });
  aggiorna();
  redirect("/fasce");
}
