"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { aggiornaAnagrafica, type CampiAnagrafica } from "./anagrafiche";

// Conferma la riconciliazione di un cliente FIC e INVIA i campi al registro
// Anagrafiche (solo se la scrittura è configurata). L'azione parte solo da un
// click esplicito dell'operatore, un record per volta.
export async function confermaRiconciliazione(
  ficNome: string,
  partnerId: string,
  anagraficaId: string,
  campiJson: string
) {
  let campi: CampiAnagrafica = {};
  try {
    campi = JSON.parse(campiJson);
  } catch {
    campi = {};
  }

  const res = await aggiornaAnagrafica(anagraficaId, campi);
  const esito = res.ok ? "ok" : res.errore;

  await prisma.riconciliazioneAnagrafica.upsert({
    where: { ficNome },
    create: {
      ficNome,
      partnerId,
      anagraficaId,
      stato: res.ok ? "confermata" : "ignorata",
      campiInviati: Object.keys(campi).join(", ") || null,
      esito,
    },
    update: {
      partnerId,
      anagraficaId,
      // se l'invio fallisce non marchiamo "confermata": resta da ritentare
      ...(res.ok ? { stato: "confermata" } : {}),
      campiInviati: Object.keys(campi).join(", ") || null,
      esito,
    },
  });

  revalidatePath("/registrazioni/riconciliazione", "layout");
}

// Segna un cliente FIC come "ignorato" (non riproporlo nella riconciliazione).
export async function ignoraRiconciliazione(ficNome: string, partnerId?: string) {
  await prisma.riconciliazioneAnagrafica.upsert({
    where: { ficNome },
    create: { ficNome, partnerId: partnerId ?? null, stato: "ignorata" },
    update: { stato: "ignorata" },
  });
  revalidatePath("/registrazioni/riconciliazione", "layout");
}

// Riporta un cliente FIC in "da riconciliare" (annulla conferma/ignora).
export async function riapriRiconciliazione(ficNome: string) {
  await prisma.riconciliazioneAnagrafica.deleteMany({ where: { ficNome } });
  revalidatePath("/registrazioni/riconciliazione", "layout");
}
