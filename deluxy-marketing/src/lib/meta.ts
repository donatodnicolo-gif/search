// Connettore Meta (Facebook/Instagram Ads) via Graph API.
//
// PERCHÉ È DIVERSO DA GOOGLE: Google Ads ha gli "Scripts", che girano dentro
// l'account e spingono i dati verso di noi — nessun segreto da custodire.
// Meta non ha niente di simile: è l'app che deve CHIAMARE la Graph API con un
// access token. Il token vive solo come variabile d'ambiente (META_ACCESS_TOKEN),
// mai nel database e mai nel codice.
//
// Il token giusto è quello di un UTENTE DI SISTEMA del Business Manager: non
// scade, a differenza dei token utente che muoiono in 60 giorni.
//
// REGOLA DAI DEFINITIVI (istruzioni di progetto): valore e ROAS si leggono
// SEMPRE dagli acquisti (omni_purchase), MAI dal "ROAS risultati" — quando la
// campagna ottimizza un evento a monte (ATC, Lead) quel numero è il valore
// dell'evento ottimizzato e sovrastima.

const VERSIONE = process.env.META_API_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSIONE}`;

export type RigaMeta = {
  idCampagna: string;
  nome: string;
  data: string; // AAAA-MM-GG
  spesa: number;
  impression: number;
  click: number;
  conversioni: number; // acquisti (omni_purchase)
  ricavi: number; // valore acquisti (omni_purchase)
  stato?: string;
};

export type EsitoMeta = {
  righe: RigaMeta[];
  errore: string | null;
  // Quante righe portavano un evento diverso da omni_purchase: utile per
  // capire se una campagna ottimizza a monte (ATC/Lead).
  senzaAcquisti: number;
};

function token(): string | null {
  const t = process.env.META_ACCESS_TOKEN;
  return t && t.trim().length > 20 ? t.trim() : null;
}

export function metaConfigurato(): boolean {
  return token() != null;
}

// Estrae un tipo di azione dalla struttura actions/action_values di Meta.
// Meta restituisce liste di { action_type, value }: qui si cerca l'acquisto.
function valoreAzione(lista: unknown, tipi: string[]): number {
  if (!Array.isArray(lista)) return 0;
  for (const t of tipi) {
    const trovato = lista.find(
      (a) => a && typeof a === "object" && (a as { action_type?: string }).action_type === t
    );
    if (trovato) return Number((trovato as { value?: string }).value ?? 0) || 0;
  }
  return 0;
}

const TIPI_ACQUISTO = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

// Legge le metriche giornaliere per campagna di un account.
// idAccount senza il prefisso "act_": lo aggiunge lei.
export async function leggiMetricheMeta(
  idAccount: string,
  dal: string,
  al: string
): Promise<EsitoMeta> {
  const t = token();
  if (!t) {
    return { righe: [], errore: "META_ACCESS_TOKEN non impostato", senzaAcquisti: 0 };
  }

  const campi = [
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "clicks",
    "actions",
    "action_values",
    "date_start",
  ].join(",");

  const params = new URLSearchParams({
    level: "campaign",
    fields: campi,
    time_range: JSON.stringify({ since: dal, until: al }),
    time_increment: "1", // una riga per giorno
    limit: "500",
    access_token: t,
  });

  const righe: RigaMeta[] = [];
  let senzaAcquisti = 0;
  let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/insights?${params.toString()}`;
  let pagine = 0;

  try {
    while (url && pagine < 40) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();

      if (!risposta.ok || corpo.error) {
        const e = corpo.error ?? {};
        return {
          righe,
          errore: `Meta ha risposto ${risposta.status}: ${e.message ?? "errore sconosciuto"}${e.code ? ` (codice ${e.code})` : ""}`,
          senzaAcquisti,
        };
      }

      for (const d of corpo.data ?? []) {
        const conversioni = valoreAzione(d.actions, TIPI_ACQUISTO);
        const ricavi = valoreAzione(d.action_values, TIPI_ACQUISTO);
        if (conversioni === 0 && Array.isArray(d.actions) && d.actions.length > 0) senzaAcquisti++;
        righe.push({
          idCampagna: String(d.campaign_id),
          nome: String(d.campaign_name ?? "senza nome"),
          data: String(d.date_start),
          spesa: Number(d.spend ?? 0) || 0,
          impression: Number(d.impressions ?? 0) || 0,
          click: Number(d.clicks ?? 0) || 0,
          conversioni,
          ricavi,
        });
      }

      url = corpo.paging?.next ?? "";
      pagine++;
    }
  } catch (e) {
    return { righe, errore: `Chiamata a Meta fallita: ${String(e).slice(0, 160)}`, senzaAcquisti };
  }

  return { righe, errore: null, senzaAcquisti };
}

