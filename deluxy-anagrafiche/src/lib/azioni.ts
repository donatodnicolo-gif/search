"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCategoria } from "./categorie";
import { prisma } from "./db";
import { MOTIVI_FEEDBACK, normalizzaVoto, ricalcolaValutazioneD2C } from "./feedback-d2c";
import { propagaDatiFinanziari } from "./insegna";
import { diffCampi, registraModifica, registraModifiche } from "./log-modifiche";
import {
  PREFISSO_ANALISI,
  PREFISSO_FINANZIARIO,
  STATO_FINANZIARIO_PREDEFINITO,
  isStato,
  isStatoAnalisi,
  isStatoFinanziario,
} from "./stati";
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

// Cambio dello stato FINANZIARIO (come paga l'azienda). Indipendente dallo
// stato commerciale: un partner attivo può essere insoluto e viceversa.
export async function cambiaStatoFinanziario(partnerId: string, fd: FormData) {
  const nuovo = String(fd.get("statoFinanziario") ?? "");
  if (!isStatoFinanziario(nuovo)) return;
  const attuale = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { statoFinanziario: true },
  });
  if (!attuale) return;
  await prisma.partner.update({ where: { id: partnerId }, data: { statoFinanziario: nuovo } });
  await registraPassaggio(
    partnerId,
    `${PREFISSO_FINANZIARIO}${attuale.statoFinanziario}`,
    `${PREFISSO_FINANZIARIO}${nuovo}`,
    "ui",
  );
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Cambio dello stato ANALISI (perimetro dell'anno: P.P. / Nuovo / Dismesso).
// Valore vuoto = "non analizzata", si torna indietro senza dover archiviare.
export async function cambiaStatoAnalisi(partnerId: string, fd: FormData) {
  const grezzo = String(fd.get("statoAnalisi") ?? "");
  const nuovo = grezzo === "" ? null : isStatoAnalisi(grezzo) ? grezzo : undefined;
  if (nuovo === undefined) return;
  const attuale = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { statoAnalisi: true },
  });
  if (!attuale) return;
  await prisma.partner.update({ where: { id: partnerId }, data: { statoAnalisi: nuovo } });
  await registraPassaggio(
    partnerId,
    `${PREFISSO_ANALISI}${attuale.statoAnalisi ?? ""}`,
    `${PREFISSO_ANALISI}${nuovo ?? ""}`,
    "ui",
  );
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Aggiunge o toglie una tipologia di interesse (multi-scelta).
// Un solo statement atomico: click rapidi ravvicinati non si perdono a vicenda
// come accadrebbe con leggi-array-poi-riscrivi.
export async function toggleInteresse(partnerId: string, fd: FormData) {
  // Il valore arriva dal menu, che mostra già solo linee valide (catalogo
  // Scout): niente validazione di rete qui, che rallenterebbe ogni click.
  const valore = String(fd.get("interesse") ?? "").trim();
  if (!valore) return;
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
  // Il log si scrive rileggendo: l'UPDATE è fatto in SQL con array_append/remove
  // e non torna il valore nuovo.
  const dopo = await prisma.partner.findUnique({ where: { id: partnerId }, select: { interessi: true } });
  await registraModifica(partnerId, { origine: "ui" }, {
    campo: "interessi",
    da: dopo?.interessi.includes(valore)
      ? dopo.interessi.filter((i) => i !== valore)
      : [...(dopo?.interessi ?? []), valore],
    a: dopo?.interessi ?? [],
  });
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
  if (!nome || !categoria || !isCategoria(categoria)) redirect("/partner/nuovo?errore=1");

  const stato = String(fd.get("stato") ?? "");
  const statoFinanziario = String(fd.get("statoFinanziario") ?? "");
  const statoAnalisi = String(fd.get("statoAnalisi") ?? "");
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
      statoFinanziario: isStatoFinanziario(statoFinanziario)
        ? statoFinanziario
        : STATO_FINANZIARIO_PREDEFINITO,
      statoAnalisi: isStatoAnalisi(statoAnalisi) ? statoAnalisi : null,
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
  await registraModifica(creato.id, { origine: "ui" }, { campo: "creata", a: `${nome}${citta ? ` · ${citta}` : ""}` });
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

  // Referenti: si aggiornano PER ID, non si cancellano e ricreano. La riga
  // porta con sé `c<i>-id` quando il referente esiste già; così restano
  // attaccati `hubspotId`, `fonte`, `nomeRubrica` e l'archiviazione, che il
  // form non conosce e che un delete+create buttava via a ogni salvataggio.
  // Riga svuotata = referente rimosso (comportamento storico, dichiarato nel form).
  const righeContatti = Number(fd.get("righeContatti")) || 0;
  const daCreare = [];
  const daAggiornare: { id: string; dati: Record<string, string | null> }[] = [];
  const daRimuovere: string[] = [];
  for (let i = 0; i < righeContatti; i++) {
    const id = String(fd.get(`c${i}-id`) ?? "").trim();
    const c = {
      ruolo: testo(`c${i}-ruolo`)?.toUpperCase() ?? null,
      nome: testo(`c${i}-nome`),
      telefono: testo(`c${i}-telefono`),
      email: testo(`c${i}-email`),
    };
    const compilata = Boolean(c.ruolo || c.nome || c.telefono || c.email);
    if (id) {
      if (compilata) daAggiornare.push({ id, dati: c });
      else daRimuovere.push(id);
    } else if (compilata) {
      daCreare.push({ ...c, fonte: "ui" });
    }
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
    gruppoPagamento: testo("gruppoPagamento"),
    noteAmministrative: testo("noteAmministrative"),
    amministrazioneNome: testo("amministrazioneNome"),
    amministrazioneTelefono: testo("amministrazioneTelefono"),
    amministrazioneEmail: testo("amministrazioneEmail"),
  };
  const attuale = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { contatti: true },
  });
  if (!attuale) redirect("/");
  // Fotografia dei referenti prima del salvataggio: serve al log per dire cosa
  // è cambiato su ognuno (dopo l'update i valori vecchi non ci sono più).
  const contattiPrima = attuale.contatti;
  const provenienza = { ...((attuale.provenienza ?? {}) as Record<string, unknown>) };
  const adesso = new Date().toISOString();
  for (const [campo, valore] of Object.entries(finInput)) {
    if (valore !== (attuale[campo as keyof typeof attuale] ?? null)) {
      provenienza[campo] = { sistema: "ui", asOf: adesso };
    }
  }

  // Valori nuovi dei campi dell'anagrafica, tenuti in una variabile perché
  // servono due volte: per scrivere e per fare il diff del log.
  const campiPartner = {
    nome,
    categoria,
    ragioneSociale: testo("ragioneSociale"),
    citta: maiuscolo("citta"),
    provincia: maiuscolo("provincia"),
    regione: maiuscolo("regione"),
    indirizzo: testo("indirizzo"),
    email: testo("email"),
    telefono: testo("telefono"),
    account: maiuscolo("account"),
    note: testo("note"),
    ultimaVisita: ultimaVisita ? new Date(ultimaVisita) : null,
    ...finInput,
  };

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
      gruppoPagamento: testo("gruppoPagamento"),
      noteAmministrative: testo("noteAmministrative"),
      amministrazioneNome: testo("amministrazioneNome"),
      amministrazioneTelefono: testo("amministrazioneTelefono"),
      amministrazioneEmail: testo("amministrazioneEmail"),
      contatti: {
        ...(daAggiornare.length
          ? { update: daAggiornare.map((c) => ({ where: { id: c.id }, data: c.dati })) }
          : {}),
        ...(daRimuovere.length ? { deleteMany: { id: { in: daRimuovere } } } : {}),
      },
    },
  });

  // I referenti nuovi si creano uno per uno invece che con la `create`
  // annidata: così se ne conosce l'id e il log si aggancia alla PERSONA —
  // altrimenti la sua scheda resterebbe senza storia.
  for (const c of daCreare) {
    const nuovo = await prisma.contatto.create({ data: { ...c, partnerId } });
    await registraModifica(partnerId, { origine: "ui", contattoId: nuovo.id, entita: "contatto" }, {
      campo: "creato",
      a: [c.nome, c.ruolo, c.telefono].filter(Boolean).join(" · "),
    });
  }
  // Log dei campi dell'anagrafica: solo quelli davvero cambiati.
  await registraModifiche(partnerId, { origine: "ui" }, diffCampi(attuale, campiPartner));
  for (const c of daAggiornare) {
    const prima = contattiPrima.find((x) => x.id === c.id);
    await registraModifiche(
      partnerId,
      { origine: "ui", contattoId: c.id, entita: "contatto" },
      diffCampi(prima, c.dati),
    );
  }
  for (const id of daRimuovere) {
    const prima = contattiPrima.find((x) => x.id === id);
    await registraModifica(partnerId, { origine: "ui", entita: "contatto" }, {
      campo: "eliminato",
      da: [prima?.nome, prima?.ruolo, prima?.telefono].filter(Boolean).join(" · ") || id,
    });
  }
  // La fatturazione è della società: propaga i dati finanziari a tutte le sedi
  // della stessa insegna, così restano un unico set condiviso.
  await propagaDatiFinanziari(partnerId);
  revalidatePath("/");
  revalidatePath(`/partner/${partnerId}`);
  redirect(`/partner/${partnerId}`);
}

