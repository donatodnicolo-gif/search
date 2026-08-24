import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { segnalaClienteAFinance } from "@/lib/finance";
import { CAMPI_FINANZIARI, propagaDatiFinanziari } from "@/lib/insegna";
import { INTERESSE_AFFILIAZIONE, eFinance, eRicercaFornitori } from "@/lib/interessi";
import { diffCampi, registraModifica, registraModifiche } from "@/lib/log-modifiche";
import { calcolaMerge, mergeContatti, nomeSistema, provenienzaIniziale } from "@/lib/merge";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";
import { whereRicerca } from "@/lib/ricerca";
import { PREFISSO_ANALISI, PREFISSO_FINANZIARIO, PREFISSO_FORNITORE, PREFISSO_LIVELLO, normalizzaStatoAnalisi } from "@/lib/stati";
import { registraPassaggio } from "@/lib/storico";

// La fatturazione è della società: se una scrittura ha toccato campi
// finanziari, i valori vanno copiati sulle altre sedi della stessa insegna.
async function propagaSeFinanziari(partnerId: string, scritti: Record<string, unknown>) {
  if ((CAMPI_FINANZIARI as readonly string[]).some((c) => c in scritti)) {
    await propagaDatiFinanziari(partnerId);
  }
}

const INCLUDE = { contatti: true, riferimenti: true } as const;

// Registra i riferimenti esterni (sistema→id) per la risoluzione futura.
async function registraRiferimenti(
  partnerId: string,
  refs: { sistema: string; idEsterno?: string | null }[],
) {
  for (const r of refs) {
    if (!r.idEsterno) continue;
    await prisma.riferimentoEsterno.upsert({
      where: { sistema_idEsterno: { sistema: r.sistema, idEsterno: r.idEsterno } },
      create: { partnerId, sistema: r.sistema, idEsterno: r.idEsterno },
      update: { partnerId },
    });
  }
}

// GET /api/v1/partners — elenco con filtri e paginazione.
// Filtri: q (ricerca a parole su tutti i campi e i contatti), categoria, citta,
// provincia, regione, stato (commerciale), statoFinanziario, statoAnalisi
// (`nessuno` = mai analizzata), statoFornitore (`nessuno` = chi non ci
// fornisce), fonte, platformId, votoD2CMin/votoD2CMax,
// feedbackD2C (`si`/`nessuno`), attivo (default: solo attivi; attivo=tutti per
// tutto).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: Prisma.PartnerWhereInput = {};

  const q = p.get("q")?.trim();
  if (q) where.AND = whereRicerca(q);
  for (const campo of [
    "categoria",
    "citta",
    "provincia",
    "regione",
    "stato",
    "livello",
    "statoFinanziario",
    "fonte",
  ] as const) {
    const v = p.get(campo)?.trim();
    if (v) where[campo] = campo === "categoria" ? v.toUpperCase() : v;
  }
  // Stato fornitore: `nessuno` = chi non è un nostro fornitore (colonna vuota).
  const statoFornitore = p.get("statoFornitore")?.trim();
  if (statoFornitore) {
    where.statoFornitore = statoFornitore === "nessuno" ? null : statoFornitore;
  }
  // Stato analisi: accetta gli slug del registro, le forme di FINANCE
  // ("P.P.", "Nuovo", …) e `nessuno` per le anagrafiche mai analizzate.
  const statoAnalisi = p.get("statoAnalisi")?.trim();
  if (statoAnalisi) {
    where.statoAnalisi = statoAnalisi === "nessuno" ? null : normalizzaStatoAnalisi(statoAnalisi) ?? statoAnalisi;
  }
  // `statoCommerciale` è il sinonimo esplicito di `stato`
  const statoCommerciale = p.get("statoCommerciale")?.trim();
  if (statoCommerciale && !where.stato) where.stato = statoCommerciale;
  const platformId = p.get("platformId")?.trim();
  if (platformId) where.platformId = platformId;

  // Valutazione D2C: `votoD2CMin`/`votoD2CMax` filtrano su chi un voto ce l'ha;
  // `feedbackD2C=nessuno` isola i partner mai valutati (≠ voto basso) e
  // `feedbackD2C=si` quelli che hanno almeno un feedback.
  const filtroVoto: Prisma.FloatNullableFilter = {};
  const votoMin = Number(p.get("votoD2CMin"));
  const votoMax = Number(p.get("votoD2CMax"));
  if (p.get("votoD2CMin") && isFinite(votoMin)) filtroVoto.gte = votoMin;
  if (p.get("votoD2CMax") && isFinite(votoMax)) filtroVoto.lte = votoMax;
  if (Object.keys(filtroVoto).length > 0) where.votoD2C = filtroVoto;
  const feedbackD2C = p.get("feedbackD2C")?.trim();
  if (feedbackD2C === "nessuno") where.numeroFeedbackD2C = 0;
  if (feedbackD2C === "si") where.numeroFeedbackD2C = { gt: 0 };

  const attivo = p.get("attivo");
  if (attivo !== "tutti") where.attivo = attivo === "false" ? false : true;

  const pagina = Math.max(1, Number(p.get("page")) || 1);
  const perPagina = Math.min(200, Math.max(1, Number(p.get("perPage")) || 50));

  const [totale, dati] = await Promise.all([
    prisma.partner.count({ where }),
    prisma.partner.findMany({
      where,
      include: INCLUDE,
      orderBy: { nome: "asc" },
      skip: (pagina - 1) * perPagina,
      take: perPagina,
    }),
  ]);

  return NextResponse.json({
    totale,
    pagina,
    perPagina,
    dati: dati.map(serializzaPartner),
  });
}

