"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { propagaDatiFinanziari } from "./insegna";
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
  // Diventata cliente ("attivo" = Partner): la scheda si riapre con il
  // salvataggio automatico dei referenti nella rubrica Google (serve il
  // browser dell'operatore per l'OAuth, quindi lo fa la pagina).
  if (nuovo === "attivo" && attuale.stato !== "attivo") {
    redirect(`/partner/${partnerId}?rubrica=1`);
  }
}

// Aggiunge o toglie una tipologia di interesse (multi-scelta).
// Un solo statement atomico: click rapidi ravvicinati non si perdono a vicenda
// come accadrebbe con leggi-array-poi-riscrivi.
export async function toggleInteresse(partnerId: string, fd: FormData) {
  const valore = String(fd.get("interesse") ?? "");
  if (!isInteresse(valore)) return;
  // Schema qualificato esplicitamente: via pgbouncer il search_path non è
  // garantito e "Partner" senza schema può risolvere nella tabella di
  // un'altra app del cluster (successo in produzione: errore 42703).
  await prisma.$executeRaw`
    UPDATE "anagrafiche"."Partner"
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

// Riconciliazione con HubSpot: collega (o scollega, con null) un'anagrafica
// alla company del CRM. Il vincolo unique su hubspotId impedisce di collegare
// la stessa company a due anagrafiche: in quel caso il collegamento passa
// all'anagrafica scelta per ultima.
export async function riconciliaHubspot(partnerId: string, hubspotId: string | null) {
  if (hubspotId) {
    // se la company era collegata altrove, libera il vecchio collegamento
    await prisma.partner.updateMany({
      where: { hubspotId, NOT: { id: partnerId } },
      data: { hubspotId: null },
    });
  }
  await prisma.partner.update({ where: { id: partnerId }, data: { hubspotId } });
  revalidatePath("/");
  revalidatePath("/sync-hubspot");
  revalidatePath(`/partner/${partnerId}`);
}

// Importa una company HubSpot come nuova anagrafica (bottone "+" del sync).
// Nasce come prospect in categoria "DA CLASSIFICARE" (il team la smista poi)
// già riconciliata. Se un'anagrafica con lo stesso nome+città esiste già,
// non si duplica: si collega e basta.
export async function importaDaHubspot(a: {
  id: string;
  nome: string;
  citta: string | null;
  telefono: string | null;
  dominio: string | null;
  ultimoContatto?: string | null;
}) {
  const esistente = await prisma.partner.findFirst({
    where: {
      OR: [
        { hubspotId: a.id },
        {
          nome: { equals: a.nome, mode: "insensitive" },
          ...(a.citta ? { citta: { equals: a.citta, mode: "insensitive" } } : { citta: null }),
        },
      ],
    },
  });
  if (esistente) {
    if (!esistente.hubspotId) {
      await prisma.partner.update({ where: { id: esistente.id }, data: { hubspotId: a.id } });
    }
  } else {
    await prisma.partner.create({
      data: {
        nome: a.nome,
        categoria: "DA CLASSIFICARE",
        stato: "prospect",
        citta: a.citta?.toUpperCase() ?? null,
        telefono: a.telefono,
        note: a.dominio ? `Sito: ${a.dominio}` : null,
        ultimaVisita:
          a.ultimoContatto && !isNaN(new Date(a.ultimoContatto).getTime())
            ? new Date(a.ultimoContatto)
            : null,
        fonte: "hubspot",
        hubspotId: a.id,
      },
    });
  }
  revalidatePath("/sync-hubspot");
  revalidatePath("/");
}

// Salvataggio della pagina di modifica: aggiorna i dati anagrafici e
// sostituisce integralmente i referenti con le righe compilate del form.
// Stato, interessi e archivio hanno i loro controlli dedicati e restano fuori.
export async function aggiornaPartner(partnerId: string, fd: FormData) {
  const testo = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const maiuscolo = (k: string) => testo(k)?.toUpperCase() ?? null;

  const nome = testo("nome");
  const categoria = maiuscolo("categoria");
  if (!nome || !categoria) redirect(`/partner/${partnerId}/modifica?errore=1`);

  const righeContatti = Number(fd.get("righeContatti")) || 0;
  const contatti = [];
  for (let i = 0; i < righeContatti; i++) {
    const c = {
      ruolo: testo(`c${i}-ruolo`)?.toUpperCase() ?? null,
      nome: testo(`c${i}-nome`),
      telefono: testo(`c${i}-telefono`),
      email: testo(`c${i}-email`),
    };
    if (c.ruolo || c.nome || c.telefono || c.email) contatti.push(c);
  }

  const ultimaVisita = testo("ultimaVisita");

  // Timbro di provenienza (ui + adesso) sui campi finanziari che cambiano:
  // così le API rispondono con `aggiornamenti` corretti e le app capiscono
  // quando il team ha aggiornato la fatturazione.
  const finInput: Record<string, string | null> = {
    pIva: testo("pIva"),
    codiceFiscale: testo("codiceFiscale"),
    pec: testo("pec"),
    codiceSdi: maiuscolo("codiceSdi"),
    iban: testo("iban")?.replace(/\s+/g, "").toUpperCase() ?? null,
    banca: testo("banca"),
    metodoPagamento: testo("metodoPagamento"),
    condizioniPagamento: testo("condizioniPagamento"),
    noteAmministrative: testo("noteAmministrative"),
    amministrazioneNome: testo("amministrazioneNome"),
    amministrazioneTelefono: testo("amministrazioneTelefono"),
    amministrazioneEmail: testo("amministrazioneEmail"),
  };
  const attuale = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!attuale) redirect("/");
  const provenienza = { ...((attuale.provenienza ?? {}) as Record<string, unknown>) };
  const adesso = new Date().toISOString();
  for (const [campo, valore] of Object.entries(finInput)) {
    if (valore !== (attuale[campo as keyof typeof attuale] ?? null)) {
      provenienza[campo] = { sistema: "ui", asOf: adesso };
    }
  }

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      provenienza: provenienza as Prisma.InputJsonValue,
      nome,
      categoria,
      ragioneSociale: testo("ragioneSociale"),
      citta: maiuscolo("citta"),
      provincia: maiuscolo("provincia"),
      regione: maiuscolo("regione"),
      indirizzo: testo("indirizzo"),
      email: testo("email"),
      telefono: testo("telefono"),
      pIva: testo("pIva"),
      codiceFiscale: testo("codiceFiscale"),
      account: maiuscolo("account"),
      note: testo("note"),
      ultimaVisita: ultimaVisita ? new Date(ultimaVisita) : null,
      // dati finanziari / fatturazione
      pec: testo("pec"),
      codiceSdi: maiuscolo("codiceSdi"),
      iban: testo("iban")?.replace(/\s+/g, "").toUpperCase() ?? null,
      banca: testo("banca"),
      metodoPagamento: testo("metodoPagamento"),
      condizioniPagamento: testo("condizioniPagamento"),
      noteAmministrative: testo("noteAmministrative"),
      amministrazioneNome: testo("amministrazioneNome"),
      amministrazioneTelefono: testo("amministrazioneTelefono"),
      amministrazioneEmail: testo("amministrazioneEmail"),
      contatti: { deleteMany: {}, create: contatti },
    },
  });
  // La fatturazione è della società: propaga i dati finanziari a tutte le sedi
  // della stessa insegna, così restano un unico set condiviso.
  await propagaDatiFinanziari(partnerId);
  revalidatePath("/");
  revalidatePath(`/partner/${partnerId}`);
  redirect(`/partner/${partnerId}`);
}

// Salvataggio della scheda contatto (/contatti/:id): aggiorna il singolo
// referente senza passare dal form completo dell'anagrafica.
export async function aggiornaContatto(contattoId: string, fd: FormData) {
  const testo = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const c = await prisma.contatto.update({
    where: { id: contattoId },
    data: {
      ruolo: testo("ruolo")?.toUpperCase() ?? null,
      nome: testo("nome"),
      telefono: testo("telefono"),
      email: testo("email"),
      nomeRubrica: testo("nomeRubrica"),
    },
    select: { partnerId: true },
  });
  revalidatePath("/contatti");
  revalidatePath(`/partner/${c.partnerId}`);
  redirect("/contatti?salvato=1");
}

// Riconciliazione referenti: sposta un contatto sotto l'anagrafica giusta
// (es. da un contenitore/holding all'insegna corretta). Non duplica, muove.
export async function spostaContatto(contattoId: string, nuovoPartnerId: string) {
  const c = await prisma.contatto.findUnique({ where: { id: contattoId }, select: { partnerId: true } });
  if (!c) return;
  const dest = await prisma.partner.findUnique({ where: { id: nuovoPartnerId }, select: { id: true } });
  if (!dest) return;
  await prisma.contatto.update({ where: { id: contattoId }, data: { partnerId: nuovoPartnerId } });
  revalidatePath("/riconciliazione");
  revalidatePath("/contatti");
  revalidatePath(`/partner/${c.partnerId}`);
  revalidatePath(`/partner/${nuovoPartnerId}`);
}

// Riassegnazione multipla: sposta più referenti alla stessa anagrafica in colpo solo.
export async function spostaContattiMulti(contattoIds: string[], nuovoPartnerId: string) {
  if (!contattoIds.length) return;
  const dest = await prisma.partner.findUnique({ where: { id: nuovoPartnerId }, select: { id: true } });
  if (!dest) return;
  await prisma.contatto.updateMany({ where: { id: { in: contattoIds } }, data: { partnerId: nuovoPartnerId } });
  revalidatePath("/riconciliazione");
  revalidatePath("/contatti");
  revalidatePath(`/partner/${nuovoPartnerId}`);
}

// Elimina un referente dalla scheda contatto (il form chiede conferma via
// campo dedicato: il bottone è separato dal salvataggio).
export async function eliminaContatto(contattoId: string) {
  const c = await prisma.contatto.delete({
    where: { id: contattoId },
    select: { partnerId: true },
  });
  revalidatePath("/contatti");
  revalidatePath(`/partner/${c.partnerId}`);
  redirect("/contatti?eliminato=1");
}

// Toglie il referente dall'anagrafica (bottone ✕ nella sezione Contatti della
// scheda). Un Contatto appartiene a una sola anagrafica: rimuovere
// l'associazione significa togliere la persona da quell'azienda.
export async function staccaContatto(contattoId: string) {
  const c = await prisma.contatto.delete({
    where: { id: contattoId },
    select: { partnerId: true },
  });
  revalidatePath(`/partner/${c.partnerId}`);
  revalidatePath("/contatti");
  revalidatePath("/");
}

// Raggruppa un'anagrafica sotto un'insegna madre (es. la sede di Milano sotto
// BOTTEGA VENETA). Niente cicli: la madre non può essere una sede della figlia,
// e chi ha già delle sedi non può diventare a sua volta una sede (un livello).
export async function raggruppaSotto(partnerId: string, capogruppoId: string | null) {
  if (capogruppoId) {
    if (capogruppoId === partnerId) return;
    const [madre, figlia] = await Promise.all([
      prisma.partner.findUnique({ where: { id: capogruppoId }, select: { capogruppoId: true } }),
      prisma.partner.count({ where: { capogruppoId: partnerId } }),
    ]);
    if (!madre) return;
    // la madre è già una sede di qualcun altro, oppure questa ha già sedi proprie
    if (madre.capogruppoId || figlia > 0) return;
  }
  await prisma.partner.update({ where: { id: partnerId }, data: { capogruppoId } });
  revalidatePath(`/partner/${partnerId}`);
  if (capogruppoId) revalidatePath(`/partner/${capogruppoId}`);
  revalidatePath("/");
}

// Risolve a mano una richiesta di aggancio: collega l'anagrafica scelta e,
// se la richiesta porta l'id dell'app, crea il riferimento esterno — così
// quell'app da lì in poi risolve per id.
export async function risolviRichiestaMatch(richiestaId: string, partnerId: string) {
  const r = await prisma.richiestaMatch.findUnique({ where: { id: richiestaId } });
  if (!r) return;
  if (r.idEsterno) {
    await prisma.riferimentoEsterno.upsert({
      where: { sistema_idEsterno: { sistema: r.sistema, idEsterno: r.idEsterno } },
      create: { partnerId, sistema: r.sistema, idEsterno: r.idEsterno },
      update: { partnerId },
    });
  }
  await prisma.richiestaMatch.update({ where: { id: richiestaId }, data: { partnerId, risolto: true } });
  revalidatePath("/match");
  revalidatePath("/");
}

// Archivia una richiesta senza collegarla (falso positivo, rumore).
export async function ignoraRichiestaMatch(richiestaId: string) {
  await prisma.richiestaMatch.update({ where: { id: richiestaId }, data: { risolto: true } });
  revalidatePath("/match");
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
