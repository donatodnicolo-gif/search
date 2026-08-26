// Scrivere su Meta: l'esecuzione delle operazioni GIÀ APPROVATE nell'app.
//
// ⚠️ **Perché questo file è diverso da tutto il resto del connettore Meta.**
// Fin qui `lib/meta.ts` legge soltanto. Qui si spende: una chiamata sbagliata
// accende una campagna, ne raddoppia il budget o la spegne. Tre cose che
// valgono soldi veri, e nessuna si annulla da sola.
//
// ⚠️ **E la differenza con Google è di natura, non di dettaglio.** Su Google
// l'esecuzione la fa lo *script dentro Google Ads*: il segreto non esce mai
// dall'account. Qui la fa **l'app**, quindi un token con `ads_management` —
// cioè col potere di far uscire denaro — vive come variabile d'ambiente su
// Vercel. È il motivo per cui la catena coda → approvazione a mano → esito
// non è una formalità: è l'unica cosa che sta fra un errore e la spesa.
//
// STATO: **ACCESO, misurato il 26/08/2026** — la diagnosi in produzione
// (`GET /api/v1/esegui/meta`) risponde `puoScrivere: true`: il token ha
// `ads_management` e `META_SCRITTURA=attiva` c'è. Da qui in poi le operazioni
// Meta APPROVATE si eseguono davvero. Il gate resta com'è (una variabile +
// il permesso chiesto a Meta a ogni giro): se una delle due cose sparisce,
// `metaPuoScrivere()` torna falso e si ferma tutto — non si prova e basta,
// si dice che non si può. ⚠️ Qui prima c'era scritto «oggi il token ha solo
// ads_read»: era vero quando fu scritto e falso poi — lo stato di un
// collegamento si misura, non si ricopia da un commento.