// Aggiunge un referente a QUESTA anagrafica — cioè a questa sede, non
// all'insegna: due negozi della stessa insegna hanno persone diverse, e il
// referente sta dove lavora. Si fa dalla scheda, senza passare dal form
// completo (che tocca tutta l'anagrafica).
export async function aggiungiReferente(
  partnerId: string,
  fd: FormData,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const testo = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const dati = {
    ruolo: testo("ruolo")?.toUpperCase() ?? null,
    nome: testo("nome"),
    telefono: testo("telefono"),
    email: testo("email"),
  };
  if (!dati.nome && !dati.telefono && !dati.email) {
    return { ok: false, errore: "Serve almeno il nome, il telefono o l'email." };
  }
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false, errore: "Anagrafica non trovata." };
  const creato = await prisma.contatto.create({ data: { ...dati, partnerId, fonte: "ui" } });
  await registraModifica(partnerId, { origine: "ui", contattoId: creato.id, entita: "contatto" }, {
    campo: "creato",
    a: [dati.nome, dati.ruolo, dati.telefono, dati.email].filter(Boolean).join(" · "),
  });
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/contatti");
  return { ok: true };
}

// Aggiunge in un colpo solo più persone prese dalla rubrica Google. Chi è già
// fra i referenti (stesso telefono o stessa email) viene saltato invece che
// duplicato: dalla rubrica si pesca spesso due volte la stessa persona.
export async function aggiungiReferentiDaRubrica(
  partnerId: string,
  persone: { nome: string; telefono: string | null; email: string | null; ruolo: string | null }[],
): Promise<{ ok: true; aggiunti: number; saltati: number } | { ok: false; errore: string }> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false, errore: "Anagrafica non trovata." };

  const esistenti = await prisma.contatto.findMany({
    where: { partnerId },
    select: { telefono: true, email: true },
  });
  const soloCifre = (v: string | null) => (v ?? "").replace(/[^\d]/g, "").slice(-9);
  const telefoni = new Set(esistenti.map((c) => soloCifre(c.telefono)).filter(Boolean));
  const email = new Set(esistenti.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean));

  const daCreare = [];
  let saltati = 0;
  for (const p of persone) {
    const nome = (p.nome ?? "").trim() || null;
    const telefono = (p.telefono ?? "").trim() || null;
    const mail = (p.email ?? "").trim() || null;
    if (!nome && !telefono && !mail) continue;
    const tel = soloCifre(telefono);
    const em = (mail ?? "").toLowerCase();
    if ((tel && telefoni.has(tel)) || (em && email.has(em))) {
      saltati++;
      continue;
    }
    if (tel) telefoni.add(tel);
    if (em) email.add(em);
    daCreare.push({
      partnerId,
      nome,
      telefono,
      email: mail,
      ruolo: (p.ruolo ?? "").trim().toUpperCase() || null,
      fonte: "ui",
    });
  }
  // Uno per uno, non createMany: serve l'id per agganciare il log alla persona.
  for (const c of daCreare) {
    const nuovo = await prisma.contatto.create({ data: c });
    await registraModifica(partnerId, { origine: "ui", contattoId: nuovo.id, entita: "contatto" }, {
      campo: "creato",
      a: `${[c.nome, c.ruolo, c.telefono, c.email].filter(Boolean).join(" · ")} (dalla rubrica Google)`,
    });
  }
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/contatti");
  return { ok: true, aggiunti: daCreare.length, saltati };
}