// Stato e budget delle campagne: le insights non li portano, serve un giro sul
// nodo /campaigns.
export async function leggiStatoCampagneMeta(
  idAccount: string
): Promise<{ stati: Map<string, { stato: string; budget: number | null; obiettivo: string | null }>; errore: string | null }> {
  const t = token();
  const stati = new Map<string, { stato: string; budget: number | null; obiettivo: string | null }>();
  if (!t) return { stati, errore: "META_ACCESS_TOKEN non impostato" };

  // ⚠️⚠️ **LE ARCHIVIATE VANNO CHIESTE, o non arrivano.** Il nodo /campaigns
  // di default restituisce solo ACTIVE e PAUSED: una campagna archiviata
  // semplicemente **non compare**, e chi legge la risposta come «l'elenco
  // completo» non ha modo di distinguere «archiviata» da «non esiste».
  //
  // Caso reale (25/08/2026): «INTERESSE - [Festa della Mamma] - LANDING PAGE»
  // era rimasta ENABLED nell'app perché Meta non la nominava più — e finiva
  // nel file RISULTATI depositato su Drive, che dichiara di elencare solo le
  // campagne accese. Chiedere anche le archiviate risolve il problema **alla
  // radice**, invece di dedurre uno stato da un silenzio: il dato ce l'ha Meta,
  // bastava domandarlo.
  const CON_ARCHIVIATE = JSON.stringify([
    {
      field: "effective_status",
      operator: "IN",
      value: ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "DELETED"],
    },
  ]);
  const parametri = (conFiltro: boolean) => {
    const q = new URLSearchParams({
      fields: "id,name,status,effective_status,daily_budget,objective",
      limit: "500",
      access_token: t,
    });
    if (conFiltro) q.set("filtering", CON_ARCHIVIATE);
    return q;
  };

  try {
    // ⚠️ Con ripiego: se Meta rifiuta il filtro (i valori ammessi cambiano fra
    // versioni della Graph API), si riparte senza — meglio l'elenco di prima
    // che nessun elenco. Un miglioramento non deve poter spegnere la sync.
    let conFiltro = true;
    let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/campaigns?${parametri(true).toString()}`;
    let pagine = 0;
    while (url && pagine < 20) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        if (conFiltro) {
          conFiltro = false;
          stati.clear();
          url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/campaigns?${parametri(false).toString()}`;
          pagine = 0;
          continue;
        }
        return { stati, errore: corpo.error?.message ?? `Meta ha risposto ${risposta.status}` };
      }
      for (const c of corpo.data ?? []) {
        stati.set(String(c.id), {
          // ACTIVE | PAUSED | ARCHIVED | DELETED → il vocabolario dell'app
          stato: String(c.effective_status ?? c.status) === "ACTIVE" ? "attiva" : "in_pausa",
          // daily_budget arriva in centesimi
          budget: c.daily_budget != null ? Number(c.daily_budget) / 100 : null,
          obiettivo: c.objective ? String(c.objective) : null,
        });
      }
      url = corpo.paging?.next ?? "";
      pagine++;
    }
  } catch (e) {
    return { stati, errore: `Chiamata a Meta fallita: ${String(e).slice(0, 160)}` };
  }

  return { stati, errore: null };
}

// ───── LA FREQUENZA, che è un numero DI PERIODO ─────
//
// ⚠️ La frequenza (impressioni ÷ persone raggiunte) NON si ricava dalle righe
// giornaliere che l'app già salva: la copertura è gente UNICA, e sommare i
// giorni conta la stessa persona sette volte — la frequenza verrebbe ~1 anche
// su un pubblico cotto a 16×, che è il caso vero trovato dall'analisi Meta
// Gifts del 25/08 (freq 16,24 su VENDITE). La chiede l'unico che la sa: Meta,
// per l'intervallo esatto. Una chiamata sola per tutte le finestre
// (time_ranges), timeout corto, e se fallisce si mostra «—»: una pagina non
// deve morire per un KPI.
export type FrequenzaMeta = { frequenza: number; copertura: number; impressioni: number };