const VERSIONE = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSIONE}`;

function token(): string | null {
  const t = process.env.META_ACCESS_TOKEN;
  return t && t.trim().length > 20 ? t.trim() : null;
}

/**
 * Se l'app può scrivere su Meta. Non basta avere un token: serve che quel
 * token abbia `ads_management`.
 *
 * ⚠️ **Il permesso non si deduce, si chiede a Meta.** Un token con solo
 * `ads_read` è indistinguibile da uno completo finché non si prova a
 * scrivere — e «provare a scrivere» per scoprirlo vorrebbe dire fare la
 * modifica. Per questo esiste `/me/permissions`, che lo dice senza toccare
 * niente. La risposta si tiene in memoria per il giro corrente: è una
 * domanda sola, non una per operazione.
 */
export async function metaPuoScrivere(): Promise<{ puo: boolean; perche: string }> {
  const t = token();
  if (!t) {
    return {
      puo: false,
      perche:
        "META_ACCESS_TOKEN non impostato: senza token l'app non può né leggere né scrivere.",
    };
  }
  // La variabile è una sicura in più: anche col permesso, la scrittura resta
  // spenta finché qualcuno non la accende di proposito.
  if (process.env.META_SCRITTURA !== "attiva") {
    return {
      puo: false,
      perche:
        "Scrittura su Meta disattivata: manca META_SCRITTURA=attiva fra le variabili d'ambiente. È un interruttore voluto — il permesso da solo non basta ad accendere la spesa.",
    };
  }
  try {
    const r = await fetch(`${BASE}/me/permissions?access_token=${encodeURIComponent(t)}`, {
      cache: "no-store",
    });
    const dati = (await r.json()) as { data?: { permission: string; status: string }[]; error?: { message?: string } };
    if (dati.error) {
      return { puo: false, perche: `Meta non risponde sui permessi: ${dati.error.message ?? "errore"}` };
    }
    const ok = (dati.data ?? []).some(
      (p) => p.permission === "ads_management" && p.status === "granted"
    );
    return ok
      ? { puo: true, perche: "Token con ads_management concesso." }
      : {
          puo: false,
          perche:
            "Il token ha ads_read ma non ads_management: si rigenera chiedendo quello scope, E in Business Manager i tre account vanno assegnati all'utente di sistema con «Gestisci campagne», non «Visualizza prestazioni». Sono due cose separate: farne una sola non basta.",
        };
  } catch (e) {
    return { puo: false, perche: `Non riesco a chiedere i permessi a Meta: ${String(e)}` };
  }
}

// ⚠️ Le operazioni che su Meta ESISTONO. Non è un sottoinsieme per prudenza:
// Meta non ha keyword né negative, quindi `pausa_keyword`, `attiva_keyword` e
// `negativa` lì non vogliono dire niente. Offrirle sarebbe promettere una cosa
// che la piattaforma non sa fare.
export const OPERAZIONI_META = [
  "pausa_campagna",
  "attiva_campagna",
  "pausa_gruppo", // su Meta è l'ad set
  "attiva_gruppo",
  "budget",
  // Il lancio: campagna + ad set, tutti e due IN PAUSA. L'annuncio no — vuole
  // un'immagine o un video, e l'app non possiede media: si monta in Ads Manager.
  "lancio_campagna",
] as const;

export type EsitoScrittura = {
  riuscita: boolean;
  dettaglio: string;
  prima?: string;
  dopo?: string;
  // L'id della campagna appena creata su Meta (solo per `lancio_campagna`).
  // Viaggia anche quando `riuscita` è falso: se la campagna è nata e l'ad set
  // no, l'id esiste lo stesso e perderlo vorrebbe dire una campagna orfana che
  // nessuna sync sa più agganciare.
  idCreato?: string;
};

/** Una POST alla Graph API, con l'errore riportato per quello che dice. */
async function scrivi(percorso: string, campi: Record<string, string>): Promise<EsitoScrittura> {
  const t = token();
  if (!t) return { riuscita: false, dettaglio: "token assente" };
  const corpo = new URLSearchParams({ ...campi, access_token: t });
  try {
    const r = await fetch(`${BASE}/${percorso}`, { method: "POST", body: corpo, cache: "no-store" });
    const dati = (await r.json()) as { success?: boolean; id?: string; error?: { message?: string; code?: number } };
    if (dati.error) {
      // Gli stessi due guasti di sempre, e vanno distinti anche qui: 190 è il
      // token, 200 è il permesso sull'asset. Curarli allo stesso modo fa
      // perdere giorni.
      const c = dati.error.code;
      const spiega =
        c === 190
          ? " — è il TOKEN (scaduto o senza scope): va rigenerato."
          : c === 200
            ? " — è il PERMESSO sull'asset: si sistema in Business Manager, non toccando il token."
            : "";
      return { riuscita: false, dettaglio: `${dati.error.message ?? "errore Meta"}${spiega}` };
    }
    return { riuscita: true, dettaglio: "applicata su Meta" };
  } catch (e) {
    return { riuscita: false, dettaglio: `chiamata fallita: ${String(e)}` };
  }
}

/**
 * Rilegge un oggetto Meta DOPO averlo scritto.
 *
 * ⚠️ È la lezione già pagata tre volte su Google: una scrittura che non si
 * rilegge fa registrare all'app un successo che potrebbe non essere avvenuto,
 * e nessuno lo saprebbe mai. Qui la POST torna `{success:true}`, che è più di
 * quanto dica `createNegativeKeyword` — ma «la chiamata è stata accettata» e
 * «il valore adesso è quello» restano due frasi diverse: su Meta un budget
 * può finire sul livello sbagliato, e uno stato può essere superato da quello
 * del genitore.
 *
 * Torna `null` quando la rilettura non riesce: e `null` NON è un errore, è un
 * «non lo so» — che si dichiara invece di trasformarlo in un fallimento.
 */
async function rileggi(id: string, campi: string): Promise<Record<string, unknown> | null> {
  const t = token();
  if (!t) return null;
  try {
    const r = await fetch(
      `${BASE}/${id}?fields=${encodeURIComponent(campi)}&access_token=${encodeURIComponent(t)}`,
      { cache: "no-store" }
    );
    const dati = (await r.json()) as Record<string, unknown> & { error?: unknown };
    if (dati.error) return null;
    return dati;
  } catch {
    return null;
  }
}

/** Mette in pausa o riattiva una campagna o un ad set: stessa chiamata. */
export async function cambiaStatoMeta(
  idEsterno: string,
  acceso: boolean,
  cosa: "campagna" | "gruppo"
): Promise<EsitoScrittura> {
  const stato = acceso ? "ACTIVE" : "PAUSED";
  const esito = await scrivi(idEsterno, { status: stato });
  if (!esito.riuscita) return esito;

  // ⚠️ `effective_status` è quello che conta davvero: una campagna può
  // risultare ACTIVE e non erogare perché il genitore è fermo o l'account è
  // sospeso. Si riportano tutti e due quando non coincidono, invece di
  // scegliere quello che fa più bella figura.
  const letto = await rileggi(idEsterno, "status,effective_status");
  const ora = letto ? String(letto.status ?? "") : null;
  const davvero = letto ? String(letto.effective_status ?? "") : null;

  // ⚠️ Se la rilettura DICE che lo stato non è cambiato, l'operazione è
  // FALLITA — non «riuscita con una nota». Prima qui tornava riuscita:true
  // con l'ATTENZIONE solo nel testo, e `riferisci` scriveva nel DB
  // «in pausa» su una campagna che su Meta continuava a spendere: la forma
  // diceva fatto, il testo diceva non fatto, e la forma vince (trovato
  // dalla revisione del 26/08). La rilettura mancata resta un «non lo so»,
  // non un fallimento.
  if (ora != null && ora !== stato) {
    return {
      riuscita: false,
      dettaglio:
        `Meta ha ACCETTATO la richiesta ${cosa} → ${stato}, ma rileggendo lo stato è ancora ${ora}: ` +
        "non la segno eseguita — comanda quello che si rilegge, non la POST. Da riprovare guardando l'account.",
    };
  }
  const nota =
    ora == null
      ? " (non ho potuto rileggere per confermare)"
      : davvero && davvero !== stato
        ? ` (confermato rileggendo, ma Meta lo dà come ${davvero}: c'è qualcosa sopra che lo tiene fermo)`
        : " (confermato rileggendo)";

  return {
    riuscita: true,
    dettaglio: `${cosa === "campagna" ? "campagna" : "ad set"} → ${stato} su Meta${nota}`,
    dopo: acceso ? "attiva" : "in pausa",
  };
}

