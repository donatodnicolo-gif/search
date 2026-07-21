"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { aggiornaAnagrafica, type CampiAnagrafica } from "./anagrafiche";
import { ibanValido } from "./impostazioni";

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

// Salva i dati bancari (IBAN, banca) di un partner: li scrive sul partner (per i
// bonifici SEPA futuri) e, se la scrittura è attiva, li invia al registro
// Anagrafiche (datiFinanziari). L'IBAN va inserito a mano — non è ricavabile
// dai bonifici (né Qonto né i movimenti espongono l'IBAN della controparte).
export async function salvaDatiBancari(partnerId: string, anagraficaId: string | null, fd: FormData) {
  const iban = String(fd.get("iban") ?? "").replace(/\s/g, "").toUpperCase();
  const banca = String(fd.get("banca") ?? "").trim();
  if (iban && !ibanValido(iban)) {
    revalidatePath("/registrazioni/riconciliazione", "layout");
    redirect(`/registrazioni/riconciliazione?errore=${encodeURIComponent(`IBAN non valido per il partner: ${iban}`)}`);
  }
  // sul partner locale (per i SEPA)
  await prisma.partner.update({ where: { id: partnerId }, data: { iban: iban || null } });
  // sul registro (se collegato e scrittura attiva)
  let esito = "solo locale";
  if (anagraficaId && (iban || banca)) {
    const res = await aggiornaAnagrafica(anagraficaId, {
      ...(iban ? { iban } : {}),
      ...(banca ? { banca } : {}),
    });
    esito = res.ok ? "registro aggiornato" : res.errore;
  }
  revalidatePath("/registrazioni/riconciliazione", "layout");
  revalidatePath(`/partner/${partnerId}`, "layout");
  redirect(`/registrazioni/riconciliazione?banca=${encodeURIComponent(esito)}`);
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
