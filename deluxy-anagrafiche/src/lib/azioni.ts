"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { isInteresse } from "./interessi";
import { isStato } from "./stati";
import { ARCHIVIATA, registraPassaggio } from "./storico";

// Cambio di stato dalla scheda partner (UI interna). Le app esterne passano
// dalle API /api/v1 con le chiavi; qui la UI è già protetta dal login.
export async function cambiaStato(partnerId: string, fd: FormData) {
  const nuovo = String(fd.get("stato") ?? "");
  if (!isStato(nuovo)) return;
  const attuale = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { stato: true },
  });
  if (!attuale) return;
  await prisma.partner.update({
    where: { id: partnerId },
    data: { stato: nuovo },
  });
  await registraPassaggio(partnerId, attuale.stato, nuovo, "ui");
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Aggiunge o toglie una tipologia di interesse (multi-scelta).
// Un solo statement atomico: click rapidi ravvicinati non si perdono a vicenda
// come accadrebbe con leggi-array-poi-riscrivi.
export async function toggleInteresse(partnerId: string, fd: FormData) {
  const valore = String(fd.get("interesse") ?? "");
  if (!isInteresse(valore)) return;
  await prisma.$executeRaw`
    UPDATE "Partner"
    SET "interessi" = CASE
      WHEN "interessi" @> ARRAY[${valore}]::text[]
        THEN array_remove("interessi", ${valore})
      ELSE array_append("interessi", ${valore})
    END,
    "aggiornatoIl" = now()
    WHERE "id" = ${partnerId}`;
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Creazione di un'anagrafica dal form "Nuovo" della UI (fonte "ui").
// Stessa dedup delle API: se nome+città esiste già (anche in archivio) non si
// crea un doppione, si apre la scheda esistente.
export async function creaPartner(fd: FormData) {
  const testo = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const maiuscolo = (k: string) => testo(k)?.toUpperCase() ?? null;

  const nome = testo("nome");
  const categoria = maiuscolo("categoria");
  if (!nome || !categoria) redirect("/partner/nuovo?errore=1");

  const stato = String(fd.get("stato") ?? "");
  const citta = maiuscolo("citta");

  const esistente = await prisma.partner.findFirst({
    where: {
      nome: { equals: nome, mode: "insensitive" },
      ...(citta ? { citta: { equals: citta, mode: "insensitive" } } : { citta: null }),
    },
  });
  if (esistente) redirect(`/partner/${esistente.id}?esistente=1`);

  const contatti = [];
  for (const i of [0, 1, 2]) {
    const c = {
      ruolo: testo(`c${i}-ruolo`)?.toUpperCase() ?? null,
      nome: testo(`c${i}-nome`),
      telefono: testo(`c${i}-telefono`),
      email: testo(`c${i}-email`),
    };
    if (c.ruolo || c.nome || c.telefono || c.email) contatti.push(c);
  }

  const creato = await prisma.partner.create({
    data: {
      nome,
      categoria,
      stato: isStato(stato) ? stato : "prospect",
      citta,
      provincia: maiuscolo("provincia"),
      regione: maiuscolo("regione"),
      indirizzo: testo("indirizzo"),
      ragioneSociale: testo("ragioneSociale"),
      email: testo("email"),
      telefono: testo("telefono"),
      pIva: testo("pIva"),
      account: maiuscolo("account"),
      note: testo("note"),
      fonte: "ui",
      contatti: contatti.length ? { create: contatti } : undefined,
    },
  });
  revalidatePath("/");
  redirect(`/partner/${creato.id}`);
}

// Archivia (attivo=false) o ripristina un'anagrafica. Le archiviate spariscono
// da elenchi, sidebar e API (salvo attivo=false/tutti) e vivono nella sezione
// "Archiviati". Stessa semantica del DELETE delle API.
export async function impostaArchiviato(partnerId: string, archiviato: boolean) {
  const p = await prisma.partner.update({
    where: { id: partnerId },
    data: { attivo: !archiviato },
  });
  await registraPassaggio(
    partnerId,
    archiviato ? p.stato : ARCHIVIATA,
    archiviato ? ARCHIVIATA : p.stato,
    "ui",
  );
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}