/**
 * Cambia il budget giornaliero.
 *
 * ⚠️ **Due trappole, ognuna delle quali costa denaro.**
 *
 * 1. `daily_budget` va in **CENTESIMI** della valuta dell'account, non in
 *    euro: mandare `25` vuol dire 0,25 €, mandare `2500` vuol dire 25 €.
 *    Sbagliare per difetto spegne la campagna, per eccesso la fa correre.
 *    Qui si converte in un punto solo e si arrotonda all'intero, perché Meta
 *    rifiuta i decimali.
 *
 * 2. Il budget su Meta può stare sulla **campagna** (CBO) oppure su ogni
 *    **ad set**. Scriverlo sul livello sbagliato non fa niente — o, peggio,
 *    ne aggiunge uno secondo che convive col primo. Chi chiama deve dire su
 *    quale livello sta agendo: qui non si indovina.
 */
export async function budgetMeta(idEsterno: string, euroAlGiorno: number): Promise<EsitoScrittura> {
  if (!(euroAlGiorno > 0)) return { riuscita: false, dettaglio: `budget non valido: ${euroAlGiorno}` };
  const centesimi = Math.round(euroAlGiorno * 100);
  const esito = await scrivi(idEsterno, { daily_budget: String(centesimi) });
  if (!esito.riuscita) return esito;

  // ⚠️ Si rilegge il valore, non ci si fida del `success`. Il budget su Meta
  // può stare sulla campagna (CBO) o sugli ad set: scriverlo dove non vive
  // può essere accettato e non cambiare niente, e sarebbe la peggiore delle
  // risposte — «fatto» su una modifica che non c'è.
  const letto = await rileggi(idEsterno, "daily_budget");
  const suGoogleCent = letto?.daily_budget != null ? Number(letto.daily_budget) : null;
  const nota =
    suGoogleCent == null
      ? " - non ho potuto rileggere il budget per confermarlo"
      : suGoogleCent === centesimi
        ? " (confermato rileggendo)"
        : ` - ATTENZIONE: rileggendo, Meta riporta ${(suGoogleCent / 100).toFixed(2)} €/g. Il budget potrebbe stare sugli ad set e non sulla campagna.`;

  return {
    riuscita: true,
    dettaglio: `budget → ${euroAlGiorno.toFixed(2)} €/g (${centesimi} centesimi, come li vuole Meta)${nota}`,
    dopo: `${euroAlGiorno.toFixed(2)} €/g`,
  };
}

// ---------------------------------------------------------------------------
// IL LANCIO DI UNA CAMPAGNA NUOVA — la parte di Meta che su Google fa lo script.
//
// Su Meta la struttura è a TRE livelli e nessuno coincide con Google:
//   campagna  → l'obiettivo (ODAX: OUTCOME_*), la categoria speciale, e il
//               budget SE è Advantage (CBO);
//   ad set    → il pubblico (geo, età, genere), i posizionamenti,
//               l'ottimizzazione col suo evento pixel, e il budget se è ABO;
//   annuncio  → il creativo. QUI NON SI CREA: vuole un media (image_hash o
//               video) che l'app non possiede. Dirlo è meglio che fingere.
//
// Tutto nasce IN PAUSA — stessa regola del lancio Google: l'accensione resta
// un gesto manuale dopo la checklist 4.1.
// ---------------------------------------------------------------------------

/** Una GET alla Graph API. `null` = non ho potuto chiedere, non «vuoto». */
async function leggiMeta(percorso: string, campi: Record<string, string>): Promise<Record<string, unknown> | null> {
  const t = token();
  if (!t) return null;
  const qs = new URLSearchParams({ ...campi, access_token: t });
  try {
    const r = await fetch(`${BASE}/${percorso}?${qs.toString()}`, { cache: "no-store" });
    const dati = (await r.json()) as Record<string, unknown> & { error?: unknown };
    if (dati.error) return null;
    return dati;
  } catch {
    return null;
  }
}

