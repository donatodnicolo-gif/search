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
import { eur } from "./format";

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

// …e la soglia da sola non basta. Misurato il 21/08/2026: `flowers/meta_ads`
// era a 103 giorni su 229 (l'avvertenza si vedeva), poi il caricamento lo ha
// portato a 191 su 233 — sopra l'80%, quindi `completa` è tornato `true` e i
// **42 giorni ancora scoperti sono spariti da ogni pagina**. Il buco non si era
// chiuso, aveva solo attraversato una soglia. Da qui in poi un account che non
// copre tutto il periodo si dichiara comunque, con la stima di quanto manca —
// salvo i pochi giorni di ritardo con cui le piattaforme consolidano l'ultimo
// dato, che non sono un buco ma latenza.
const GIORNI_DI_LATENZA = 7;

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
        alimentano?: { canale: string; brand: string; giorniConDati: number; spesa?: number }[];
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

    // Gli account che il buco ce l'hanno ma restano sopra la soglia: non
    // rendono il totale inutilizzabile, però lo tengono più basso del vero, e
    // finché non si scrive qui nessuna pagina lo dice. La stima è al loro
    // stesso ritmo di spesa (spesa ÷ giorni con dati × giorni mancanti): non è
    // il dato mancante, è l'ordine di grandezza di quanto manca.
    const bucati = (c.alimentano ?? []).filter(
      (a) =>
        giorniRichiesti > 0 &&
        !parziali.includes(a) &&
        giorniRichiesti - a.giorniConDati > GIORNI_DI_LATENZA
    );
    if (bucati.length > 0) {
      const stima = bucati.reduce((s, a) => {
        if (!a.spesa || a.giorniConDati <= 0) return s;
        return s + (a.spesa / a.giorniConDati) * (giorniRichiesti - a.giorniConDati);
      }, 0);
      avvertenze.push(
        `${bucati.length} account coprono quasi tutto il periodo ma non tutto (${bucati
          .map(
            (a) =>
              `${a.brand}/${a.canale}: mancano ${giorniRichiesti - a.giorniConDati} giorni su ${giorniRichiesti}`
          )
          .join("; ")}): al loro ritmo di spesa sono circa ${eur(stima)} che il totale di Marketing non conta.`
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

// ---- La spesa pubblicitaria **per brand**, mese per mese ----
//
// Serve a `/spese`: per un mese già chiuso la domanda non è più «quanto posso
// spendere» ma «quanto ho speso», e la risposta ce l'ha Marketing, non il
// budget. L'API raggruppa **o** per mese **o** per brand (`raggruppa=brand,mese`
// risponde una lista vuota), quindi si chiede un mese per volta e si compone
// qui: sono N chiamate corte in parallelo, non N viaggi in fila.

// L'abbinamento fra i brand di Marketing e le maison del budget. **Confermato
// dall'utente il 21/08/2026** e non dedotto: `flowers` combacia con lo slug
// della maison, ma `gifts` → Deluxy.it e `cake` → CakeDesign.me nessuna regola
// li avrebbe presi, e attribuire la spesa al brand sbagliato falsa il confronto
// senza che si veda. Torna anche per ordine di grandezza (gen–lug 2026): gifts
// 44.879 € di spesa e 210.818 € di ricavi attribuiti contro i 432.942 € venduti
// da Deluxy.it, flowers 19.750 € contro i 140.556 € di Deluxyflowers.com, cake
// il più piccolo di tutti.
const BRAND_MARKETING: Record<string, string> = {
  gifts: "deluxy",
  flowers: "flowers",
  cake: "cakedesign",
};

export type SpesaPerBrand = {
  ok: boolean;
  errore: string;
  // slug della maison → 12 caselle, indice 0 = gennaio. Una casella a `null`
  // vuol dire **non misurato** (Marketing non ha risposto per quel mese), che
  // non è la stessa cosa di «zero speso»: la pagina deve poterle distinguere.
  perMaison: Map<string, (number | null)[]>;
  // Brand che Marketing conosce e qui non trovano casa: si elencano invece di
  // sparire in silenzio, come già fa il venduto di Orders.
  senzaMaison: string[];
};

export async function fetchSpesaPerBrand(anno: number, mesi: number[]): Promise<SpesaPerBrand> {
  const vuoto: SpesaPerBrand = { ok: false, errore: "", perMaison: new Map(), senzaMaison: [] };
  const key = await chiave("MARKETING_API_KEY");
  if (!key) return { ...vuoto, errore: "Chiave Marketing non configurata." };

  const perMaison = new Map<string, (number | null)[]>();
  const senzaMaison = new Set<string>();
  const caselle = () => Array(12).fill(null) as (number | null)[];

  const risposte = await Promise.all(
    mesi.map(async (m) => {
      const dal = `${anno}-${String(m).padStart(2, "0")}-01`;
      const al = fineIntervallo(anno, m);
      if (al < dal) return { m, righe: [] as { chiave: string; spesa: number }[], ok: true };
      try {
        const qs = new URLSearchParams({ dal, al, raggruppa: "brand" });
        const res = await fetch(`${BASE}/api/v1/spesa?${qs.toString()}`, {
          headers: { "x-api-key": key, "X-App": "deluxy-budgets" },
          next: { revalidate: RIVALIDA },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { m, righe: [], ok: false };
        const b = (await res.json()) as { righe?: { chiave: string; spesa: number }[] };
        return { m, righe: b?.righe ?? [], ok: true };
      } catch {
        return { m, righe: [], ok: false };
      }
    })
  );

  let almenoUna = false;
  for (const r of risposte) {
    if (!r.ok) continue; // mese non misurato: le sue caselle restano `null`
    almenoUna = true;
    for (const riga of r.righe) {
      const slug = BRAND_MARKETING[String(riga.chiave).toLowerCase()];
      if (!slug) {
        senzaMaison.add(String(riga.chiave));
        continue;
      }
      const arr = perMaison.get(slug) ?? caselle();
      arr[r.m - 1] = (arr[r.m - 1] ?? 0) + (riga.spesa ?? 0);
      perMaison.set(slug, arr);
    }
    // I brand che in quel mese non hanno speso niente valgono **zero**, non
    // «non misurato»: il mese è stato interrogato e la risposta è arrivata.
    for (const slug of Object.values(BRAND_MARKETING)) {
      const arr = perMaison.get(slug) ?? caselle();
      if (arr[r.m - 1] === null) arr[r.m - 1] = 0;
      perMaison.set(slug, arr);
    }
  }

  return {
    ok: almenoUna,
    errore: almenoUna ? "" : "Marketing non ha risposto per nessuno dei mesi chiesti.",
    perMaison,
    senzaMaison: [...senzaMaison],
  };
}