export async function frequenzeMeta(
  idCampagnaEsterno: string,
  finestre: { chiave: string; da: Date; a: Date }[]
): Promise<Map<string, FrequenzaMeta>> {
  const esito = new Map<string, FrequenzaMeta>();
  const t = token();
  if (!t || finestre.length === 0) return esito;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ranges = finestre.map((f) => ({ since: iso(f.da), until: iso(f.a) }));
  const params = new URLSearchParams({
    fields: "reach,frequency,impressions",
    time_ranges: JSON.stringify(ranges),
    access_token: t,
  });
  try {
    const r = await fetch(`${BASE}/${idCampagnaEsterno}/insights?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return esito;
    const corpo = (await r.json()) as {
      data?: { reach?: string; frequency?: string; impressions?: string; date_start?: string; date_stop?: string }[];
    };
    for (const riga of corpo.data ?? []) {
      // La riga si riabbina alla finestra per gli estremi che Meta rimanda.
      const f = finestre.find(
        (x) => iso(x.da) === riga.date_start && iso(x.a) === riga.date_stop
      );
      if (!f) continue;
      const frequenza = Number(riga.frequency);
      const copertura = Number(riga.reach);
      if (!Number.isFinite(frequenza) || frequenza <= 0) continue;
      esito.set(f.chiave, {
        frequenza,
        copertura: Number.isFinite(copertura) ? copertura : 0,
        impressioni: Number(riga.impressions) || 0,
      });
    }
  } catch {
    // Meta lenta o giù: il KPI dirà «—», la pagina vive.
  }
  return esito;
}

// ── CENSIMENTO STORICO: quante campagne c'erano, anno per anno ──────────────
//
// ⚠️ PERCHÉ NON RIUSA `leggiMetricheMeta`: quella chiede una riga PER GIORNO
// (`time_increment: "1"`), che su tre anni vuol dire decine di migliaia di
// righe da paginare per poi buttarle via — e il dettaglio giornaliero qui non
// serve a nessuno. Questa chiede il MESE e aggrega per anno.
//
// ⚠️ Meta restituisce solo le campagne che hanno EROGATO nel periodo: una
// campagna creata e mai avviata non compare, e va detto invece di lasciar
// credere che l'elenco sia l'anagrafica completa.
export type RigaStoricoMeta = {
  idEsterno: string;
  nome: string;
  anno: number;
  spesa: number;
  impression: number;
  click: number;
  conversioni: number;
  ricavi: number;
  primoMese: number;
  ultimoMese: number;
  mesiAttivi: number;
};

export async function censimentoStoricoMeta(
  idAccount: string,
  dal: string,
  al: string
): Promise<{ righe: RigaStoricoMeta[]; errore: string | null; mesiLetti: number }> {
  const t = token();
  if (!t) return { righe: [], errore: "META_ACCESS_TOKEN non impostato", mesiLetti: 0 };

  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,date_start",
    time_range: JSON.stringify({ since: dal, until: al }),
    time_increment: "monthly",
    limit: "500",
    access_token: t,
  });

  // chiave: idCampagna|anno
  const per = new Map<string, RigaStoricoMeta>();
  let mesiLetti = 0;
  let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/insights?${params.toString()}`;
  let pagine = 0;

  try {
    while (url && pagine < 120) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        const e = corpo.error ?? {};
        return {
          righe: [...per.values()],
          errore: `Meta ha risposto ${risposta.status}: ${e.message ?? "errore sconosciuto"}${e.code ? ` (codice ${e.code})` : ""}`,
          mesiLetti,
        };
      }
      for (const d of corpo.data ?? []) {
        mesiLetti++;
        const giorno = String(d.date_start ?? "");
        const anno = Number(giorno.slice(0, 4));
        const mese = Number(giorno.slice(5, 7));
        if (!Number.isInteger(anno) || !Number.isInteger(mese)) continue;
        const id = String(d.campaign_id);
        const chiave = `${id}|${anno}`;
        const spesa = Number(d.spend ?? 0) || 0;
        const v =
          per.get(chiave) ??
          ({
            idEsterno: id,
            nome: String(d.campaign_name ?? "senza nome"),
            anno,
            spesa: 0,
            impression: 0,
            click: 0,
            conversioni: 0,
            ricavi: 0,
            primoMese: mese,
            ultimoMese: mese,
            mesiAttivi: 0,
          } as RigaStoricoMeta);
        v.spesa += spesa;
        v.impression += Number(d.impressions ?? 0) || 0;
        v.click += Number(d.clicks ?? 0) || 0;
        v.conversioni += valoreAzione(d.actions, TIPI_ACQUISTO);
        v.ricavi += valoreAzione(d.action_values, TIPI_ACQUISTO);
        // ⚠️ «Attivo» = ha speso. Un mese con una riga a zero non è un mese in
        // cui la campagna girava: Meta manda righe anche per mesi vuoti.
        if (spesa > 0) {
          v.mesiAttivi++;
          v.primoMese = Math.min(v.primoMese, mese);
          v.ultimoMese = Math.max(v.ultimoMese, mese);
        }
        per.set(chiave, v);
      }
      url = corpo.paging?.next ?? "";
      pagine++;
    }
  } catch (e) {
    return {
      righe: [...per.values()],
      errore: `Chiamata a Meta fallita: ${String(e).slice(0, 160)}`,
      mesiLetti,
    };
  }

  return { righe: [...per.values()], errore: null, mesiLetti };
}

// ────────────────────────────────────────────────────────────────────────────
// GLI AD SET (i «gruppi» di Meta)
//
// ⚠️⚠️ **PERCHÉ NON C'ERANO, ed è la base di tutto il resto (11/09/2026).**
// L'app censiva i gruppi di annunci di Google e NIENTE per Meta: sulla scheda
// di una campagna Meta si leggeva «Gruppi di annunci (0)», e non era un dato
// mancante — era un oggetto che non esisteva. Senza gli ad set non si può
// mostrare dove va la spesa dentro la campagna, e non si può agire su un
// pezzo: né fermarlo, né cambiargli budget. Ogni decisione restava «tutta la
// campagna o niente», che su una campagna da 35 €/g con quattro ad set vuol
// dire non poter decidere.
//
// ⚠️ Come per le campagne, **le archiviate vanno chieste**: il nodo /adsets
// senza filtro riporta solo ACTIVE e PAUSED, e un ad set archiviato non
// comparirebbe — indistinguibile da «non esiste». Stesso ripiego: se Meta
// rifiuta il filtro (i valori ammessi cambiano fra versioni della Graph API)
// si riparte senza, perché un elenco parziale è meglio di nessun elenco.
export type AdSetMeta = {
  id: string;
  nome: string;
  idCampagna: string;
  stato: string;
  effettivo: string | null;
  /** Budget giornaliero in euro, se l'ad set ne ha uno suo (con la CBO sta sulla campagna). */
  budgetGiorno: number | null;
  /** Budget totale in euro, per gli ad set a durata. */
  budgetTotale: number | null;
  obiettivoOttimizzazione: string | null;
  inizio: string | null;
  fine: string | null;
  /**
   * ⚠️ CON QUALE FINESTRA META CONTA I RISULTATI: «7 giorni dal clic, 1 giorno
   * dalla visualizzazione» è il default, ma si cambia per ad set.
   *
   * Senza questo numero i risultati di Meta e quelli di Orders **non sono
   * confrontabili**, e non per un errore di qualcuno: Meta attribuisce a
   * un'inserzione anche un ordine arrivato sei giorni dopo il clic, e perfino
   * uno di chi l'ha solo VISTA il giorno prima. Orders conta l'ordine il
   * giorno in cui è stato pagato. Mettere i due numeri accanto senza dire la
   * finestra è confrontare due cose diverse chiamandole uguali.
   */
  attribuzione: string | null;
  /** L'evento che compra l'asta (`ACQUISTO`, `AGGIUNTA_AL_CARRELLO`…) e il pixel su cui lo legge. */
  eventoOttimizzato: string | null;
  pixel: string | null;
};