// POST /api/v1/partners — upsert-merge (richiede chiave con scrittura).
// Identità risolta in cascata: riferimento esterno (sistema+idEsterno) →
// platformId → P.IVA/CF → nome+città. Se il record esiste, i campi vengono
// fusi secondo le regole di proprietà (curati dal team = bloccati; fattuali =
// vince il più fresco/autorevole; note e referenti = additivi). Body opzionale:
// `sistema`, `idEsterno` (l'id dell'app chiamante), `asOf` (freschezza ISO).
export async function POST(req: NextRequest) {
  const client = await autentica(req, { partner: true });
  if (client instanceof NextResponse) return client;
  // Un driver di prima parte (scope partner, es. Scout) può impostare
  // stato/interessi; le chiavi di scrittura generica no (restano curati dal team).
  const sbloccaCurati = client.scritturaPartner;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaPartner(body, true);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);
  const { dati, contatti } = risultato;

  const sistema = nomeSistema(client.nome, typeof body.sistema === "string" ? body.sistema : undefined);
  const idEsterno = typeof body.idEsterno === "string" ? body.idEsterno.trim() : undefined;
  const asOf = typeof body.asOf === "string" ? body.asOf : undefined;
  const platformId = typeof dati.platformId === "string" ? dati.platformId : undefined;
  const hubspotId = typeof dati.hubspotId === "string" ? dati.hubspotId : undefined;

  // --- Cascata di identità ---
  let esistente: Awaited<ReturnType<typeof prisma.partner.findFirst>> = null;
  if (idEsterno) {
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: { sistema_idEsterno: { sistema, idEsterno } },
      include: { partner: true },
    });
    esistente = ref?.partner ?? null;
  }
  if (!esistente && platformId) {
    esistente = await prisma.partner.findUnique({ where: { platformId } });
  }
  if (!esistente && typeof dati.pIva === "string" && dati.pIva) {
    esistente = await prisma.partner.findFirst({ where: { pIva: dati.pIva } });
  }
  if (!esistente && typeof dati.codiceFiscale === "string" && dati.codiceFiscale) {
    esistente = await prisma.partner.findFirst({ where: { codiceFiscale: dati.codiceFiscale } });
  }
  if (!esistente && typeof dati.nome === "string") {
    esistente = await prisma.partner.findFirst({
      where: {
        nome: { equals: dati.nome, mode: "insensitive" },
        ...(typeof dati.citta === "string" && dati.citta
          ? { citta: { equals: dati.citta, mode: "insensitive" } }
          : { citta: null }),
      },
    });
  }

  const refs = [
    { sistema, idEsterno },
    { sistema: "platform", idEsterno: platformId },
    { sistema: "hubspot", idEsterno: hubspotId },
  ];

  if (esistente) {
    // Questi campi non passano dal merge: identità (xref), fonte (creatore) e
    // attivo (una scrittura di sync non resuscita né archivia un'anagrafica).
    const mergeInput = { ...dati };
    delete mergeInput.platformId;
    delete mergeInput.hubspotId;
    delete mergeInput.fonte;
    delete mergeInput.attivo;

    const { dati: datiMerge, provenienza, ignorati } = calcolaMerge(esistente, mergeInput, sistema, asOf, { sbloccaCurati });

    let contattiWrite: Prisma.ContattoUpdateManyWithoutPartnerNestedInput | undefined;
    if (contatti) {
      const esistentiC = await prisma.contatto.findMany({ where: { partnerId: esistente.id } });
      const ops = mergeContatti(esistentiC, contatti, sistema);
      contattiWrite = { create: ops.create, update: ops.update };
    }

    await prisma.partner.update({
      where: { id: esistente.id },
      data: {
        ...datiMerge,
        provenienza: provenienza as Prisma.InputJsonValue,
        ...(contattiWrite ? { contatti: contattiWrite } : {}),
      },
    });
    // Log delle modifiche: quali campi ha davvero cambiato QUESTA app.
    // `datiMerge` contiene solo ciò che il merge ha applicato, quindi il diff
    // non registra i campi che la sorgente ha mandato ma ha perso il confronto.
    await registraModifiche(esistente.id, { origine: sistema }, diffCampi(esistente, datiMerge));
    await registraRiferimenti(esistente.id, refs);
    // Audit dei cambi di stato: commerciale (solo driver di prima parte),
    // finanziario e analisi (FINANCE) finiscono tutti nella stessa storia.
    if (typeof datiMerge.stato === "string" && datiMerge.stato !== esistente.stato) {
      await registraPassaggio(esistente.id, esistente.stato, datiMerge.stato, sistema);
      // Diventata cliente da un'altra app (Scout dichiara "cliente"): deve
      // esistere anche in FINANCE, come se fosse stata attivata da qui.
      if (datiMerge.stato === "attivo") {
        await segnalaClienteAFinance(esistente.id, esistente.nome);
      }
    }
    if (typeof datiMerge.livello === "string" && datiMerge.livello !== esistente.livello) {
      await registraPassaggio(
        esistente.id,
        `${PREFISSO_LIVELLO}${esistente.livello ?? ""}`,
        `${PREFISSO_LIVELLO}${datiMerge.livello}`,
        sistema,
      );
    }
    if (
      typeof datiMerge.statoFinanziario === "string" &&
      datiMerge.statoFinanziario !== esistente.statoFinanziario
    ) {
      await registraPassaggio(
        esistente.id,
        `${PREFISSO_FINANZIARIO}${esistente.statoFinanziario}`,
        `${PREFISSO_FINANZIARIO}${datiMerge.statoFinanziario}`,
        sistema,
      );
    }
    if (
      typeof datiMerge.statoAnalisi === "string" &&
      datiMerge.statoAnalisi !== esistente.statoAnalisi
    ) {
      await registraPassaggio(
        esistente.id,
        `${PREFISSO_ANALISI}${esistente.statoAnalisi ?? ""}`,
        `${PREFISSO_ANALISI}${datiMerge.statoAnalisi}`,
        sistema,
      );
    }
    if (
      typeof datiMerge.statoFornitore === "string" &&
      datiMerge.statoFornitore !== esistente.statoFornitore
    ) {
      await registraPassaggio(
        esistente.id,
        `${PREFISSO_FORNITORE}${esistente.statoFornitore ?? ""}`,
        `${PREFISSO_FORNITORE}${datiMerge.statoFornitore}`,
        sistema,
      );
    }
    await propagaSeFinanziari(esistente.id, datiMerge);
    // Chi passa dall'app di ricerca fornitori è un affiliato: l'interesse si
    // aggiunge (push), senza toccare quelli già scelti dal team.
    const interessiOra = Array.isArray(datiMerge.interessi)
      ? (datiMerge.interessi as string[])
      : esistente.interessi;
    if (eRicercaFornitori(sistema) && !interessiOra.includes(INTERESSE_AFFILIAZIONE)) {
      await prisma.partner.update({
        where: { id: esistente.id },
        data: { interessi: { push: INTERESSE_AFFILIAZIONE } },
      });
    }
    // Chi arriva dall'app di ricerca fornitori è un fornitore SEGNALATO
    // (24/08/2026): il campo si riempie da sé, ma solo se è VUOTO — un
    // «abituale» o un «da evitare» non tornano «segnalato» perché l'app
    // l'ha rimandato, e se la scrittura porta già uno statoFornitore suo
    // ci ha pensato il merge qui sopra.
    if (
      eRicercaFornitori(sistema) &&
      !esistente.statoFornitore &&
      typeof datiMerge.statoFornitore !== "string"
    ) {
      await prisma.partner.update({
        where: { id: esistente.id },
        data: { statoFornitore: "segnalato" },
      });
      await registraPassaggio(
        esistente.id,
        `${PREFISSO_FORNITORE}`,
        `${PREFISSO_FORNITORE}segnalato`,
        sistema,
      );
    }
    const aggiornato = await prisma.partner.findUnique({ where: { id: esistente.id }, include: INCLUDE });
    return NextResponse.json({
      esito: "merged",
      ...serializzaPartner(aggiornato!),
      applicati: Object.keys(datiMerge),
      in_revisione: ignorati,
    });
  }

  // Nessun aggancio: nuova anagrafica. Di norma nasce come prospect (stato,
  // interessi e account li decide il team). Un driver di prima parte (Scout)
  // può invece dichiararne stato e interessi già alla creazione.
  const datiCreate = { ...dati };
  if (!sbloccaCurati) {
    delete datiCreate.stato;
    delete datiCreate.interessi;
  }
  // Eccezione ai curati: un'anagrafica che nasce da FINANCE è già un cliente.
  // Lì dentro ci finiscono le aziende a cui si fattura e da cui si incassa: se
  // FINANCE la conosce, commercialmente non è un prospect da coltivare. Solo
  // alla creazione, e solo se non ha già detto lui che stato ha.
  if (eFinance(sistema) && !datiCreate.stato) {
    datiCreate.stato = "attivo";
  }
  // Eccezione ai curati: un'anagrafica che nasce dall'app di ricerca fornitori
  // è un'affiliazione, quindi l'interesse lo mette il registro da sé.
  if (eRicercaFornitori(sistema)) {
    const gia = Array.isArray(datiCreate.interessi) ? (datiCreate.interessi as string[]) : [];
    datiCreate.interessi = [...new Set([...gia, INTERESSE_AFFILIAZIONE])];
    // ...e nasce fornitore «segnalato» (24/08/2026), se l'app non ha già
    // dichiarato uno stato fornitore più preciso.
    if (typeof datiCreate.statoFornitore !== "string") {
      datiCreate.statoFornitore = "segnalato";
    }
  }
  delete datiCreate.account;
  delete datiCreate.attivo;
  const fonte = typeof dati.fonte === "string" && dati.fonte ? dati.fonte : sistema === "platform" ? "platform" : sistema;
  const creato = await prisma.partner.create({
    data: {
      ...datiCreate,
      fonte,
      provenienza: provenienzaIniziale(datiCreate, sistema, asOf) as Prisma.InputJsonValue,
      contatti: contatti ? { create: contatti.map((c) => ({ ...c, fonte: sistema })) } : undefined,
    },
  });
  await registraModifica(creato.id, { origine: sistema }, {
    campo: "creata",
    a: [creato.nome, creato.citta].filter(Boolean).join(" · "),
  });
  await registraRiferimenti(creato.id, refs);
  // Audit: se nasce già con uno stato non-prospect (driver di prima parte)
  if (typeof datiCreate.stato === "string" && datiCreate.stato !== "prospect") {
    await registraPassaggio(creato.id, "creazione", datiCreate.stato, sistema);
  }
  // Audit: se nasce già fornitore (regola «segnalato» o valore dell'app)
  if (typeof datiCreate.statoFornitore === "string") {
    await registraPassaggio(
      creato.id,
      `${PREFISSO_FORNITORE}`,
      `${PREFISSO_FORNITORE}${datiCreate.statoFornitore}`,
      sistema,
    );
  }
  await propagaSeFinanziari(creato.id, datiCreate);
  const creatoFull = await prisma.partner.findUnique({ where: { id: creato.id }, include: INCLUDE });
  return NextResponse.json({ esito: "creato", ...serializzaPartner(creatoFull!) }, { status: 201 });
}