// Sposta un referente da una sede all'altra della stessa insegna: capita
// spesso che una persona sia stata censita sulla madre e lavori invece in un
// negozio preciso. La destinazione arriva dal menu della riga.
export async function spostaReferenteInSede(contattoId: string, fd: FormData) {
  const destinazione = String(fd.get("destinazione") ?? "");
  if (!destinazione) return;
  await spostaContatto(contattoId, destinazione);
}

// Salvataggio della scheda contatto (/contatti/:id): aggiorna il singolo
// referente senza passare dal form completo dell'anagrafica.
export async function aggiornaContatto(contattoId: string, fd: FormData) {
  const testo = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const prima = await prisma.contatto.findUnique({ where: { id: contattoId } });
  const nuovi = {
    ruolo: testo("ruolo")?.toUpperCase() ?? null,
    nome: testo("nome"),
    telefono: testo("telefono"),
    email: testo("email"),
    nomeRubrica: testo("nomeRubrica"),
  };
  const c = await prisma.contatto.update({
    where: { id: contattoId },
    data: nuovi,
    select: { partnerId: true },
  });
  await registraModifiche(
    c.partnerId,
    { origine: "ui", contattoId, entita: "contatto" },
    diffCampi(prima, nuovi),
  );
  revalidatePath("/contatti");
  revalidatePath(`/partner/${c.partnerId}`);
  redirect("/contatti?salvato=1");
}