// Le finestre di attribuzione, dette in italiano. Meta le manda come coppie
// (`event_type`, `window_days`), e lasciarle in inglese in pagina vorrebbe
// dire far tradurre a mente una cosa che decide come si leggono i numeri.
function raccontaAttribuzione(spec: unknown): string | null {
  if (!Array.isArray(spec) || spec.length === 0) return null;
  const pezzi: string[] = [];
  for (const v of spec as Array<Record<string, unknown>>) {
    const tipo = String(v.event_type ?? "");
    const giorni = Number(v.window_days ?? 0);
    if (!tipo || !giorni) continue;
    const come =
      tipo === "CLICK_THROUGH" ? "dal clic" : tipo === "VIEW_THROUGH" ? "dalla visualizzazione" : tipo;
    pezzi.push(`${giorni} ${giorni === 1 ? "giorno" : "giorni"} ${come}`);
  }
  return pezzi.length > 0 ? pezzi.join(" · ") : null;
}

export async function leggiAdSetMeta(
  idAccount: string
): Promise<{ adset: AdSetMeta[]; errore: string | null }> {
  const t = token();
  if (!t) return { adset: [], errore: "META_ACCESS_TOKEN non impostato" };

  const CON_ARCHIVIATI = JSON.stringify([
    {
      field: "effective_status",
      operator: "IN",
      value: ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "DELETED"],
    },
  ]);
  const parametri = (conFiltro: boolean) => {
    const q = new URLSearchParams({
      fields:
        "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time",
      limit: "500",
      access_token: t,
    });
    if (conFiltro) q.set("filtering", CON_ARCHIVIATI);
    return q;
  };

  const adset: AdSetMeta[] = [];
  try {
    let conFiltro = true;
    let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/adsets?${parametri(true).toString()}`;
    let pagine = 0;
    while (url && pagine < 20) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        if (conFiltro) {
          // Il filtro non è passato: si riprova senza, una volta sola.
          conFiltro = false;
          pagine = 0;
          adset.length = 0;
          url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/adsets?${parametri(false).toString()}`;
          continue;
        }
        return {
          adset,
          errore: String(corpo?.error?.message ?? `HTTP ${risposta.status}`),
        };
      }
      for (const r of (corpo.data ?? []) as Record<string, unknown>[]) {
        // ⚠️ Meta manda i budget in CENTESIMI, come stringa. Dimenticarlo
        // significa scrivere 3.500 €/g dove ce ne sono 35 — è già successo
        // nella scrittura (vedi `budgetMeta`), qui si divide leggendo.
        const cent = (v: unknown) => (v == null || v === "" ? null : Number(v) / 100);
        adset.push({
          id: String(r.id),
          nome: String(r.name ?? "(senza nome)"),
          idCampagna: String(r.campaign_id ?? ""),
          stato: String(r.status ?? ""),
          effettivo: r.effective_status ? String(r.effective_status) : null,
          budgetGiorno: cent(r.daily_budget),
          budgetTotale: cent(r.lifetime_budget),
          obiettivoOttimizzazione: r.optimization_goal ? String(r.optimization_goal) : null,
          // ⚠️ La sync NON chiede attribuzione, evento e pixel: sono tre campi
          // in più per 437 ad set a ogni giro, e nessuno li salva (non hanno
          // una colonna). Li legge la pagina, sul nodo della campagna, dove
          // gli ad set sono due o tre. `null` qui vuol dire «non chiesto», e
          // chi legge la sync non deve confonderlo con «non impostato».
          attribuzione: null,
          eventoOttimizzato: null,
          pixel: null,
          inizio: r.start_time ? String(r.start_time) : null,
          fine: r.end_time ? String(r.end_time) : null,
        });
      }
      url = String((corpo.paging?.next as string) ?? "");
      pagine++;
    }
    return { adset, errore: null };
  } catch (e) {
    return { adset, errore: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LE METRICHE PER AD SET
//
// ⚠️⚠️ **PERCHÉ SERVONO (11/09/2026).** Censire gli ad set senza i loro numeri
// dà una tabella di righe a zero: si vede che una campagna ha due ad set e non
// si vede quale dei due si mangia il budget — che è l'unica domanda per cui si
// guarda dentro una campagna. Le insights di Meta si chiedono per LIVELLO: le
// stesse chiamate con `level=adset` portano la stessa riga giornaliera, con
// `adset_id` invece di `campaign_id`.
//
// ⚠️ Valore e conversioni restano gli ACQUISTI (`omni_purchase`), come per le
// campagne: è la regola scritta in cima a questo file, e vale a ogni livello.
export type RigaAdSetMeta = {
  idAdSet: string;
  idCampagna: string;
  nome: string;
  data: string;
  spesa: number;
  impression: number;
  click: number;
  conversioni: number;
  ricavi: number;
};

export async function leggiMetricheAdSetMeta(
  idAccount: string,
  dal: string,
  al: string
): Promise<{ righe: RigaAdSetMeta[]; errore: string | null }> {
  const t = token();
  if (!t) return { righe: [], errore: "META_ACCESS_TOKEN non impostato" };

  const params = new URLSearchParams({
    level: "adset",
    fields: "adset_id,adset_name,campaign_id,spend,impressions,clicks,actions,action_values,date_start",
    time_range: JSON.stringify({ since: dal, until: al }),
    time_increment: "1",
    limit: "500",
    access_token: t,
  });

  const righe: RigaAdSetMeta[] = [];
  let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/insights?${params.toString()}`;
  let pagine = 0;
  try {
    while (url && pagine < 40) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        const e = corpo.error ?? {};
        return {
          righe,
          errore: `Meta ha risposto ${risposta.status}: ${e.message ?? "errore sconosciuto"}${e.code ? ` (codice ${e.code})` : ""}`,
        };
      }
      for (const d of corpo.data ?? []) {
        if (!d.adset_id) continue;
        righe.push({
          idAdSet: String(d.adset_id),
          idCampagna: String(d.campaign_id ?? ""),
          nome: String(d.adset_name ?? "senza nome"),
          data: String(d.date_start),
          spesa: Number(d.spend ?? 0) || 0,
          impression: Number(d.impressions ?? 0) || 0,
          click: Number(d.clicks ?? 0) || 0,
          conversioni: valoreAzione(d.actions, TIPI_ACQUISTO),
          ricavi: valoreAzione(d.action_values, TIPI_ACQUISTO),
        });
      }
      url = corpo.paging?.next ?? "";
      pagine++;
    }
  } catch (e) {
    return { righe, errore: `Chiamata a Meta fallita: ${String(e).slice(0, 160)}` };
  }
  return { righe, errore: null };
}

/**
 * Gli ad set di UNA campagna, letti vivi.
 *
 * ⚠️ Perché non si riusa `leggiAdSetMeta(account)`: su Gifts quel giro riporta
 * **437 ad set** (archiviati compresi) e serve alla sync, non a una pagina.
 * Per la scheda di una campagna si chiede il nodo della campagna, che ne
 * riporta i suoi — di solito due o tre — e la pagina resta veloce.
 *
 * ⚠️ Qui NON si filtra sulle archiviate: dentro una campagna viva un ad set
 * archiviato è storia, e mostrarlo confonderebbe. Restano ACTIVE e PAUSED,
 * che è il default del nodo.
 */
export async function leggiAdSetDiCampagnaMeta(
  idCampagna: string
): Promise<{ adset: AdSetMeta[]; errore: string | null }> {
  const t = token();
  if (!t) return { adset: [], errore: "META_ACCESS_TOKEN non impostato" };
  const q = new URLSearchParams({
    fields:
      "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal," +
      // ⚠️ Questi tre non sono decorazione: la finestra di attribuzione decide
      // COME Meta conta i risultati che poi confrontiamo con Orders, e
      // l'evento ottimizzato dice che cosa l'asta sta comprando davvero.
      "attribution_spec,promoted_object,start_time,end_time",
    limit: "100",
    access_token: t,
  });
  try {
    const risposta = await fetch(`${BASE}/${idCampagna}/adsets?${q.toString()}`, { cache: "no-store" });
    const corpo = await risposta.json();
    if (!risposta.ok || corpo.error) {
      return { adset: [], errore: String(corpo?.error?.message ?? `HTTP ${risposta.status}`) };
    }
    const cent = (v: unknown) => (v == null || v === "" ? null : Number(v) / 100);
    const adset: AdSetMeta[] = (corpo.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      nome: String(r.name ?? "(senza nome)"),
      idCampagna: String(r.campaign_id ?? idCampagna),
      stato: String(r.status ?? ""),
      effettivo: r.effective_status ? String(r.effective_status) : null,
      budgetGiorno: cent(r.daily_budget),
      budgetTotale: cent(r.lifetime_budget),
      obiettivoOttimizzazione: r.optimization_goal ? String(r.optimization_goal) : null,
      inizio: r.start_time ? String(r.start_time) : null,
      fine: r.end_time ? String(r.end_time) : null,
      attribuzione: raccontaAttribuzione(r.attribution_spec),
      eventoOttimizzato: (() => {
        const po = (r.promoted_object ?? {}) as Record<string, unknown>;
        return po.custom_event_type ? String(po.custom_event_type) : null;
      })(),
      pixel: (() => {
        const po = (r.promoted_object ?? {}) as Record<string, unknown>;
        return po.pixel_id ? String(po.pixel_id) : null;
      })(),
    }));
    return { adset, errore: null };
  } catch (e) {
    return { adset: [], errore: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * La spesa Meta **per regione**, nel periodo.
 *
 * PERCHÉ ESISTE. Su Google il «dove» di una campagna si legge dal suo
 * targeting, che l'app censisce (`LocalitaCampagna`): su Meta quel censimento
 * non c'è, e le campagne Meta di Deluxy non portano la città nel nome. Senza
 * questa lettura, la tabella per area avrebbe avuto una colonna Meta sempre
 * vuota — e una colonna vuota, accanto a una piena, si legge come «Meta non
 * vende lì», che è un'altra cosa da «non lo sappiamo».
 *
 * ⚠️⚠️ META DÀ LA REGIONE, NON LA CITTÀ. `breakdowns=region` è il taglio
 * geografico più fine che le insights offrono: torna «Lombardy», «Lazio»,
 * «Tuscany». Leggere la Lombardia come «area di Milano» è una nostra lettura
 * (in Lombardia consegniamo solo in città), non un dato di Meta, e la pagina
 * che la mostra lo dichiara. Vedi `areaDaRegioneMeta` in categorie-aree.ts.
 *
 * ⚠️ Non si salva in database: è una lettura di sola visualizzazione, e una
 * tabella nuova sul cluster condiviso per un numero che Meta sa già sarebbe
 * copia di dati altrui (Standard §7). Chi la chiama la mette sotto cache.
 */
export async function leggiSpesaPerRegioneMeta(
  idAccount: string,
  dal: string,
  al: string
): Promise<{ righe: Array<{ regione: string; spesa: number; conversioni: number; ricavi: number }>; errore: string | null }> {
  const t = token();
  if (!t) return { righe: [], errore: "META_ACCESS_TOKEN non impostato" };

  const params = new URLSearchParams({
    level: "account",
    fields: "spend,actions,action_values",
    breakdowns: "region",
    time_range: JSON.stringify({ since: dal, until: al }),
    limit: "500",
    access_token: t,
  });

  const righe: Array<{ regione: string; spesa: number; conversioni: number; ricavi: number }> = [];
  let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/insights?${params.toString()}`;
  let pagine = 0;
  try {
    while (url && pagine < 20) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
        const e = corpo.error ?? {};
        return {
          righe,
          errore: `Meta ha risposto ${risposta.status}: ${e.message ?? "errore sconosciuto"}${e.code ? ` (codice ${e.code})` : ""}`,
        };
      }
      for (const d of corpo.data ?? []) {
        righe.push({
          regione: String(d.region ?? "sconosciuta"),
          spesa: Number(d.spend ?? 0),
          conversioni: valoreAzione(d.actions, TIPI_ACQUISTO),
          ricavi: valoreAzione(d.action_values, TIPI_ACQUISTO),
        });
      }
      url = corpo.paging?.next ?? "";
      pagine++;
    }
    return { righe, errore: null };
  } catch (e) {
    return { righe: [], errore: e instanceof Error ? e.message : String(e) };
  }
}

