import { chiave as chiaveVault } from "@/lib/chiavi";
import { prisma } from "@/lib/db";

// Connettore TikTok Ads (Business API v1.3).
//
// Come Meta e a differenza di Google: TikTok non ha script che girano dentro
// l'account, quindi è l'app che deve CHIAMARE la Business API con un token.
// Il token si mette in Impostazioni (o in TIKTOK_ACCESS_TOKEN) e non compare
// mai in un indirizzo: TikTok accetta anche `access_token` in query string, ma
// gli indirizzi finiscono nei log dei proxy, quindi qui va nell'header
// `Access-Token`, che è comunque il modo documentato.
//
// I NOMI DELLE METRICHE NON SI INDOVINANO. TikTok cambia il proprio elenco fra
// una versione e l'altra, e chiedere una metrica inesistente fa fallire tutta
// la chiamata con un errore che nomina il campo. Invece di scommettere su un
// elenco lungo, si chiede prima il gruppo completo e — se TikTok lo rifiuta —
// si riprova con il nucleo che c'è di sicuro, dichiarando cosa è stato tolto.
// Meglio spesa e clic veri senza il ROAS, che zero righe e un errore criptico.

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
export const IMP_TOKEN_TIKTOK = "tiktok_access_token";

// Il nucleo: senza questi non c'è niente da salvare.
const METRICHE_BASE = ["spend", "impressions", "clicks"];
// Il gruppo degli acquisti: è quello che può cambiare nome fra le versioni.
const METRICHE_ACQUISTI = ["conversion", "complete_payment", "complete_payment_roas"];

export type RigaTikTok = {
  idCampagna: string;
  nome: string;
  data: string; // AAAA-MM-GG
  spesa: number;
  impression: number;
  click: number;
  conversioni: number;
  ricavi: number;
};

export type EsitoTikTok = {
  righe: RigaTikTok[];
  errore: string | null;
  // Metriche che TikTok ha rifiutato: si dice quali, o l'assenza di ROAS
  // sembra un problema di dati invece che di configurazione.
  metricheRifiutate: string[];
  // Ricavi calcolati da ROAS × spesa invece che letti direttamente.
  ricaviDerivati: boolean;
};

export async function tokenTikTok(): Promise<string | null> {
  const salvato = await prisma.impostazione
    .findUnique({ where: { chiave: IMP_TOKEN_TIKTOK } })
    .catch(() => null);
  const v = (salvato?.valore ?? "").trim();
  if (v) return v;
  const esterno = (await chiaveVault("TIKTOK_ACCESS_TOKEN"))?.replace(/\s+/g, "");
  return esterno && esterno.length > 10 ? esterno : null;
}

export async function tiktokConfigurato(): Promise<boolean> {
  return (await tokenTikTok()) != null;
}

type RispostaTikTok = {
  code?: number;
  message?: string;
  data?: { list?: unknown[]; page_info?: { total_page?: number; page?: number } };
};

