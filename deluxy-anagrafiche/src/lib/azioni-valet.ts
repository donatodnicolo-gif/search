"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { diffCampi, registraModificaValet, registraModificheValet } from "./log-modifiche";
import { STATO_VALET_PREDEFINITO, isStatoValet, normalizzaProvince } from "./valet";

// Anagrafica dei valet: le persone che fanno le consegne. Qui si curano nome,
// recapiti e stato di servizio; paghe, province assegnate, disponibilità e
// stipendi restano nella piattaforma consegne (vedi il commento sul modello).

function leggi(fd: FormData) {
  const testo = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const maiuscolo = (k: string) => testo(k)?.toUpperCase() ?? null;
  return {
    nome: testo("nome"),
    cognome: testo("cognome"),
    telefono: testo("telefono"),
    email: testo("email"),
    indirizzo: testo("indirizzo"),
    citta: maiuscolo("citta"),
    provincia: maiuscolo("provincia"),
    provinceServite: normalizzaProvince(testo("provinceServite")),
    mezzo: testo("mezzo"),
    codiceFiscale: maiuscolo("codiceFiscale"),
    pIva: testo("pIva"),
    note: testo("note"),
  };
}

export async function creaValet(fd: FormData) {
  const dati = leggi(fd);
  if (!dati.nome) redirect("/valet/nuovo?errore=nome");

  const stato = String(fd.get("stato") ?? "");
  // Doppione per telefono: è l'unico dato che identifica davvero una persona
  // in un elenco di consegne. Se c'è già, si apre la sua scheda invece di
  // creare un secondo record con lo stesso numero.
  if (dati.telefono) {
    const cifre = dati.telefono.replace(/[^\d]/g, "").slice(-9);
    if (cifre.length >= 6) {
      const tutti = await prisma.valet.findMany({ select: { id: true, telefono: true } });
      const gia = tutti.find((v) => (v.telefono ?? "").replace(/[^\d]/g, "").slice(-9) === cifre);
      if (gia) redirect(`/valet/${gia.id}?esistente=1`);
    }
  }

  const creato = await prisma.valet.create({
    data: {
      ...dati,
      nome: dati.nome,
      stato: isStatoValet(stato) ? stato : STATO_VALET_PREDEFINITO,
      fonte: "ui",
    },
  });
  await registraModificaValet(creato.id, { origine: "ui" }, {
    campo: "creata",
    a: [dati.cognome, dati.nome, dati.citta].filter(Boolean).join(" · "),
  });
  revalidatePath("/valet");
  redirect(`/valet/${creato.id}`);
}

export async function aggiornaValet(valetId: string, fd: FormData) {
  const dati = leggi(fd);
  if (!dati.nome) redirect(`/valet/${valetId}/modifica?errore=nome`);

  const prima = await prisma.valet.findUnique({ where: { id: valetId } });
  if (!prima) redirect("/valet");

  // `nome` è obbligatorio a schema: qui è già garantito dal controllo sopra,
  // ma il tipo di Prisma non lo sa.
  await prisma.valet.update({ where: { id: valetId }, data: { ...dati, nome: dati.nome } });
  await registraModificheValet(valetId, { origine: "ui" }, diffCampi(prima, dati));
  revalidatePath("/valet");
  revalidatePath(`/valet/${valetId}`);
  redirect(`/valet/${valetId}`);
}

// Cambio dello stato di servizio dalla scheda (pillole, come per i partner).
export async function cambiaStatoValet(valetId: string, fd: FormData) {
  const nuovo = String(fd.get("stato") ?? "");
  if (!isStatoValet(nuovo)) return;
  const prima = await prisma.valet.findUnique({ where: { id: valetId }, select: { stato: true } });
  if (!prima || prima.stato === nuovo) return;
  await prisma.valet.update({ where: { id: valetId }, data: { stato: nuovo } });
  await registraModificaValet(valetId, { origine: "ui" }, { campo: "stato", da: prima.stato, a: nuovo });
  revalidatePath(`/valet/${valetId}`);
  revalidatePath("/valet");
}

// Archivia / ripristina. Come per i partner non si cancella: uno storico di
// consegne resta attaccato a quella persona anche quando non lavora più con noi.
export async function impostaArchiviatoValet(valetId: string, archiviato: boolean) {
  const v = await prisma.valet.update({
    where: { id: valetId },
    data: { attivo: !archiviato },
    select: { id: true },
  });
  await registraModificaValet(v.id, { origine: "ui" }, {
    campo: archiviato ? "archiviata" : "ripristinata",
  });
  revalidatePath(`/valet/${valetId}`);
  revalidatePath("/valet");
}