// ============================ TARGETING ============================

/** Il targeting di un ad set, come lo tiene Meta più un riassunto leggibile. */
export type TargetingAdSet = {
  /** Lo spec INTERO, così come arriva: serve a chi lo riscrive, che deve rimandarlo tutto. */
  grezzo: Record<string, unknown>;
  riassunto: string[];
  /**
   * ⚠️⚠️ I DUE STRATI DEL PUBBLICO, e non sono un dettaglio di presentazione.
   *
   * Con **Advantage+ audience acceso** (`targeting_automation.advantage_audience = 1`)
   * Meta divide il targeting in due cose diverse, e lo scrive a schermo in
   * Ads Manager:
   *  · **Controlli** — «Non raggiungeremo le persone al di là di queste
   *    impostazioni, nemmeno con Advantage+ attivo»: luoghi, **età minima**,
   *    lingue, esclusioni di pubblico. Sono vincoli duri.
   *  · **Suggerisci pubblico** — età (il tetto), genere, interessi e pubblici
   *    personalizzati INCLUSI: sono indicazioni che Meta **scavalca** quando le
   *    conviene.
   *
   * Mostrare «età 27-60» come se fosse un filtro è una frase FALSA sulla
   * consegna reale: quell'ad set può erogare a un trentenne fuori da quel
   * pubblico e a un settantenne. Con Advantage+ spento, invece, tutto è
   * vincolo. Tenere i due elenchi separati è l'unico modo di non far prendere
   * decisioni su un perimetro che non esiste.
   */
  vincoli: string[];
  suggerimenti: string[];
  advantageAcceso: boolean;
  eta: { min: number | null; max: number | null };
  genere: "tutti" | "uomini" | "donne" | "altro";
  paesi: string[];
  citta: Array<{ chiave: string; nome: string; raggioKm: number | null }>;
  regioni: string[];
  pubblici: Array<{ id: string; nome: string | null }>;
  pubbliciEsclusi: Array<{ id: string; nome: string | null }>;
  advantage: boolean | null;
  posizionamenti: string[];
};