async function chiama(
  percorso: string,
  parametri: Record<string, string>,
  token: string
): Promise<{ corpo: RispostaTikTok; httpOk: boolean; stato: number }> {
  const url = `${BASE}${percorso}?${new URLSearchParams(parametri).toString()}`;
  const risposta = await fetch(url, {
    headers: { "Access-Token": token, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const corpo = (await risposta.json().catch(() => ({}))) as RispostaTikTok;
  return { corpo, httpOk: risposta.ok, stato: risposta.status };
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Metriche giornaliere per campagna di un advertiser TikTok.
 *
 * `idAdvertiser` è l'ID numerico dell'account pubblicitario.
 */
export async function leggiMetricheTikTok(
  idAdvertiser: string,
  dal: string,
  al: string
): Promise<EsitoTikTok> {
  const token = await tokenTikTok();
  if (!token) {
    return {
      righe: [],
      errore: "Token TikTok non impostato: si mette in Impostazioni → TikTok Ads.",
      metricheRifiutate: [],
      ricaviDerivati: false,
    };
  }

  const tentativi: string[][] = [
    [...METRICHE_BASE, ...METRICHE_ACQUISTI],
    [...METRICHE_BASE, "conversion"],
    METRICHE_BASE,
  ];

  let ultimoErrore = "";
  for (let i = 0; i < tentativi.length; i++) {
    const metriche = tentativi[i];
    const esito = await scarica(idAdvertiser, dal, al, metriche, token);

    if (esito.errore == null) {
      const rifiutate = tentativi[0].filter((m) => !metriche.includes(m));
      return { ...esito, metricheRifiutate: rifiutate };
    }

    ultimoErrore = esito.errore;
    // Si riprova SOLO se l'errore riguarda le metriche. Un token scaduto o un
    // advertiser sbagliato non si risolve chiedendo meno campi: insistere
    // nasconderebbe la causa vera dietro tre tentativi identici.
    const suMetriche = /metric|field|param|invalid/i.test(esito.errore);
    if (!suMetriche || i === tentativi.length - 1) break;
  }

  return { righe: [], errore: ultimoErrore, metricheRifiutate: [], ricaviDerivati: false };
}

async function scarica(
  idAdvertiser: string,
  dal: string,
  al: string,
  metriche: string[],
  token: string
): Promise<Omit<EsitoTikTok, "metricheRifiutate">> {
  const righe: RigaTikTok[] = [];
  let ricaviDerivati = false;
  let pagina = 1;
  let pagineTotali = 1;

  try {
    while (pagina <= pagineTotali && pagina <= 50) {
      const { corpo, httpOk, stato } = await chiama(
        "/report/integrated/get/",
        {
          advertiser_id: idAdvertiser,
          report_type: "BASIC",
          data_level: "AUCTION_CAMPAIGN",
          dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
          metrics: JSON.stringify(["campaign_name", ...metriche]),
          start_date: dal,
          end_date: al,
          page: String(pagina),
          page_size: "1000",
        },
        token
      );

      // TikTok risponde 200 anche quando rifiuta: l'esito vero è in `code`.
      // Fermarsi al solo status HTTP significherebbe salvare zero righe
      // credendo che l'account sia vuoto.
      if (!httpOk || (corpo.code ?? 0) !== 0) {
        return {
          righe,
          errore: `TikTok ha risposto ${corpo.code ?? stato}: ${corpo.message ?? "errore sconosciuto"}`,
          ricaviDerivati,
        };
      }

      const lista = corpo.data?.list ?? [];
      for (const voce of lista) {
        const v = voce as { dimensions?: Record<string, unknown>; metrics?: Record<string, unknown> };
        const d = v.dimensions ?? {};
        const m = v.metrics ?? {};
        const giorno = String(d.stat_time_day ?? "").slice(0, 10);
        if (!giorno) continue;

        const spesa = numero(m.spend);
        // Il valore degli acquisti TikTok lo dà come ROAS, non come importo:
        // moltiplicare per la spesa è l'unico modo di averlo in euro, e va
        // detto — è un numero calcolato, non un numero letto.
        const roas = numero(m.complete_payment_roas);
        let ricavi = 0;
        if (roas > 0 && spesa > 0) {
          ricavi = roas * spesa;
          ricaviDerivati = true;
        }

        righe.push({
          idCampagna: String(d.campaign_id ?? ""),
          nome: String(m.campaign_name ?? "senza nome"),
          data: giorno,
          spesa,
          impression: numero(m.impressions),
          click: numero(m.clicks),
          // Gli acquisti veri vengono prima delle conversioni generiche: una
          // campagna può ottimizzare un evento a monte, e contarlo come
          // vendita gonfierebbe il ritorno.
          conversioni: numero(m.complete_payment) || numero(m.conversion),
          ricavi,
        });
      }

      pagineTotali = Number(corpo.data?.page_info?.total_page ?? 1) || 1;
      pagina++;
    }
  } catch (e) {
    return { righe, errore: `Chiamata a TikTok fallita: ${String(e).slice(0, 160)}`, ricaviDerivati };
  }

  return { righe, errore: null, ricaviDerivati };
}

// Stato e budget: il report non li porta, stanno sul nodo delle campagne.
export async function leggiStatoCampagneTikTok(idAdvertiser: string): Promise<{
  stati: Map<string, { stato: string; budget: number | null; obiettivo: string | null }>;
  errore: string | null;
}> {
  const stati = new Map<string, { stato: string; budget: number | null; obiettivo: string | null }>();
  const token = await tokenTikTok();
  if (!token) return { stati, errore: "Token TikTok non impostato" };

  try {
    let pagina = 1;
    let pagineTotali = 1;
    while (pagina <= pagineTotali && pagina <= 20) {
      const { corpo, httpOk, stato } = await chiama(
        "/campaign/get/",
        { advertiser_id: idAdvertiser, page: String(pagina), page_size: "1000" },
        token
      );
      if (!httpOk || (corpo.code ?? 0) !== 0) {
        return { stati, errore: `TikTok ha risposto ${corpo.code ?? stato}: ${corpo.message ?? "errore"}` };
      }
      for (const voce of corpo.data?.list ?? []) {
        const c = voce as Record<string, unknown>;
        const id = String(c.campaign_id ?? "");
        if (!id) continue;
        const operativo = String(c.operation_status ?? c.secondary_status ?? "").toUpperCase();
        stati.set(id, {
          stato: operativo.includes("ENABLE") || operativo.includes("DELIVER") ? "attiva" : "in_pausa",
          budget: c.budget != null ? numero(c.budget) : null,
          obiettivo: c.objective_type ? String(c.objective_type) : null,
        });
      }
      pagineTotali = Number(corpo.data?.page_info?.total_page ?? 1) || 1;
      pagina++;
    }
  } catch (e) {
    return { stati, errore: `Chiamata a TikTok fallita: ${String(e).slice(0, 160)}` };
  }

  return { stati, errore: null };
}