// Riconciliazione referenti: sposta un contatto sotto l'anagrafica giusta
// (es. da un contenitore/holding all'insegna corretta). Non duplica, muove.
export async function spostaContatto(contattoId: string, nuovoPartnerId: string) {
  const c = await prisma.contatto.findUnique({
    where: { id: contattoId },
    select: { partnerId: true, nome: true, partner: { select: { nome: true, citta: true } } },
  });
  if (!c) return;
  const dest = await prisma.partner.findUnique({
    where: { id: nuovoPartnerId },
    select: { id: true, nome: true, citta: true },
  });
  if (!dest) return;
  await prisma.contatto.update({ where: { id: contattoId }, data: { partnerId: nuovoPartnerId } });
  // Lo spostamento si scrive su ENTRAMBE le schede: da una il referente è
  // uscito, nell'altra è entrato, e da nessuna delle due si capirebbe da sola.
  const dove = (p: { nome: string; citta: string | null } | null | undefined) =>
    p ? [p.nome, p.citta].filter(Boolean).join(" · ") : "—";
  const persona = c.nome ?? "referente";
  await registraModifica(c.partnerId, { origine: "ui", contattoId, entita: "contatto" }, {
    campo: "spostato",
    da: persona,
    a: `verso ${dove(dest)}`,
  });
  await registraModifica(nuovoPartnerId, { origine: "ui", contattoId, entita: "contatto" }, {
    campo: "spostato",
    da: `da ${dove(c.partner)}`,
    a: persona,
  });
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
    select: { partnerId: true, nome: true, ruolo: true, telefono: true },
  });
  // Una cancellazione senza traccia è il buco più grosso di un registro:
  // il referente sparisce e non resta scritto da nessuna parte che c'era.
  await registraModifica(c.partnerId, { origine: "ui", entita: "contatto" }, {
    campo: "eliminato",
    da: [c.nome, c.ruolo, c.telefono].filter(Boolean).join(" · ") || contattoId,
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
    select: { partnerId: true, nome: true, ruolo: true, telefono: true },
  });
  await registraModifica(c.partnerId, { origine: "ui", entita: "contatto" }, {
    campo: "eliminato",
    da: [c.nome, c.ruolo, c.telefono].filter(Boolean).join(" · ") || contattoId,
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
  const [prima, madreNuova] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: partnerId },
      select: { nome: true, citta: true, capogruppo: { select: { id: true, nome: true } } },
    }),
    capogruppoId
      ? prisma.partner.findUnique({ where: { id: capogruppoId }, select: { nome: true } })
      : Promise.resolve(null),
  ]);
  await prisma.partner.update({ where: { id: partnerId }, data: { capogruppoId } });
  const sede = [prima?.nome, prima?.citta].filter(Boolean).join(" · ");
  await registraModifica(partnerId, { origine: "ui" }, {
    campo: "capogruppoId",
    da: prima?.capogruppo?.nome,
    a: madreNuova?.nome,
  });
  // Anche sulla scheda della madre: è lì che si guarda l'elenco delle sedi.
  if (capogruppoId) {
    await registraModifica(capogruppoId, { origine: "ui", entita: "sede" }, { campo: "sede_collegata", a: sede });
  }
  if (prima?.capogruppo?.id && prima.capogruppo.id !== capogruppoId) {
    await registraModifica(prima.capogruppo.id, { origine: "ui", entita: "sede" }, {
      campo: "sede_sganciata",
      da: sede,
    });
  }
  revalidatePath(`/partner/${partnerId}`);
  if (capogruppoId) revalidatePath(`/partner/${capogruppoId}`);
  revalidatePath("/");
}