const GENERE_META: Record<string, "uomini" | "donne"> = { "1": "uomini", "2": "donne" };

/**
 * Legge il targeting di un ad set e lo traduce in qualcosa che si possa
 * leggere in pagina.
 *
 * ⚠️ Si tiene anche lo spec GREZZO, e non è ridondanza: su Meta il campo
 * `targeting` si scrive **tutto insieme**, quindi chi vuole cambiare l'età
 * deve rimandare anche geografia, pubblici e posizionamenti. Il riassunto
 * serve agli occhi; il grezzo serve alla penna.
 */
export async function leggiTargetingAdSetMeta(
  idAdSet: string
): Promise<{ targeting: TargetingAdSet | null; errore: string | null }> {
  const t = token();
  if (!t) return { targeting: null, errore: "META_ACCESS_TOKEN non impostato" };
  try {
    const q = new URLSearchParams({ fields: "targeting", access_token: t });
    const r = await fetch(`${BASE}/${idAdSet}?${q.toString()}`, { cache: "no-store" });
    const corpo = await r.json();
    if (!r.ok || corpo.error) {
      return { targeting: null, errore: String(corpo?.error?.message ?? `HTTP ${r.status}`) };
    }
    return { targeting: leggiSpecTargeting((corpo.targeting ?? {}) as Record<string, unknown>), errore: null };
  } catch (e) {
    return { targeting: null, errore: e instanceof Error ? e.message : String(e) };
  }
}

