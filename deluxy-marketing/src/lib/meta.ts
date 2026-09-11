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
};

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
      "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time",
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

  const riassunto: string[] = [];
  riassunto.push(
    eta.min == null && eta.max == null ? "età: come Meta decide" : `età ${eta.min ?? "?"}-${eta.max ?? "?"}`
  );
  if (genere !== "tutti") riassunto.push(`solo ${genere}`);
  const luoghi = [
    ...paesi.map((p) => p),
    ...citta.map((c) => (c.raggioKm ? `${c.nome} +${c.raggioKm} km` : c.nome)),
    ...regioni,
  ];
  riassunto.push(luoghi.length > 0 ? `luoghi: ${luoghi.join(", ")}` : "nessun luogo nello spec");
  if (pubblici.length > 0) riassunto.push(`pubblici: ${pubblici.map((p) => p.nome ?? p.id).join(", ")}`);
  if (pubbliciEsclusi.length > 0)
    riassunto.push(`esclusi: ${pubbliciEsclusi.map((p) => p.nome ?? p.id).join(", ")}`);
  if (posizionamenti.length > 0) riassunto.push(`solo su ${posizionamenti.join(", ")}`);
  if (advantage === true) riassunto.push("Advantage+ acceso (Meta può allargare il pubblico)");

  return { grezzo: spec, riassunto, eta, genere, paesi, citta, regioni, pubblici, pubbliciEsclusi, advantage, posizionamenti };
}