// Come li dice il form → come li vuole Meta. Manca «interazioni» apposta:
// OUTCOME_ENGAGEMENT ottimizza su un post che al lancio non esiste ancora
// (l'annuncio si monta dopo), quindi offrirlo prometterebbe una cosa che
// questo percorso non sa mantenere.
const OBIETTIVO_ODAX: Record<string, string> = {
  vendite: "OUTCOME_SALES",
  contatti: "OUTCOME_LEADS",
  traffico: "OUTCOME_TRAFFIC",
  notorieta: "OUTCOME_AWARENESS",
};

const CATEGORIA_SPECIALE: Record<string, string[]> = {
  nessuna: [],
  credito: ["CREDIT"],
  lavoro: ["EMPLOYMENT"],
  abitazioni: ["HOUSING"],
  tematiche_sociali: ["ISSUES_ELECTIONS_POLITICS"],
};

const STRATEGIA_META: Record<string, string> = {
  volume: "LOWEST_COST_WITHOUT_CAP",
  costo_cap: "COST_CAP",
  bid_cap: "LOWEST_COST_WITH_BID_CAP",
  roas_min: "LOWEST_COST_WITH_MIN_ROAS",
};

export type ParametriLancioMeta = {
  nome: string;
  obiettivoTipo: string; // vendite | contatti | traffico | notorieta
  budget: number; // €/giorno
  livelloBudget: "campagna" | "adset"; // CBO o ABO
  strategia: string; // volume | costo_cap | bid_cap | roas_min
  importoCap?: number | null; // € per costo_cap / bid_cap
  roasMinimo?: number | null; // per roas_min (es. 3.4)
  categoriaSpeciale?: string | null;
  nomeAdSet?: string | null;
  paesi?: string[]; // ISO-2
  citta?: { nome: string; raggioKm?: number | null; chiave?: string | null }[];
  etaMin?: number | null;
  etaMax?: number | null;
  genere?: string | null; // tutti | donne | uomini
  advantage?: boolean; // Advantage+ audience
  posizionamenti?: string[] | null; // vuoto/assente = automatici (Advantage+)
  eventoConversione?: string | null; // acquisto | carrello | lead
  pixelId?: string | null; // se vuoto lo cerca l'app sull'account
  inizio?: string | null; // ISO
  fine?: string | null; // ISO
};

/**
 * Trova il pixel dell'account quando serve e non è stato indicato.
 *
 * ⚠️ Si sceglie SOLO se è uno: con due pixel «prendo il primo» vorrebbe dire
 * contare le conversioni di un altro sito — stessa regola delle località
 * ambigue dello script Google (Como è una città e una provincia).
 */
async function pixelDellAccount(idAccount: string): Promise<{ id?: string; motivo?: string }> {
  const r = await leggiMeta(`act_${idAccount.replace(/^act_/, "")}/adspixels`, { fields: "id,name" });
  if (!r) return { motivo: "non sono riuscito a chiedere i pixel dell'account" };
  const lista = (r.data as { id: string; name?: string }[] | undefined) ?? [];
  if (lista.length === 1) return { id: lista[0].id };
  if (lista.length === 0) return { motivo: "sull'account non c'è nessun pixel" };
  return {
    motivo:
      `sull'account ci sono ${lista.length} pixel (${lista.map((p) => `${p.name ?? "?"} · ${p.id}`).join(", ")}): ` +
      "non scelgo io — rilancia indicando l'id nel campo Pixel del modulo",
  };
}

/**
 * Una città detta per nome → la chiave numerica che Meta vuole nel targeting.
 * Stessa regola dello script Google: un nome che dà più risultati non si
 * indovina, si elenca — e chi ha chiesto riscrive il nome esatto o la chiave.
 */
async function risolviCittaMeta(nome: string): Promise<{ chiave?: string; ambigue?: string[] }> {
  const r = await leggiMeta("search", {
    type: "adgeolocation",
    location_types: '["city"]',
    q: nome,
    limit: "10",
  });
  const lista =
    (r?.data as { key: string; name: string; region?: string; country_name?: string }[] | undefined) ?? [];
  if (lista.length === 0) return { ambigue: [] };
  const norma = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const esatte = lista.filter((c) => norma(c.name) === norma(nome));
  if (esatte.length === 1) return { chiave: esatte[0].key };
  if (lista.length === 1) return { chiave: lista[0].key };
  return {
    ambigue: (esatte.length > 1 ? esatte : lista).map(
      (c) => `${c.name} (${[c.region, c.country_name].filter(Boolean).join(", ")}) → chiave ${c.key}`
    ),
  };
}