// Aggiunge una sede a un'insegna: crea una nuova anagrafica già collegata alla
// madre. Serve per le insegne con più luoghi — anche **due negozi nella stessa
// città**, che è il caso che il duplicato-guard di `creaPartner` bloccherebbe:
// qui a distinguerli è l'indirizzo, non la città.
// La sede eredita categoria, stati e interessi della madre (è la stessa
// azienda) e, via `propagaDatiFinanziari`, tutta la fatturazione — gruppo di
// pagamento compreso.
export async function aggiungiSede(
  madreId: string,
  fd: FormData,
): Promise<{ ok: true; id: string } | { ok: false; errore: string }> {
  const testo = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const maiuscolo = (k: string) => testo(k)?.toUpperCase() ?? null;

  const madre = await prisma.partner.findUnique({ where: { id: madreId } });
  if (!madre) return { ok: false, errore: "Insegna non trovata." };
  if (!madre.attivo) return { ok: false, errore: "L'insegna è archiviata: ripristinala prima di aggiungere sedi." };
  // Il gruppo è a un livello solo: una sede non può avere sedi proprie.
  if (madre.capogruppoId) {
    return { ok: false, errore: "Questa anagrafica è già una sede: aggiungi le altre sedi dall'insegna madre." };
  }

  const nome = testo("nome") ?? madre.nome;
  const citta = maiuscolo("citta") ?? madre.citta;
  const indirizzo = testo("indirizzo");

  const gemella = await prisma.partner.findFirst({
    where: {
      attivo: true,
      nome: { equals: nome, mode: "insensitive" },
      ...(citta ? { citta: { equals: citta, mode: "insensitive" } } : { citta: null }),
      ...(indirizzo ? { indirizzo: { equals: indirizzo, mode: "insensitive" } } : { indirizzo: null }),
    },
    select: { id: true },
  });
  if (gemella) {
    return {
      ok: false,
      errore: indirizzo
        ? "Esiste già una sede con questo nome, città e indirizzo."
        : "Esiste già una sede con questo nome e città: scrivi l'indirizzo per distinguerla.",
    };
  }

  const sede = await prisma.partner.create({
    data: {
      nome,
      categoria: madre.categoria,
      stato: madre.stato,
      statoFinanziario: madre.statoFinanziario,
      statoAnalisi: madre.statoAnalisi,
      interessi: madre.interessi,
      citta,
      provincia: maiuscolo("provincia") ?? madre.provincia,
      regione: maiuscolo("regione") ?? madre.regione,
      indirizzo,
      ragioneSociale: madre.ragioneSociale,
      email: testo("email"),
      telefono: testo("telefono"),
      account: madre.account,
      capogruppoId: madre.id,
      fonte: "ui",
    },
  });
  const etichettaSede = [nome, citta, indirizzo].filter(Boolean).join(" · ");
  await registraModifica(madre.id, { origine: "ui", entita: "sede" }, {
    campo: "sede_creata",
    a: etichettaSede,
  });
  await registraModifica(sede.id, { origine: "ui" }, {
    campo: "creata",
    a: `${etichettaSede} — come sede di ${madre.nome}`,
  });
  // La fatturazione è della società: la sede nuova parte con gli stessi dati.
  await propagaDatiFinanziari(madre.id);
  revalidatePath(`/partner/${madre.id}`);
  revalidatePath("/");
  return { ok: true, id: sede.id };
}

