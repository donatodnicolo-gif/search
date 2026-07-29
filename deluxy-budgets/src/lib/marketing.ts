// Client dell'API Marketing (deluxy-marketing): la spesa pubblicitaria **vera**,
// quella che Google e Meta hanno addebitato.
//
// Perché non basta la banca. Fino a ieri la riga ADV del consuntivo veniva
// dalle uscite di banca categorizzate «Pubblicità» nel CFO. Sono due cose
// diverse, e confonderle fa sbagliare le decisioni:
//  - la **banca** vede l'addebito quando la piattaforma incassa — con lo
//    sfasamento del mese, e senza sapere di quale brand o campagna sia;
//  - **Marketing** vede la spesa giorno per giorno, per brand e per canale, che
//    è la stessa base su cui è scritto il budget ADV.
// La banca resta utile come riscontro (è il denaro uscito davvero), ma la fonte
// dell'ADV è una sola: Marketing.
//
// La regola scritta nell'API di Marketing, che qui si rispetta: ogni risposta
// porta un blocco `copertura` e **chi consuma deve guardare
// `copertura.completa` prima di usare `totale`**. Se un account tace, il totale
// è più basso del vero: mostrarlo come se fosse completo direbbe «si è speso
// meno», che è esattamente la conclusione sbagliata.

import { RIVALIDA } from "./cache";
import { chiave } from "./chiavi";

const BASE = process.env.MARKETING_URL ?? "https://deluxy-marketing.vercel.app";

export type CoperturaAdv = {
  completa: boolean;
  ultimoGiornoConDati: string | null;
  giorniCoperti: number;
  giorniRichiesti: number;
  silenziosi: { canale: string; brand: string; nome: string | null }[];
  avvertenze: string[];
};

// Un conto che alimenta il dato solo per una parte del periodo non è
// «silenzioso» per Marketing — qualche dato l'ha mandato — ma per chi somma
// dodici mesi è quasi la stessa cosa: i mesi scoperti valgono zero e il totale
// dell'anno risulta più basso del vero. Sotto questa quota di giorni coperti si
// dichiara, invece di ereditare un `completa: true` che qui non regge.
const QUOTA_GIORNI_MINIMA = 0.8;

export type SpesaAdv = {
  totale: number;
  // 12 caselle, indice 0 = gennaio: i mesi fuori dal periodo chiesto restano a 0.
  mese: number[];
  periodo: { dal: string; al: string };
  copertura: CoperturaAdv;
};

export type SpesaAdvResult =
  | { ok: true; dati: SpesaAdv }
  | { ok: false; errore: string; configurato: boolean };

// Ultimo giorno del mese `m` dell'anno `anno`, mai oltre oggi: chiedere fino al
// 31 dicembre quando siamo a luglio farebbe risultare «parziale» un periodo che
// parziale non è — i giorni che non sono ancora passati non sono un buco.
function fineIntervallo(anno: number, m: number): string {
  const fineMese = new Date(Date.UTC(anno, m, 0));
  const oggi = new Date();
  oggi.setUTCHours(0, 0, 0, 0);
  const scelto = fineMese.getTime() < oggi.getTime() ? fineMese : oggi;
  return scelto.toISOString().slice(0, 10);
}

// La spesa ADV dei mesi `dal`..`al` di `anno`, mese per mese.
export async function fetchSpesaAdv(anno: number, dal: number, al: number): Promise<SpesaAdvResult> {
  const key = await chiave("MARKETING_API_KEY");
  if (!key) {
    return {
      ok: false,
      configurato: false,
      errore:
        "Chiave Marketing non configurata: impostala in Configurazione → Chiavi (MARKETING_API_KEY). Senza, l'ADV a consuntivo ripiega sulle uscite di banca.",
    };
  }
  const dalIso = `${anno}-${String(dal).padStart(2, "0")}-01`;
  const alIso = fineIntervallo(anno, al);
  if (alIso < dalIso) {
    // Periodo interamente nel futuro: non è un errore, semplicemente non c'è
    // niente da spendere ancora.
    return {
      ok: true,
      dati: {
        totale: 0,
        mese: Array(12).fill(0),
        periodo: { dal: dalIso, al: alIso },
        copertura: {
          completa: true, ultimoGiornoConDati: null, giorniCoperti: 0, giorniRichiesti: 0,
          silenziosi: [], avvertenze: [],
        },
      },
    };
  }

  try {
    const qs = new URLSearchParams({ dal: dalIso, al: alIso, raggruppa: "mese" });
    const res = await fetch(`${BASE}/api/v1/spesa?${qs.toString()}`, {
      headers: { "x-api-key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      return { ok: false, configurato: true, errore: "Chiave Marketing non valida (401): controlla MARKETING_API_KEY." };
    }
    if (!res.ok) return { ok: false, configurato: true, errore: `Marketing ha risposto ${res.status}.` };

    const b = (await res.json()) as {
      totale?: number;
      righe?: { chiave: string; spesa: number }[];
      copertura?: Partial<CoperturaAdv> & {
        alimentano?: { canale: string; brand: string; giorniConDati: number }[];
      };
    };
    if (typeof b?.totale !== "number") {
      return { ok: false, configurato: true, errore: "Risposta di Marketing non riconosciuta." };
    }

    // `chiave` di ogni riga è "AAAA-MM": si prendono solo i mesi dell'anno
    // chiesto, così un periodo a cavallo d'anno non finisce nella casella
    // sbagliata.
    const mese = Array(12).fill(0) as number[];
    for (const r of b.righe ?? []) {
      const [a, m] = String(r.chiave).split("-");
      if (Number(a) !== anno) continue;
      const i = Number(m) - 1;
      if (i >= 0 && i < 12) mese[i] += r.spesa ?? 0;
    }

    const c = b.copertura ?? {};
    const giorniRichiesti = c.giorniRichiesti ?? 0;
    const parziali = (c.alimentano ?? []).filter(
      (a) => giorniRichiesti > 0 && a.giorniConDati < giorniRichiesti * QUOTA_GIORNI_MINIMA
    );
    const avvertenze = [...(c.avvertenze ?? [])];
    if (parziali.length > 0) {
      avvertenze.push(
        `${parziali.length} account hanno dati solo su una parte del periodo (${parziali
          .map((a) => `${a.brand}/${a.canale}: ${a.giorniConDati} giorni su ${giorniRichiesti}`)
          .join("; ")}): nei mesi scoperti quella spesa manca del tutto.`
      );
    }

    return {
      ok: true,
      dati: {
        totale: b.totale,
        mese,
        periodo: { dal: dalIso, al: alIso },
        copertura: {
          // In dubbio si dichiara **incompleta**: un totale pubblicitario più
          // basso del vero fa sembrare che ci sia margine dove non c'è.
          completa: c.completa === true && parziali.length === 0,
          ultimoGiornoConDati: c.ultimoGiornoConDati ?? null,
          giorniCoperti: c.giorniCoperti ?? 0,
          giorniRichiesti,
          silenziosi: (c.silenziosi ?? []).map((s) => ({
            canale: s.canale, brand: s.brand, nome: (s as { nome?: string }).nome ?? null,
          })),
          avvertenze,
        },
      },
    };
  } catch {
    return { ok: false, configurato: true, errore: "Marketing non raggiungibile: riprova più tardi." };
  }
}