/**
 * Crea campagna + ad set su Meta, tutti e due IN PAUSA.
 *
 * ⚠️ L'esito può essere PARZIALE: se la campagna nasce e l'ad set no,
 * `riuscita` è falso (qualcuno deve guardarci) ma `idCreato` viaggia lo
 * stesso — la campagna su Meta ESISTE, e va agganciata, non dimenticata.
 * Rimettere in coda la stessa operazione la duplicherebbe: si sistema l'ad
 * set a mano, o si accoda un lancio nuovo dopo aver spento il primo.
 */
export async function lancioMeta(idAccount: string, p: ParametriLancioMeta): Promise<EsitoScrittura> {
  const conto = `act_${idAccount.replace(/^act_/, "")}`;
  const odax = OBIETTIVO_ODAX[p.obiettivoTipo];
  if (!odax) {
    return { riuscita: false, dettaglio: `obiettivo «${p.obiettivoTipo}» sconosciuto: su Meta so lanciare ${Object.keys(OBIETTIVO_ODAX).join(", ")}` };
  }
  if (!(p.budget > 0)) return { riuscita: false, dettaglio: `budget non valido: ${p.budget}` };

  const cbo = p.livelloBudget !== "adset";
  const centesimi = Math.round(p.budget * 100);
  const strategia = STRATEGIA_META[p.strategia] ?? "LOWEST_COST_WITHOUT_CAP";
  const capCentesimi =
    (p.strategia === "costo_cap" || p.strategia === "bid_cap") && p.importoCap && p.importoCap > 0
      ? Math.round(p.importoCap * 100)
      : null;
  if ((p.strategia === "costo_cap" || p.strategia === "bid_cap") && !capCentesimi) {
    return { riuscita: false, dettaglio: `la strategia «${p.strategia}» vuole un importo in €: non c'è` };
  }
  if (p.strategia === "roas_min" && !(p.roasMinimo && p.roasMinimo > 0)) {
    return { riuscita: false, dettaglio: "la strategia «ROAS minimo» vuole il ROAS di soglia: non c'è" };
  }

  // ——— 1. La campagna ———
  const campiCampagna: Record<string, string> = {
    name: p.nome,
    objective: odax,
    status: "PAUSED",
    buying_type: "AUCTION",
    // ⚠️ Obbligatorio anche da vuoto: senza, Meta rifiuta la creazione.
    special_ad_categories: JSON.stringify(CATEGORIA_SPECIALE[p.categoriaSpeciale ?? "nessuna"] ?? []),
  };
  if (cbo) {
    campiCampagna.daily_budget = String(centesimi);
    campiCampagna.bid_strategy = strategia;
  }
  const t = token();
  if (!t) return { riuscita: false, dettaglio: "token assente" };
  let idCampagna: string;
  try {
    const r = await fetch(`${BASE}/${conto}/campaigns`, {
      method: "POST",
      body: new URLSearchParams({ ...campiCampagna, access_token: t }),
      cache: "no-store",
    });
    const dati = (await r.json()) as { id?: string; error?: { message?: string } };
    if (dati.error || !dati.id) {
      return { riuscita: false, dettaglio: `Meta ha rifiutato la campagna: ${dati.error?.message ?? "nessun id in risposta"}` };
    }
    idCampagna = dati.id;
  } catch (e) {
    return { riuscita: false, dettaglio: `chiamata fallita creando la campagna: ${String(e)}` };
  }

  // Da qui in poi la campagna ESISTE: ogni ritorno porta il suo id.
  const parziale = (motivo: string): EsitoScrittura => ({
    riuscita: false,
    idCreato: idCampagna,
    dettaglio:
      `PARZIALE — campagna creata su Meta (id ${idCampagna}, IN PAUSA) ma ad set NON creato: ${motivo}. ` +
      "Non rimettere in coda questo lancio (nascerebbe una seconda campagna): l'ad set si completa in Ads Manager.",
  });

  // ——— 2. Il pubblico (targeting) ———
  const note: string[] = [];
  const geo: { countries?: string[]; cities?: { key: string; radius?: number; distance_unit?: string }[] } = {};
  if (p.paesi && p.paesi.length > 0) geo.countries = p.paesi;
  const ambigue: string[] = [];
  const nonTrovate: string[] = [];
  for (const c of p.citta ?? []) {
    let chiave = c.chiave?.trim() || null;
    if (!chiave) {
      const esito = await risolviCittaMeta(c.nome);
      if (esito.chiave) chiave = esito.chiave;
      else if (esito.ambigue && esito.ambigue.length > 0) {
        ambigue.push(`«${c.nome}»: ${esito.ambigue.join(" · ")}`);
        continue;
      } else {
        nonTrovate.push(c.nome);
        continue;
      }
    }
    geo.cities = geo.cities ?? [];
    geo.cities.push(
      c.raggioKm && c.raggioKm > 0
        ? { key: chiave, radius: c.raggioKm, distance_unit: "kilometer" }
        : { key: chiave }
    );
  }
  if (ambigue.length > 0) note.push(`città AMBIGUE, non incluse (riscrivi il nome esatto o incolla la chiave): ${ambigue.join(" — ")}`);
  if (nonTrovate.length > 0) note.push(`città che Meta non trova, non incluse: ${nonTrovate.join(", ")}`);
  if (!geo.countries && (!geo.cities || geo.cities.length === 0)) {
    return parziale(`senza nemmeno una località valida Meta non accetta un ad set${note.length > 0 ? ` (${note.join("; ")})` : ""}`);
  }

  const targeting: Record<string, unknown> = {
    geo_locations: geo,
    // ⚠️ Dichiarazione OBBLIGATORIA sulle versioni recenti della Graph API:
    // un ad set nuovo senza `targeting_automation` viene rifiutato.
    targeting_automation: { advantage_audience: p.advantage === false ? 0 : 1 },
  };
  if (p.etaMin) targeting.age_min = p.etaMin;
  if (p.etaMax) targeting.age_max = p.etaMax;
  if (p.genere === "uomini") targeting.genders = [1];
  else if (p.genere === "donne") targeting.genders = [2];
  if (p.posizionamenti && p.posizionamenti.length > 0) {
    targeting.publisher_platforms = p.posizionamenti;
  }

  // ——— 3. Ottimizzazione: che risultato compra l'asta ———
  let optimization = "LINK_CLICKS";
  let promotedObject: Record<string, string> | null = null;
  if (p.obiettivoTipo === "vendite" || p.obiettivoTipo === "contatti") {
    optimization = "OFFSITE_CONVERSIONS";
    let pixel = p.pixelId?.trim() || null;
    if (!pixel) {
      const trovato = await pixelDellAccount(idAccount);
      if (!trovato.id) return parziale(`serve il pixel per ottimizzare sulle conversioni e ${trovato.motivo}`);
      pixel = trovato.id;
      note.push(`pixel trovato dall'app sull'account: ${pixel}`);
    }
    promotedObject = {
      pixel_id: pixel,
      custom_event_type:
        p.obiettivoTipo === "contatti" ? "LEAD" : p.eventoConversione === "carrello" ? "ADD_TO_CART" : "PURCHASE",
    };
  } else if (p.obiettivoTipo === "notorieta") {
    optimization = "REACH";
  }

  // ——— 4. L'ad set ———
  const campiAdSet: Record<string, string> = {
    name: p.nomeAdSet?.trim() || `${p.nome} — pubblico 1`,
    campaign_id: idCampagna,
    status: "PAUSED",
    optimization_goal: optimization,
    billing_event: "IMPRESSIONS",
    targeting: JSON.stringify(targeting),
  };
  if (!cbo) {
    campiAdSet.daily_budget = String(centesimi);
    campiAdSet.bid_strategy = strategia;
  }
  if (capCentesimi) campiAdSet.bid_amount = String(capCentesimi);
  if (p.strategia === "roas_min" && p.roasMinimo) {
    // Meta vuole il ROAS di soglia moltiplicato per 10.000 (3,4× → 34000).
    campiAdSet.bid_constraints = JSON.stringify({ roas_average_floor: Math.round(p.roasMinimo * 10000) });
  }
  if (promotedObject) campiAdSet.promoted_object = JSON.stringify(promotedObject);
  if (p.inizio) campiAdSet.start_time = p.inizio;
  if (p.fine) campiAdSet.end_time = p.fine;

  let idAdSet: string;
  try {
    const r = await fetch(`${BASE}/${conto}/adsets`, {
      method: "POST",
      body: new URLSearchParams({ ...campiAdSet, access_token: t }),
      cache: "no-store",
    });
    const dati = (await r.json()) as { id?: string; error?: { message?: string; error_user_msg?: string } };
    if (dati.error || !dati.id) {
      return parziale(`Meta ha rifiutato l'ad set: ${dati.error?.error_user_msg ?? dati.error?.message ?? "nessun id in risposta"}`);
    }
    idAdSet = dati.id;
  } catch (e) {
    return parziale(`chiamata fallita creando l'ad set: ${String(e)}`);
  }

  // Rilettura indipendente: «la POST è passata» e «su Meta adesso c'è» sono
  // due frasi diverse — stessa regola di budgetMeta.
  const riletta = await rileggi(idCampagna, "name,status,objective");
  const conferma =
    riletta == null
      ? " (non ho potuto rileggere per confermare)"
      : String(riletta.status) === "PAUSED"
        ? " (confermato rileggendo: in pausa)"
        : ` - ATTENZIONE: rileggendo, lo stato è ${String(riletta.status)}`;

  return {
    riuscita: true,
    idCreato: idCampagna,
    dettaglio:
      `campagna ${idCampagna} + ad set ${idAdSet} creati su Meta, tutti e due IN PAUSA${conferma}. ` +
      `Ottimizzazione ${optimization}${promotedObject ? ` su ${promotedObject.custom_event_type} (pixel ${promotedObject.pixel_id})` : ""}, ` +
      `budget ${p.budget.toFixed(2)} €/g ${cbo ? "sulla campagna (Advantage/CBO)" : "sull'ad set (ABO)"}. ` +
      `L'ANNUNCIO NON C'È ANCORA: il creativo si monta in Ads Manager prima dell'accensione.` +
      (note.length > 0 ? ` Note: ${note.join(" · ")}.` : ""),
    dopo: "creata in pausa",
  };
}

