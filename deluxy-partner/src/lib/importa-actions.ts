"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { importaAttivi, anagraficheAttive, creaDaAnagrafica } from "./importa-registro";

// «Portali in Finance»: l'import a mano, per non aspettare il cron della notte.
export async function importaAttiviOra() {
  const esito = await importaAttivi("manuale");
  revalidatePath("/partner", "layout");
  const pezzi = [
    esito.creati.length ? `${esito.creati.length} schede create` : null,
    esito.collegati.length ? `${esito.collegati.length} collegate a schede esistenti` : null,
    esito.dubbi ? `${esito.dubbi} lasciate da decidere (somigliano a schede già qui)` : null,
    esito.errori.length ? `${esito.errori.length} non riuscite: ${esito.errori.join("; ")}` : null,
  ].filter(Boolean);
  const messaggio = esito.errore
    ? esito.errore
    : pezzi.length === 0
      ? "Nessun cliente da portare dentro: erano già tutti qui."
      : pezzi.join(" · ") + (esito.creati.length ? `. Create: ${esito.creati.slice(0, 8).join(", ")}` : "");
  redirect(
    `/partner?${esito.errore || esito.errori.length ? "importErrore" : "importFatto"}=${encodeURIComponent(messaggio)}`
  );
}

// «È la stessa azienda»: invece di creare una scheda nuova, il record del
// registro si attacca a quella che c'è già. È il gesto che evita il doppione.
export async function collegaDubbio(fd: FormData) {
  const anagraficaId = String(fd.get("anagraficaId") ?? "").trim();
  const partnerId = String(fd.get("partnerId") ?? "").trim();
  if (!anagraficaId || !partnerId) redirect("/partner");
  const a = (await anagraficheAttive()).find((x) => x.id === anagraficaId);
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, nome: true, anagraficaId: true },
  });
  if (!partner) redirect("/partner");

  // ⚠️ Nel registro le SEDI sono record distinti — «DR. VRANJES» a Milano e
  // «Dr. Vranjes» a Bagno a Ripoli, «MONCLER» a Firenze e a Forte dei Marmi —
  // mentre qui sono un cliente solo. Se il partner ha già la sua anagrafica
  // principale, la seconda sede si AGGIUNGE: sostituirla vorrebbe dire perdere
  // il collegamento di prima, e in FINANCE il campo è uno solo.
  let comeCollegata: string;
  if (!partner!.anagraficaId) {
    await prisma.partner.update({ where: { id: partnerId }, data: { anagraficaId } });
    comeCollegata = "collegata";
  } else if (partner!.anagraficaId === anagraficaId) {
    comeCollegata = "era già collegata";
  } else {
    await prisma.anagraficaCollegata.upsert({
      where: { anagraficaId },
      create: { anagraficaId, partnerId, nome: a?.nome ?? null, citta: a?.citta ?? null },
      update: { partnerId, nome: a?.nome ?? null, citta: a?.citta ?? null },
    });
    comeCollegata = "aggiunta come altra sede della stessa scheda";
  }

  revalidatePath("/partner", "layout");
  revalidatePath(`/partner/${partnerId}`, "layout");
  const quale = a ? `«${a.nome.replace(/\s+/g, " ")}${a.citta ? ` · ${a.citta}` : ""}»` : "L'anagrafica";
  redirect(
    `/partner?importFatto=${encodeURIComponent(
      `${quale}: ${comeCollegata} su «${partner!.nome}». Tutto quello che riguarda questa sede finisce su quell'unica scheda.`
    )}`
  );
}

// «È un'altra azienda»: si crea la scheda, nonostante la somiglianza.
export async function creaDubbioComunque(fd: FormData) {
  const anagraficaId = String(fd.get("anagraficaId") ?? "").trim();
  if (!anagraficaId) redirect("/partner");
  const a = (await anagraficheAttive()).find((x) => x.id === anagraficaId);
  if (!a) {
    redirect(`/partner?importErrore=${encodeURIComponent("Quell'anagrafica non risulta più fra i clienti del registro.")}`);
  }
  const esito = await creaDaAnagrafica(a!);
  revalidatePath("/partner", "layout");
  redirect(
    esito.ok
      ? `/partner?importFatto=${encodeURIComponent(`«${esito.nome}» creato.`)}`
      : `/partner?importErrore=${encodeURIComponent(esito.errore!)}`
  );
}
