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