/**
 * Esegue le operazioni Meta **già approvate a mano**, una alla volta.
 *
 * È il gemello di `eseguiOperazioni` dello script Google, con una differenza
 * che non si può nascondere: là il motore gira *dentro* Google Ads, qui gira
 * dentro l'app. Quindi qui valgono le stesse regole, scritte a mano:
 *  · si prendono SOLO le operazioni in stato `approvata` — mai le in_attesa;
 *  · si esegue una alla volta e si riferisce l'esito **subito dopo ognuna**;
 *  · se l'esito non si riesce a registrare **ci si ferma**: rifarla al giro
 *    dopo vorrebbe dire una seconda modifica sulla stessa campagna.
 *
 * Non tocca niente finché `metaPuoScrivere()` non dice di sì.
 */
export async function eseguiOperazioniMeta(opzioni: { limite?: number } = {}) {
  const { prisma } = await import("./db");
  const permesso = await metaPuoScrivere();
  if (!permesso.puo) {
    return { eseguite: 0, fallite: 0, saltate: 0, nota: permesso.perche, spento: true };
  }

  const operazioni = await prisma.operazioneAdv.findMany({
    // ⚠️ Anche qui le programmate aspettano il loro giorno: se il filtro
    // stesse solo dall'altra parte, «Esegui adesso» sarebbe la scorciatoia
    // che scavalca una data messa apposta.
    where: {
      canale: "meta_ads",
      stato: "approvata",
      OR: [{ daEseguireDal: null }, { daEseguireDal: { lte: new Date() } }],
    },
    orderBy: { approvataIl: "asc" },
    take: opzioni.limite ?? 10,
  });
  if (operazioni.length === 0) {
    return { eseguite: 0, fallite: 0, saltate: 0, nota: "niente di approvato in coda", spento: false };
  }

  let eseguite = 0;
  let fallite = 0;
  let saltate = 0;

  for (const op of operazioni) {
    // ⚠️ Senza id di piattaforma non si tocca niente: cercare «la campagna che
    // si chiama così» su Meta significa poter colpire un omonimo di un altro
    // account. Meglio fermarsi e DIRLO SULLA RIGA: prima qui c'era solo
    // `saltate++`, e l'operazione restava «approvata» per sempre senza che
    // nessuno vedesse il motivo — e `idEsterno` sta sull'operazione dal
    // momento dell'accodamento, quindi non sarebbe mai guarita da sola.
    // Fallita col motivo è la verità: si riaccoda dalla campagna, che
    // intanto avrà il suo id. Il LANCIO è l'eccezione per natura — la
    // campagna non esiste ancora, quindi l'id non può esserci: lì serve
    // invece l'ACCOUNT su cui crearla.
    if (!op.idEsterno && op.tipo !== "lancio_campagna") {
      saltate++;
      const registrato = await riferisci(
        op.id,
        false,
        "manca l'id di piattaforma sull'operazione: senza, su Meta si rischia di colpire un omonimo. Riaccodare dalla scheda campagna (che ora ha il suo idEsterno)."
      );
      if (!registrato) break;
      continue;
    }
    if (!(OPERAZIONI_META as readonly string[]).includes(op.tipo)) {
      // Su Meta non esiste: si segna fallita col motivo, non si prova.
      fallite++;
      await riferisci(op.id, false, `«${op.tipo}» non esiste su Meta: la piattaforma non ha keyword né negative.`);
      continue;
    }

    // ⚠️ I parametri si leggono DENTRO una guardia: un JSON malformato (edit
    // a mano sul DB condiviso, migrazione) senza try/catch faceva esplodere
    // l'intera funzione PRIMA di `riferisci` — l'operazione velenosa restava
    // «approvata», e con l'ordinamento `approvataIl asc` tornava in testa a
    // ogni giro bloccando per sempre tutta la coda Meta. Fallita col motivo:
    // esce dalla coda e si vede.
    let parametri: Record<string, unknown> | null = null;
    let parametriRotti = false;
    try {
      parametri = JSON.parse(op.parametri ?? "{}") as Record<string, unknown>;
    } catch {
      parametriRotti = true;
    }

    let esito: EsitoScrittura;
    if (parametriRotti) {
      esito = { riuscita: false, dettaglio: "parametri illeggibili (non sono JSON): correggere la riga e riaccodare" };
    } else if (op.tipo === "lancio_campagna") {
      // L'account sull'operazione è l'id del conto Meta (lo scrive
      // `accodaOperazione` dal registro AccountAdv): senza, non si sa DOVE
      // creare la campagna, e indovinare è il modo di crearla altrove.
      esito = op.account
        ? await lancioMeta(op.account, parametri as ParametriLancioMeta)
        : { riuscita: false, dettaglio: "manca l'account Meta sull'operazione: non so su quale conto creare la campagna" };
    } else if (op.tipo === "pausa_campagna") esito = await cambiaStatoMeta(op.idEsterno!, false, "campagna");
    else if (op.tipo === "attiva_campagna") esito = await cambiaStatoMeta(op.idEsterno!, true, "campagna");
    else if (op.tipo === "pausa_gruppo") esito = await cambiaStatoMeta(op.idEsterno!, false, "gruppo");
    else if (op.tipo === "attiva_gruppo") esito = await cambiaStatoMeta(op.idEsterno!, true, "gruppo");
    else {
      esito = await budgetMeta(op.idEsterno!, Number((parametri as { budget?: number }).budget));
    }

    if (esito.riuscita) eseguite++;
    else fallite++;
    // Se l'app non registra l'esito ci si ferma: è la stessa regola dello
    // script Google, e per lo stesso motivo.
    const registrato = await riferisci(op.id, esito.riuscita, esito.dettaglio, esito.dopo, esito.idCreato);
    if (!registrato) break;
  }

  return { eseguite, fallite, saltate, nota: null, spento: false };
}