// Collega un'anagrafica che esiste già come sede dell'insegna. Stessa cosa di
// `raggruppaSotto` vista dal lato della madre, ma dice *perché* non si può
// quando non si può, invece di non fare niente.
export async function collegaSede(
  madreId: string,
  sedeId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  if (madreId === sedeId) return { ok: false, errore: "Un'insegna non può essere sede di sé stessa." };
  const [madre, sede, sediDellaSede] = await Promise.all([
    prisma.partner.findUnique({ where: { id: madreId }, select: { capogruppoId: true } }),
    prisma.partner.findUnique({ where: { id: sedeId }, select: { capogruppoId: true, nome: true } }),
    prisma.partner.count({ where: { capogruppoId: sedeId } }),
  ]);
  if (!madre || !sede) return { ok: false, errore: "Anagrafica non trovata." };
  if (madre.capogruppoId) {
    return { ok: false, errore: "Questa anagrafica è già una sede: aggiungi le altre sedi dall'insegna madre." };
  }
  if (sediDellaSede > 0) {
    return {
      ok: false,
      errore: `«${sede.nome}» ha già sedi proprie: i gruppi sono a un livello solo, sganciale prima.`,
    };
  }
  await prisma.partner.update({ where: { id: sedeId }, data: { capogruppoId: madreId } });
  const madreNome = await prisma.partner.findUnique({ where: { id: madreId }, select: { nome: true } });
  await registraModifica(madreId, { origine: "ui", entita: "sede" }, {
    campo: "sede_collegata",
    a: sede.nome,
  });
  await registraModifica(sedeId, { origine: "ui" }, { campo: "capogruppoId", a: madreNome?.nome });
  await propagaDatiFinanziari(madreId);
  revalidatePath(`/partner/${madreId}`);
  revalidatePath(`/partner/${sedeId}`);
  revalidatePath("/");
  return { ok: true };
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

// ————————————————————— Valutazione D2C —————————————————————
// Giudizio interno registrato a mano dalla scheda: lo scrive chi ha seguito
// l'ordine o gestito il caso. Stessa tabella e stesso ricalcolo dei feedback
// che arrivano dalle app interne: la sorgente resta nel campo `sistema` ("ui"),
// chi ha valutato in `autore`.
export async function registraFeedbackD2C(partnerId: string, fd: FormData) {
  const testo = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const voto = normalizzaVoto(fd.get("voto"));
  if (voto == null) return;

  const dataGrezza = testo("data");
  const dataFeedback = dataGrezza ? new Date(dataGrezza) : new Date();
  if (isNaN(dataFeedback.getTime())) return;

  const motivi = fd
    .getAll("motivi")
    .map((m) => String(m))
    .filter((m) => (MOTIVI_FEEDBACK as readonly string[]).includes(m));

  await prisma.feedbackD2C.create({
    data: {
      partnerId,
      voto,
      votoOriginale: voto,
      scala: 5,
      origine: testo("origine")?.toLowerCase() ?? "consegna",
      sistema: "ui",
      ordine: testo("ordine"),
      autore: testo("autore"),
      commento: testo("commento"),
      motivi,
      dataFeedback,
    },
  });
  await registraModifica(partnerId, { origine: "ui", autore: testo("autore"), entita: "feedback" }, {
    campo: "feedback_aggiunto",
    a: [`${voto}/5`, testo("origine"), testo("ordine")].filter(Boolean).join(" · "),
  });
  await ricalcolaValutazioneD2C(partnerId);
  revalidatePath(`/partner/${partnerId}`);
  revalidatePath("/");
}

// Cancella un feedback (inserito per errore, o ritirato dal cliente) e
// ricalcola la pagella del partner.
export async function eliminaFeedbackD2C(feedbackId: string) {
  const f = await prisma.feedbackD2C.delete({
    where: { id: feedbackId },
    select: { partnerId: true, voto: true, origine: true, dataFeedback: true },
  });
  await registraModifica(f.partnerId, { origine: "ui", entita: "feedback" }, {
    campo: "feedback_eliminato",
    da: [`${f.voto}/5`, f.origine, f.dataFeedback.toISOString().slice(0, 10)].filter(Boolean).join(" · "),
  });
  await ricalcolaValutazioneD2C(f.partnerId);
  revalidatePath(`/partner/${f.partnerId}`);
  revalidatePath("/");
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

// ─── RICONCILIAZIONI ────────────────────────────────────────────────────────
// Un disaccordo fra il registro e una fonte esterna (il tracker Excel) su un
// singolo campo. Lo script di import li registra invece di risolverli da sé:
// «Corso Matteotti 1» contro «Via Albricci 9» può essere un trasloco, un
// secondo negozio o un errore di battitura, e la differenza la conosce solo
// chi ci è stato.

const CAMPI_RICONCILIABILI = new Set(["indirizzo", "provincia", "account", "citta", "regione"]);

/**
 * Accetta la proposta: il valore della fonte esterna **viene scritto**
 * sull'anagrafica e la riga si chiude.
 *
 * La whitelist dei campi non è un vezzo: il nome del campo arriva da una riga
 * di database, e passarlo a Prisma senza controllarlo vorrebbe dire lasciare
 * scrivere qualunque colonna a chi riesce a inserire una riconciliazione.
 */
export async function accettaRiconciliazione(id: string) {
  const r = await prisma.riconciliazione.findUniqueOrThrow({ where: { id } });
  if (!CAMPI_RICONCILIABILI.has(r.campo)) throw new Error(`Campo non riconciliabile: ${r.campo}`);
  await prisma.partner.update({
    where: { id: r.partnerId },
    data: { [r.campo]: r.valoreProposto },
  });
  await prisma.riconciliazione.update({
    where: { id },
    data: { stato: "accettata", decisoDa: "ui", decisoIl: new Date() },
  });
  revalidatePath("/riconciliazioni");
  revalidatePath(`/partner/${r.partnerId}`);
}

/** Tiene il valore del registro: non si scrive niente sull'anagrafica, la riga
 *  si chiude. Resta a storico, così lo stesso disaccordo non si ripresenta a
 *  ogni import. */
export async function rifiutaRiconciliazione(id: string) {
  const r = await prisma.riconciliazione.update({
    where: { id },
    data: { stato: "rifiutata", decisoDa: "ui", decisoIl: new Date() },
  });
  revalidatePath("/riconciliazioni");
  revalidatePath(`/partner/${r.partnerId}`);
}

/** Rimette in discussione una riga già decisa (ci si ripensa). */
export async function riapriRiconciliazione(id: string) {
  await prisma.riconciliazione.update({
    where: { id },
    data: { stato: "aperta", decisoDa: null, decisoIl: null },
  });
  revalidatePath("/riconciliazioni");
}