/** La traduzione dello spec in parole. Separata dalla lettura per poterla provare da sola. */
export function leggiSpecTargeting(spec: Record<string, unknown>): TargetingAdSet {
  const geo = (spec.geo_locations ?? {}) as Record<string, unknown>;
  const paesi = Array.isArray(geo.countries) ? (geo.countries as string[]).map(String) : [];
  const citta = (Array.isArray(geo.cities) ? (geo.cities as Record<string, unknown>[]) : []).map((c) => ({
    chiave: String(c.key ?? ""),
    // ⚠️ Il nome può non esserci: Meta lo rimanda quasi sempre, ma quando
    // manca si mostra la chiave invece di una riga vuota — una città «senza
    // nome» farebbe credere che il targeting sia rotto.
    nome: String(c.name ?? c.key ?? "senza nome"),
    raggioKm: c.radius == null ? null : Number(c.radius),
  }));
  const regioni = (Array.isArray(geo.regions) ? (geo.regions as Record<string, unknown>[]) : []).map((r) =>
    String(r.name ?? r.key ?? "")
  );
  const pubblico = (v: unknown) =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((p) => ({
      id: String(p.id ?? ""),
      nome: p.name == null ? null : String(p.name),
    }));

  const generi = Array.isArray(spec.genders) ? (spec.genders as unknown[]).map(String) : [];
  const genere: TargetingAdSet["genere"] =
    generi.length === 0 ? "tutti" : generi.length === 1 ? (GENERE_META[generi[0]] ?? "altro") : "tutti";

  const auto = (spec.targeting_automation ?? {}) as Record<string, unknown>;
  const advantage = auto.advantage_audience == null ? null : Number(auto.advantage_audience) === 1;

  const eta = {
    min: spec.age_min == null ? null : Number(spec.age_min),
    max: spec.age_max == null ? null : Number(spec.age_max),
  };
  const posizionamenti = Array.isArray(spec.publisher_platforms)
    ? (spec.publisher_platforms as unknown[]).map(String)
    : [];
  const pubblici = pubblico(spec.custom_audiences);
  const pubbliciEsclusi = pubblico(spec.excluded_custom_audiences);

  const luoghi = [
    ...paesi.map((p) => p),
    ...citta.map((c) => (c.raggioKm ? `${c.nome} +${c.raggioKm} km` : c.nome)),
    ...regioni,
  ];
  const lingue = Array.isArray(spec.locales) ? (spec.locales as unknown[]).length : 0;
  const advantageAcceso = advantage === true;

  // I VINCOLI: valgono sempre, Advantage+ acceso o spento.
  const vincoli: string[] = [];
  vincoli.push(luoghi.length > 0 ? `luoghi: ${luoghi.join(", ")}` : "nessun luogo nello spec");
  if (eta.min != null) vincoli.push(`età minima ${eta.min}`);
  if (lingue > 0) vincoli.push(`${lingue} lingue`);
  if (pubbliciEsclusi.length > 0)
    vincoli.push(`esclusi: ${pubbliciEsclusi.map((p) => p.nome ?? p.id).join(", ")}`);

  // I SUGGERIMENTI: con Advantage+ acceso Meta li scavalca. Con Advantage+
  // spento sono vincoli come gli altri, e infatti finiscono nella stessa lista.
  const morbidi: string[] = [];
  if (eta.max != null) morbidi.push(`fino a ${eta.max} anni`);
  if (genere !== "tutti") morbidi.push(`solo ${genere}`);
  if (pubblici.length > 0) morbidi.push(`pubblici: ${pubblici.map((p) => p.nome ?? p.id).join(", ")}`);
  if (Array.isArray(spec.flexible_spec) && spec.flexible_spec.length > 0) {
    morbidi.push("targetizzazione dettagliata (interessi/comportamenti)");
  }
  const suggerimenti = advantageAcceso ? morbidi : [];
  if (!advantageAcceso) vincoli.push(...morbidi);
  if (posizionamenti.length > 0) vincoli.push(`solo su ${posizionamenti.join(", ")}`);

  // Il riassunto di una riga resta, per chi ha poco spazio: ma dice a quale
  // dei due strati appartiene ogni cosa, invece di elencarle tutte uguali.
  const riassunto: string[] = [...vincoli];
  if (suggerimenti.length > 0) {
    riassunto.push(`suggeriti (Meta può scavalcarli): ${suggerimenti.join(", ")}`);
  }
  if (advantageAcceso) riassunto.push("Advantage+ acceso");

  return {
    grezzo: spec,
    riassunto,
    vincoli,
    suggerimenti,
    advantageAcceso,
    eta,
    genere,
    paesi,
    citta,
    regioni,
    pubblici,
    pubbliciEsclusi,
    advantage,
    posizionamenti,
  };
}

/**
 * I conti pubblicitari che il nostro token VEDE su Meta.
 *
 * PERCHÉ ESISTE (11/09/2026). L'app lavora sui conti che qualcuno ha censito a
 * mano in Impostazioni — tre: Gifts, Flowers, Cake. Aprendo Ads Manager sul
 * computer dell'utente, il conto proposto per primo era un QUARTO
 * (`1298043513875111`) che nell'app non c'è. Se su un conto non censito girano
 * campagne, la loro spesa non entra da nessuna parte: non nel MER, non in
 * `/api/v1/spesa` che le altre app leggono, non nei budget. E il guaio è che
 * **non si vede**: gli elenchi sono pieni di righe, sono solo le righe dei
 * conti che conosciamo.
 *
 * È lo stesso principio degli ad set «che Meta riporta e l'app non ha
 * censito»: quello che manca si dichiara, non si lascia dedurre da un totale
 * che sembra completo.
 */
export async function leggiContiMeta(): Promise<{
  conti: Array<{ id: string; nome: string; stato: number | null; valuta: string | null }>;
  errore: string | null;
}> {
  const t = token();
  if (!t) return { conti: [], errore: "META_ACCESS_TOKEN non impostato" };
  try {
    const q = new URLSearchParams({
      fields: "account_id,name,account_status,currency",
      limit: "200",
      access_token: t,
    });
    const r = await fetch(`${BASE}/me/adaccounts?${q.toString()}`, { cache: "no-store" });
    const corpo = await r.json();
    if (!r.ok || corpo.error) {
      return { conti: [], errore: String(corpo?.error?.message ?? `HTTP ${r.status}`) };
    }
    const conti = (corpo.data ?? []).map((c: Record<string, unknown>) => ({
      // ⚠️ `account_id` è l'id NUDO (senza `act_`), che è la forma con cui i
      // conti sono censiti in AccountAdv: confrontare `act_123` con `123`
      // farebbe risultare «non censiti» tutti e tre quelli che ci sono.
      id: String(c.account_id ?? "").replace(/^act_/, ""),
      nome: String(c.name ?? c.account_id ?? "senza nome"),
      stato: c.account_status == null ? null : Number(c.account_status),
      valuta: c.currency == null ? null : String(c.currency),
    }));
    return { conti, errore: null };
  } catch (e) {
    return { conti: [], errore: e instanceof Error ? e.message : String(e) };
  }
}

