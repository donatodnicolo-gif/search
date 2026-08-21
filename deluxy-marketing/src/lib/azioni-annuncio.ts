"use server";

import { chiediAllAi } from "@/lib/ai";
import { prisma } from "@/lib/db";

// «Crea con AI»: un annuncio responsive nuovo (15 titoli, 4 descrizioni) per
// un gruppo, scritto dall'AI a partire da ciò che quel gruppo già compra e
// vende — keyword, ricerche vere, testi esistenti e destinazione.
//
// ⚠️ PROPONE soltanto: qui non si scrive niente né sull'app né su Google.
// Creare un annuncio non è fra le operazioni che lo script sa eseguire, e
// dirlo è parte della risposta: i testi si copiano in Google Ads.

export type EsitoAnnuncioAi =
  | {
      ok: true;
      titoli: string[];
      descrizioni: string[];
      note: string | null;
      modello: string;
    }
  | { ok: false; errore: string };

const SCHEMA_ANNUNCIO = {
  type: "object",
  additionalProperties: false,
  required: ["titoli", "descrizioni"],
  properties: {
    titoli: { type: "array", items: { type: "string" } },
    descrizioni: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
} as const;

export async function creaAnnuncioConAi(input: {
  gruppoId: string;
  indicazione: string;
  // Le funzioni di Google fra graffe: inserimento keyword, countdown,
  // personalizzatori. Chi le vuole lo dice: se sono spente l'AI non le usa.
  conFunzioniGoogle: boolean;
}): Promise<EsitoAnnuncioAi> {
  const gruppo = await prisma.gruppo.findUnique({
    where: { id: input.gruppoId },
    select: { nome: true, lingua: true, campagna: { select: { nome: true, brand: true } } },
  });
  if (!gruppo) return { ok: false, errore: "Gruppo non trovato." };

  const [keyword, ricerche, testi, destinazioni] = await Promise.all([
    prisma.copyAnnuncio.findMany({
      where: {
        tipo: "keyword",
        campagna: gruppo.campagna.nome,
        gruppo: { contains: gruppo.nome },
        stato: { not: "defunta" },
      },
      orderBy: { spesa: { sort: "desc", nulls: "last" } },
      take: 25,
      select: { testo: true, spesa: true, incasso: true, conversioni: true },
    }),
    prisma.termineRicerca.findMany({
      where: { gruppo: { contains: gruppo.nome }, conversioni: { gt: 0 } },
      orderBy: { ricavi: { sort: "desc", nulls: "last" } },
      take: 20,
      select: { testo: true, conversioni: true, ricavi: true },
    }),
    prisma.copyAnnuncio.findMany({
      where: {
        tipo: { in: ["titolo", "descrizione"] },
        campagna: gruppo.campagna.nome,
        gruppo: { contains: gruppo.nome },
      },
      take: 60,
      select: { tipo: true, testo: true, rendimento: true },
    }),
    prisma.copyAnnuncio.findMany({
      where: { tipo: "destinazione", campagna: gruppo.campagna.nome, gruppo: { contains: gruppo.nome } },
      take: 5,
      select: { finalUrl: true, testo: true },
    }),
  ]);

  const esito = await chiediAllAi({
    istruzioni: [
      "Scrivi UN annuncio responsive della rete di ricerca (RSA) per il gruppo indicato.",
      "Regole, tutte vincolanti:",
      "- Esattamente 15 titoli (max 30 caratteri l'uno) e 4 descrizioni (max 90 caratteri l'una). Conta i caratteri: un titolo di 31 viene troncato da Google.",
      "- Nella lingua del gruppo, la stessa delle keyword e dei testi esistenti.",
      "- I titoli devono coprire angoli DIVERSI (prodotto, consegna, occasione, prova sociale, chiamata all'azione): quindici modi di dire la stessa cosa non servono a Google, che li ruota.",
      "- Usa il vocabolario delle keyword e delle ricerche che convertono: sono le parole con cui la gente cerca davvero.",
      "- NON ripetere alla lettera i titoli già esistenti passati nei dati; possono ispirare, non essere copiati.",
      "- Niente superlativi non verificabili («il migliore d'Italia»), niente promesse su prezzi o tempi che non risultano dai dati, niente MAIUSCOLO integrale, niente punti esclamativi multipli.",
      input.conFunzioniGoogle
        ? "- PUOI usare le funzioni dinamiche di Google in AL MASSIMO 2 titoli, scritte esattamente così: {KeyWord:Testo di riserva} (il testo di riserva deve stare in 30 caratteri da solo). Non usarle nelle descrizioni."
        : "- NON usare le funzioni dinamiche di Google fra graffe ({KeyWord:…}, {COUNTDOWN…}, {CUSTOMIZER…}): scrivi solo testo normale.",
      "In `note` scrivi UNA riga su come hai diviso gli angoli. Rispondi solo in JSON.",
    ].join("\n"),
    dati: {
      campagna: gruppo.campagna.nome,
      gruppo: gruppo.nome,
      brand: gruppo.campagna.brand,
      linguaDelGruppo: gruppo.lingua,
      indicazioneDellaPersona: input.indicazione.trim() || null,
      destinazione: destinazioni[0]?.finalUrl ?? destinazioni[0]?.testo ?? null,
      keywordDelGruppo: keyword.map((k) => ({
        testo: k.testo,
        spesa: k.spesa,
        incasso: k.incasso,
        conversioni: k.conversioni,
      })),
      ricercheCheConvertono: ricerche.map((r) => ({
        testo: r.testo,
        conversioni: r.conversioni,
        incasso: r.ricavi,
      })),
      testiGiaEsistenti: testi.map((t) => ({ tipo: t.tipo, testo: t.testo, giudizioGoogle: t.rendimento })),
    },
    // ⚠️ LO SCHEMA VA PASSATO. Era definito qui sopra e non arrivava mai alla
    // chiamata: senza, il modello risponde in prosa e il JSON.parse qui sotto
    // fallisce sempre — «L'AI ha risposto in una forma non leggibile», ogni
    // volta. Uno schema dichiarato e non usato non protegge niente, e sembra
    // che protegga: e' il difetto peggiore delle due possibilita'.
    schema: SCHEMA_ANNUNCIO as unknown as Record<string, unknown>,
    massimoToken: 3000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzo: { titoli?: unknown; descrizioni?: unknown; note?: unknown };
  try {
    grezzo = JSON.parse(esito.testo);
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  // Difesa lato nostro: i limiti di Google sono un fatto, non una preferenza
  // dell'AI. Si scartano i testi fuori misura invece di mostrarli buoni.
  const pulisci = (v: unknown, limite: number) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x).replace(/\s+/g, " ").trim())
      .filter((x) => x.length > 0 && lunghezzaUtile(x) <= limite);

  const titoli = pulisci(grezzo.titoli, 30).slice(0, 15);
  const descrizioni = pulisci(grezzo.descrizioni, 90).slice(0, 4);
  if (titoli.length === 0 && descrizioni.length === 0) {
    return { ok: false, errore: "L'AI non ha prodotto testi dentro i limiti di Google: riprova." };
  }

  return {
    ok: true,
    titoli,
    descrizioni,
    note: typeof grezzo.note === "string" ? grezzo.note : null,
    modello: esito.modello,
  };
}


/**
 * Sistema un annuncio che ha dei difetti, SENZA riscriverlo da capo.
 *
 * ⚠️ PERCHÉ ESISTE. Il 21/08/2026 un annuncio è stato rifiutato da Google
 * per un titolo ripetuto (`DUPLICATE_ASSET`). L'app sapeva dirlo — «il titolo
 * numero 10 è uguale al numero 1» — e poi si fermava lì: la correzione
 * toccava alla persona, che doveva inventarsi un titolo nuovo dentro i 30
 * caratteri, diverso dagli altri quattordici e nella stessa lingua. Cioè
 * l'app faceva la parte facile (accorgersene) e lasciava fuori quella
 * difficile. Se un difetto lo sa vedere, deve anche saperlo aggiustare.
 *
 * ⚠️ TOCCA SOLO LE RIGHE ROTTE. Non è «riscrivi con l'AI»: chi ha già
 * corretto dodici titoli a mano non deve perderli per far sistemare il
 * tredicesimo. L'ordine resta, le righe sane tornano IDENTICHE — e se il
 * modello ne cambia una che andava bene, la si rimette com'era qui sotto.
 */
export async function sistemaAnnuncioConAi(input: {
  gruppoId: string;
  titoli: string[];
  descrizioni: string[];
}): Promise<EsitoAnnuncioAi> {
  const gruppo = await prisma.gruppo.findUnique({
    where: { id: input.gruppoId },
    select: { nome: true, lingua: true, campagna: { select: { nome: true, brand: true } } },
  });
  if (!gruppo) return { ok: false, errore: "Gruppo non trovato." };

  const { indiciDoppioni } = await import("./funzioni-annuncio");
  const titoli = input.titoli.map((t) => t.trim()).filter(Boolean);
  const descrizioni = input.descrizioni.map((d) => d.trim()).filter(Boolean);

  // I difetti si passano NUMERATI: «il titolo 10» è un'istruzione che un
  // modello può eseguire, «ci sono dei doppioni» no.
  const difetti: string[] = [];
  indiciDoppioni(titoli).forEach((i) =>
    difetti.push(`titolo ${i + 1} («${titoli[i]}») è identico a un altro titolo: sostituiscilo con uno NUOVO e diverso da tutti`)
  );
  indiciDoppioni(descrizioni).forEach((i) =>
    difetti.push(`descrizione ${i + 1} è identica a un'altra: sostituiscila con una nuova`)
  );
  titoli.forEach((t, i) => {
    if (lunghezzaUtile(t) > 30) difetti.push(`titolo ${i + 1} («${t}») è di ${lunghezzaUtile(t)} caratteri: riscrivilo in 30`);
  });
  descrizioni.forEach((d, i) => {
    if (lunghezzaUtile(d) > 90) difetti.push(`descrizione ${i + 1} è di ${lunghezzaUtile(d)} caratteri: riscrivila in 90`);
  });

  const esito = await chiediAllAi({
    istruzioni: [
      "Ti do i testi di un annuncio Google già scritto, e l'elenco dei suoi difetti.",
      "Correggi SOLO i difetti elencati. Tutte le altre righe le riscrivi IDENTICHE, nello stesso ordine.",
      "Regole:",
      "- Rispondi con la lista COMPLETA dei titoli e delle descrizioni, non solo con quelle corrette.",
      "- Stessa lingua dei testi che ricevi.",
      "- Un titolo sostituito deve dire una cosa NUOVA (un angolo che manca), non essere una variante di uno che c'è già.",
      "- Titoli max 30 caratteri, descrizioni max 90. Nelle funzioni fra graffe {KeyWord:testo} il limite vale sul testo di riserva.",
      "- Correggi anche gli errori di ortografia evidenti che trovi nelle righe (es. una parola scritta male), e dillo in `note`.",
      "- Niente superlativi non verificabili, niente MAIUSCOLO integrale, niente punti esclamativi multipli.",
      "In `note` scrivi in una riga cosa hai cambiato. Rispondi solo in JSON.",
    ].join("\n"),
    dati: {
      campagna: gruppo.campagna.nome,
      gruppo: gruppo.nome,
      brand: gruppo.campagna.brand,
      linguaDelGruppo: gruppo.lingua,
      titoliAttuali: titoli,
      descrizioniAttuali: descrizioni,
      difettiDaCorreggere: difetti,
    },
    schema: SCHEMA_ANNUNCIO as unknown as Record<string, unknown>,
    massimoToken: 3000,
  });
  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzo: { titoli?: unknown; descrizioni?: unknown; note?: unknown };
  try {
    grezzo = JSON.parse(esito.testo);
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  const lista = (v: unknown, limite: number, quante: number) =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x).replace(/\s+/g, " ").trim())
      .filter((x) => x.length > 0 && lunghezzaUtile(x) <= limite)
      .slice(0, quante);

  const titoliNuovi = lista(grezzo.titoli, 30, 15);
  const descrizioniNuove = lista(grezzo.descrizioni, 90, 4);
  if (titoliNuovi.length === 0 && descrizioniNuove.length === 0) {
    return { ok: false, errore: "L'AI non ha restituito testi utilizzabili: riprova." };
  }

  return {
    ok: true,
    titoli: titoliNuovi,
    descrizioni: descrizioniNuove,
    note: typeof grezzo.note === "string" ? grezzo.note : null,
    modello: esito.modello,
  };
}
// I segnaposto dinamici valgono per la loro lunghezza REALE solo a runtime:
// per il limite conta il testo di riserva, non tutta la graffa.
function lunghezzaUtile(t: string): number {
  const conRiserva = t.replace(/\{[^:}]+:([^}]*)\}/g, "$1").replace(/\{[^}]*\}/g, "");
  return conRiserva.length;
}

