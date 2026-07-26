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

  const params = new URLSearchParams({
    fields: "id,name,status,effective_status,daily_budget,objective",
    limit: "500",
    access_token: t,
  });

  try {
    let url = `${BASE}/act_${idAccount.replace(/^act_/, "")}/campaigns?${params.toString()}`;
    let pagine = 0;
    while (url && pagine < 20) {
      const risposta = await fetch(url, { cache: "no-store" });
      const corpo = await risposta.json();
      if (!risposta.ok || corpo.error) {
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