// ======================= DIAGNOSTICA DELLE CREATIVITÀ =======================

/**
 * Le tre «valutazioni» che Meta dà a un'inserzione, dette in italiano.
 *
 * ⚠️⚠️ `UNKNOWN` NON È UN VOTO BASSO. Meta lo manda quando l'inserzione non ha
 * abbastanza impression (sotto le 500 circa) per giudicarla: mostrarlo come
 * «sotto la media» vorrebbe dire bocciare una creatività che nessuno ha ancora
 * visto — e far spegnere quella sbagliata.
 */
const VOTO_META: Record<string, string> = {
  ABOVE_AVERAGE: "sopra la media",
  AVERAGE: "nella media",
  BELOW_AVERAGE_35: "sotto la media (ultimo 35%)",
  BELOW_AVERAGE_20: "sotto la media (ultimo 20%)",
  BELOW_AVERAGE_10: "sotto la media (ultimo 10%)",
  UNKNOWN: "non giudicabile: troppe poche impression",
};

export type DiagnosticaAnnuncio = {
  idAnnuncio: string;
  spesa: number;
  impression: number;
  /** I tre voti di pertinenza, già tradotti. `null` quando Meta non li manda. */
  qualita: string | null;
  coinvolgimento: string | null;
  conversione: string | null;
  /** Quanti hanno visto il video fino a quella frazione. `null` se non è un video. */
  video: { p25: number; p50: number; p75: number; p95: number; p100: number; thruplay: number } | null;
  /** CTR sul link, in percentuale: il segnale che l'annuncio parla alla gente giusta. */
  ctrLink: number | null;
};

/**
 * La diagnostica per singola inserzione, letta viva dalle insights.
 *
 * PERCHÉ ESISTE. Era la lacuna che la mappa di Ads Manager (11/09/2026) ha
 * messo al quinto posto, ma è la più economica da colmare: **la curva di
 * ritenzione del video e i tre voti di pertinenza sono l'unico segnale nativo
 * di «creatività stanca»**. Senza, per sapere se un annuncio ha smesso di
 * funzionare si guarda la spesa e si indovina.
 *
 * ⚠️ NON SI SALVA IN DATABASE, e non è pigrizia: salvarla vorrebbe dire sei
 * colonne nuove in `MetricaAnnuncio` — cioè una migrazione sul cluster
 * condiviso con tredici app — per numeri che Meta ricalcola ogni giorno. Si
 * legge quando si guarda, sotto cache; il giorno che servisse lo storico, la
 * migrazione si chiede a chi decide.
 */
export async function leggiDiagnosticaAnnunciMeta(
  idCampagna: string,
  dal: string,
  al: string
): Promise<{ righe: DiagnosticaAnnuncio[]; errore: string | null }> {
  const t = token();
  if (!t) return { righe: [], errore: "META_ACCESS_TOKEN non impostato" };

  const campi = [
    "ad_id",
    "spend",
    "impressions",
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
    "inline_link_click_ctr",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p95_watched_actions",
    "video_p100_watched_actions",
    "video_thruplay_watched_actions",
  ].join(",");

  const q = new URLSearchParams({
    level: "ad",
    fields: campi,
    time_range: JSON.stringify({ since: dal, until: al }),
    limit: "100",
    access_token: t,
  });

  // Le metriche video arrivano come elenchi di azioni: il numero sta in
  // `value`, e la voce che interessa è quella del video (`video_view`).
  const daAzioni = (v: unknown): number => {
    if (!Array.isArray(v)) return 0;
    return (v as Array<Record<string, unknown>>).reduce((s, a) => s + Number(a.value ?? 0), 0);
  };

  try {
    const r = await fetch(`${BASE}/${idCampagna}/insights?${q.toString()}`, { cache: "no-store" });
    const corpo = await r.json();
    if (!r.ok || corpo.error) {
      return { righe: [], errore: String(corpo?.error?.message ?? `HTTP ${r.status}`) };
    }
    const righe: DiagnosticaAnnuncio[] = (corpo.data ?? []).map((d: Record<string, unknown>) => {
      const p25 = daAzioni(d.video_p25_watched_actions);
      const p50 = daAzioni(d.video_p50_watched_actions);
      const p75 = daAzioni(d.video_p75_watched_actions);
      const p95 = daAzioni(d.video_p95_watched_actions);
      const p100 = daAzioni(d.video_p100_watched_actions);
      const thruplay = daAzioni(d.video_thruplay_watched_actions);
      const voto = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s ? (VOTO_META[s] ?? s.toLowerCase().replace(/_/g, " ")) : null;
      };
      return {
        idAnnuncio: String(d.ad_id ?? ""),
        spesa: Number(d.spend ?? 0),
        impression: Number(d.impressions ?? 0),
        qualita: voto(d.quality_ranking),
        coinvolgimento: voto(d.engagement_rate_ranking),
        conversione: voto(d.conversion_rate_ranking),
        // ⚠️ Zero visualizzazioni al 25% vuol dire «non è un video», non «un
        // video che nessuno guarda»: le due cose si vedono uguali in una
        // tabella, e una è una notizia.
        video: p25 > 0 ? { p25, p50, p75, p95, p100, thruplay } : null,
        ctrLink: d.inline_link_click_ctr == null ? null : Number(d.inline_link_click_ctr),
      };
    });
    return { righe, errore: null };
  } catch (e) {
    return { righe: [], errore: e instanceof Error ? e.message : String(e) };
  }
}