/**
 * Mette in coda un annuncio RSA nuovo per un gruppo.
 *
 * ⚠️ È il pezzo che mancava. `creaAnnuncioConAi` qui sopra scrive i testi e poi
 * si fermava, dicendo di copiarli a mano in Google Ads — perché creare annunci
 * non era fra le operazioni dello script. Dal 19/08/2026 lo è (`creaAnnuncio`,
 * col builder RSA dell'API), e lasciare la proposta a metà strada sarebbe stato
 * peggio che non averla mai avuta: l'app scriveva il testo giusto e poi
 * chiedeva alla persona di fare il lavoro da sé.
 *
 * ⚠️ I TRE CANCELLI RESTANO TUTTI: l'AI propone, la persona sceglie (e può
 * correggere i testi prima), la coda approva. Qui non si scrive su Google.
 *
 * ⚠️ E passa dal LINT, come il lancio di una campagna: un titolo con «gratis»
 * su Flowers non deve arrivare in asta solo perché è passato da una strada
 * diversa. Le regole sono le stesse (7.2/7.3), il punto di ingresso no.
 */
export async function accodaAnnuncio(input: {
  gruppoId: string;
  titoli: string[];
  descrizioni: string[];
  finalUrl: string;
  motivo?: string;
}): Promise<{ ok: true; operazioneId: string } | { ok: false; errore: string }> {
  const titoli = input.titoli.map((t) => t.trim()).filter(Boolean);
  const descrizioni = input.descrizioni.map((d) => d.trim()).filter(Boolean);
  const finalUrl = (input.finalUrl ?? "").trim();

  // I minimi di Google, detti prima invece che dopo il rifiuto.
  if (titoli.length < 3) return { ok: false, errore: `Servono almeno 3 titoli (ce ne sono ${titoli.length}).` };
  if (descrizioni.length < 2) return { ok: false, errore: `Servono almeno 2 descrizioni (ce ne sono ${descrizioni.length}).` };
  if (!finalUrl) return { ok: false, errore: "Serve la pagina di destinazione." };
  if (!/^https?:\/\//i.test(finalUrl)) return { ok: false, errore: "La pagina di destinazione deve cominciare con http:// o https://." };
  // ⚠️ I limiti di lunghezza sono di Google e non si negoziano: un titolo di 34
  // caratteri fa rifiutare l'annuncio intero, e scoprirlo dal registro dopo un
  // giro di script è tempo buttato.
  // ⚠️ La lunghezza si misura con le funzioni di Google RESE (vedi
  // lib/funzioni-annuncio): «{KeyWord:Fresh Flower Delivery}» sono 21
  // caratteri, non 31. Contarli sulla stringa faceva rifiutare qui titoli che
  // Google avrebbe accettato — e la regola deve essere LA STESSA del dialogo,
  // o l'app dice di sì a schermo e di no un istante dopo.
  const { misuraTesto, oltreIlLimite, indiciDoppioni } = await import("./funzioni-annuncio");
  const lunghi = [
    ...titoli.filter((t) => oltreIlLimite(t, 30)).map((t) => `titolo «${t}» (${misuraTesto(t).lunghezza}/30)`),
    ...descrizioni.filter((d) => oltreIlLimite(d, 90)).map((d) => `descrizione «${d.slice(0, 40)}…» (${misuraTesto(d).lunghezza}/90)`),
  ];
  if (lunghi.length > 0) return { ok: false, errore: `Troppo lungo: ${lunghi[0]}${lunghi.length > 1 ? ` (e altri ${lunghi.length - 1})` : ""}.` };

  // ⚠️ Un testo RIPETUTO fa rifiutare l'annuncio intero (`DUPLICATE_ASSET`).
  // Google non scarta la riga di troppo: non crea niente. Pagato il
  // 21/08/2026 — «Luxury Flower Delivery» al posto 1 e al posto 10.
  // ⚠️ Non si toglie il doppione da soli: chi ha scritto quindici titoli ne
  // vuole quindici, e sostituirne uno in silenzio vorrebbe dire mandare in
  // asta un annuncio diverso da quello che ha letto.
  const titoliDoppi = indiciDoppioni(titoli);
  const descrizioniDoppie = indiciDoppioni(descrizioni);
  if (titoliDoppi.length > 0) {
    return {
      ok: false,
      errore: `Titolo ripetuto: «${titoli[titoliDoppi[0]]}» compare due volte. Google rifiuta l'annuncio intero se due testi sono uguali (DUPLICATE_ASSET): cambialo o toglilo.`,
    };
  }
  if (descrizioniDoppie.length > 0) {
    return {
      ok: false,
      errore: `Descrizione ripetuta: «${descrizioni[descrizioniDoppie[0]].slice(0, 50)}…» compare due volte. Google rifiuta l'annuncio intero se due testi sono uguali (DUPLICATE_ASSET).`,
    };
  }

  const gruppo = await prisma.gruppo.findUnique({
    where: { id: input.gruppoId },
    select: { id: true, nome: true, idEsterno: true, campagna: { select: { id: true, nome: true, brand: true, canale: true, account: true } } },
  });
  if (!gruppo) return { ok: false, errore: "Gruppo non trovato." };

  const { lintCopy } = await import("./copy-lint");
  for (const t of [...titoli, ...descrizioni]) {
    for (const v of lintCopy(t, gruppo.campagna.brand)) {
      if (v.tipo === "vietato") {
        return {
          ok: false,
          errore: `Copy bloccato dal lint 7.2/7.3 — "${v.parola}" in «${t.slice(0, 40)}»: ${v.motivo}${v.sostituzione ? ` → ${v.sostituzione}` : ""}`,
        };
      }
    }
  }

  const { accodaOperazione } = await import("./operazioni");
  const { registra } = await import("./registro");
  const op = await accodaOperazione({
    data: {
      tipo: "nuovo_annuncio",
      canale: gruppo.campagna.canale,
      account: gruppo.campagna.account,
      bersaglio: gruppo.nome,
      // Il gruppo si ritrova per id di piattaforma quando c'è: è l'aggancio
      // che non sbaglia, come per le keyword.
      idEsterno: gruppo.idEsterno,
      parametri: JSON.stringify({ titoli, descrizioni, finalUrl, gruppo: gruppo.nome }),
      motivo: input.motivo?.trim() || `Annuncio nuovo per il gruppo «${gruppo.nome}»`,
      // L1: aggiunge un annuncio, non ne toglie e non sposta budget. Google
      // mette in gara i creativi di un gruppo, quindi uno in più non spegne
      // niente — al contrario di una pausa o di un cambio di budget.
      livello: "L1",
      prima: "assente",
      campagnaId: gruppo.campagna.id,
      gruppoId: gruppo.id,
    },
  });
  await registra({
    autore: "utente",
    tipo: "creazione",
    entita: "operazione",
    entitaId: op.id,
    titolo: `In coda (da approvare): annuncio nuovo in «${gruppo.nome}»`,
    dettaglio: `${titoli.length} titoli · ${descrizioni.length} descrizioni · verso ${finalUrl}`,
  });
  return { ok: true, operazioneId: op.id };
}

/** La bozza salvata per un gruppo, se c'è. */
export async function leggiBozzaAnnuncio(gruppoId: string) {
  const b = await prisma.bozzaAnnuncio.findUnique({ where: { gruppoId } });
  if (!b) return null;
  return {
    titoli: b.titoli ?? "",
    descrizioni: b.descrizioni ?? "",
    finalUrl: b.finalUrl ?? "",
    indicazione: b.indicazione ?? "",
    aggiornataIl: b.aggiornataIl.toISOString(),
  };
}

/**
 * Salva la bozza mentre si scrive.
 *
 * ⚠️ Sul database e non nel browser: un annuncio si scrive in più momenti («lo
 * finisco domani») e una bozza chiusa in localStorage vive su quel computer e
 * su quel browser soltanto. Stessa scelta delle viste salvate: condivisa.
 *
 * ⚠️ Una bozza VUOTA non si salva, si cancella. Altrimenti chi svuota le
 * caselle per ricominciare si ritroverebbe la bozza vuota al posto di niente, e
 * la volta dopo l'app direbbe «ripresa una bozza» senza avere niente da
 * riprendere.
 */
export async function salvaBozzaAnnuncio(input: {
  gruppoId: string;
  titoli: string;
  descrizioni: string;
  finalUrl: string;
  indicazione: string;
}): Promise<{ salvataIl: string } | { vuota: true }> {
  const vuota =
    !input.titoli.trim() && !input.descrizioni.trim() && !input.indicazione.trim();
  if (vuota) {
    await prisma.bozzaAnnuncio.deleteMany({ where: { gruppoId: input.gruppoId } });
    return { vuota: true };
  }
  const dati = {
    titoli: input.titoli,
    descrizioni: input.descrizioni,
    finalUrl: input.finalUrl,
    indicazione: input.indicazione,
  };
  const b = await prisma.bozzaAnnuncio.upsert({
    where: { gruppoId: input.gruppoId },
    create: { gruppoId: input.gruppoId, ...dati },
    update: dati,
  });
  return { salvataIl: b.aggiornataIl.toISOString() };
}

/** Butta la bozza: dopo che l'annuncio è andato in coda, o su richiesta. */
export async function scartaBozzaAnnuncio(gruppoId: string): Promise<void> {
  // ⚠️ `deleteMany` con il filtro sul gruppo, non un delete che esplode se non
  // c'è: qui «non c'era niente da buttare» è un esito normale, non un errore.
  await prisma.bozzaAnnuncio.deleteMany({ where: { gruppoId } });
}