/**
 * Registra l'esito. Fa le stesse cose che fa l'endpoint usato dallo script
 * Google — e in particolare **crea la `Modifica`**, che non è burocrazia: è
 * quella riga a far partire il blackout e a lasciare il paper-trail. Senza,
 * un'operazione eseguita su Meta sarebbe invisibile al change control, e la
 * campagna risulterebbe «mai toccata» il giorno dopo.
 */
async function riferisci(id: string, riuscita: boolean, dettaglio: string, dopo?: string, idCreato?: string) {
  const { prisma } = await import("./db");
  try {
    const op = await prisma.operazioneAdv.update({
      where: { id },
      data: {
        stato: riuscita ? "eseguita" : "fallita",
        eseguitaIl: new Date(),
        esito: dopo ? `${dettaglio} (${dopo})` : dettaglio,
      },
    });
    // Il lancio: la campagna dell'app aggancia l'id appena nato su Meta.
    // ⚠️ ANCHE quando l'esito è «fallita»: nel caso parziale (campagna creata,
    // ad set no) la campagna su Meta esiste comunque — senza id resterebbe
    // orfana, invisibile a sync e rilevatore delle non confermate.
    if (op.tipo === "lancio_campagna" && idCreato && op.campagnaId) {
      await prisma.campagna.update({
        where: { id: op.campagnaId },
        data: { idEsterno: idCreato, stato: "in_pausa", statoPiattaforma: "PAUSED" },
      });
    }
    if (riuscita && op.campagnaId) {
      await prisma.modifica.create({
        data: {
          campagnaId: op.campagnaId,
          livello: op.livello,
          descrizione: `${op.tipo} su ${op.bersaglio} (eseguita su Meta dall'app)`,
          prima: op.prima,
          dopo: dopo ?? null,
          autore: "meta",
        },
      });
      // Lo stato dell'app segue quello che è appena successo davvero.
      if (op.tipo === "pausa_campagna" || op.tipo === "attiva_campagna") {
        await prisma.campagna.update({
          where: { id: op.campagnaId },
          data: {
            stato: op.tipo === "pausa_campagna" ? "in_pausa" : "attiva",
            statoPiattaforma: op.tipo === "pausa_campagna" ? "PAUSED" : "ENABLED",
          },
        });
      }
    }
    if (riuscita && op.gruppoId && (op.tipo === "pausa_gruppo" || op.tipo === "attiva_gruppo")) {
      const fermo = op.tipo === "pausa_gruppo";
      await prisma.gruppo.update({
        where: { id: op.gruppoId },
        data: { stato: fermo ? "in_pausa" : "attivo", statoPiattaforma: fermo ? "PAUSED" : "ENABLED" },
      });
    }
    return true;
  } catch {
    return false;
  }
}
