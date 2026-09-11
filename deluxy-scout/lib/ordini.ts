// Lettura del venduto da **Deluxy Orders**, il registro centralizzato degli
// ordini Shopify. Passa dalla Edge Function `ordini`, che custodisce la chiave
// lato server (nel bundle web sarebbe leggibile da chiunque).
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { sommaPerSigla, type FatturatoProvince } from '@/lib/fatturato-province';

/**
 * La copertura SALVATA: le due risposte lente (registro e venduto) messe da
 * parte dal lavoro notturno, lette con una query sola.
 *
 * ⚠️ Qui non si calcola niente: si restituiscono i dati grezzi, e il conto
 * resta dov'è sempre stato (nel componente). Salvare il risultato avrebbe
 * messo la stessa regola in due posti.
 */
export async function fetchCoperturaSalvata(): Promise<{
  partner: any[] | null;
  completo: boolean;
  vendite: Record<string, RispostaProvince>;
  aggiornatoIl: string | null;
}> {
  const { data, error } = await supabase.from('copertura_cache').select('chiave, dati, aggiornato_il');
  if (error || !data?.length) return { partner: null, completo: true, vendite: {}, aggiornatoIl: null };
  let partner: any[] | null = null;
  let completo = true;
  let aggiornatoIl: string | null = null;
  const vendite: Record<string, RispostaProvince> = {};
  for (const r of data as any[]) {
    if (!aggiornatoIl || r.aggiornato_il > aggiornatoIl) aggiornatoIl = r.aggiornato_il;
    if (r.chiave === 'partner') {
      partner = r.dati?.partner ?? [];
      completo = r.dati?.completo !== false;
    } else if (String(r.chiave).startsWith('vendite:')) {
      const p = r.dati ?? {};
      vendite[String(r.chiave).slice(8)] = {
        province: p.province ?? [],
        totaleProvince: Number(p.totaleProvince ?? 0),
        senzaProvincia: p.senzaProvincia ?? { ordini: 0, lordo: 0 },
        nonCollegato: false,
      };
    }
  }
  return { partner, completo, vendite, aggiornatoIl };
}

/** Rilancia il lavoro che riempie la copertura salvata (bottone «Ricalcola»). */
export async function aggiornaCoperturaSalvata(): Promise<void> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/ordini`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: 'aggiorna_copertura' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) throw new Error(j?.error ?? j?.reason ?? 'Aggiornamento non riuscito.');
}

export interface VenditeProvincia {
  provincia: string; // com'è scritta negli ordini: sigla di targa, a volte estera
  ordini: number;
  lordo: number;
  clienti: number;
  // La divisione per tipo di prodotto. ⚠️ Le tre sommano ESATTE a `lordo`:
  // ogni ordine sta in una sola colonna, e i misti torte+fiori vanno dove
  // pesano di più (lo decide Orders, che possiede la classificazione).
  torte?: number;
  fiori?: number;
  altro?: number;
}

export interface RispostaProvince {
  province: VenditeProvincia[];
  totaleProvince: number;
  /** Ordini il cui indirizzo non ha la provincia: un terzo del fatturato. */
  senzaProvincia: { ordini: number; lordo: number; nota?: string };
  /** true = la chiave verso Orders non è configurata: nessun dato di vendita. */
  nonCollegato?: boolean;
}

/**
 * Il venduto per provincia, su tutto lo storico (o su un anno).
 *
 * ⚠️ Non fa fallire chi la chiama: se Orders non è collegato torna una risposta
 * vuota con `nonCollegato: true`. La vista Province deve poter mostrare partner
 * e prospect anche quando i numeri di vendita mancano — sono due informazioni
 * indipendenti, e perderle entrambe per colpa di una chiave sarebbe assurdo.
 */
export async function fetchVenditePerProvincia(
  opz: { anno?: number; da?: string; a?: string } = {},
): Promise<RispostaProvince> {
  const vuota: RispostaProvince = {
    province: [],
    totaleProvince: 0,
    senzaProvincia: { ordini: 0, lordo: 0 },
    nonCollegato: true,
  };
  try {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/ordini`;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // `a` è ESCLUSIVA in Orders (data < a): i confini li calcola il browser,
      // non il server — su Vercel il runtime è UTC e la mezzanotte italiana
      // sono le 02:00, cioè due ore di ogni giorno finirebbero nel mese prima.
      body: JSON.stringify({
        action: 'province',
        ...(opz.anno ? { anno: opz.anno } : {}),
        ...(opz.da ? { da: opz.da } : {}),
        ...(opz.a ? { a: opz.a } : {}),
      }),
    });
    if (!res.ok) return vuota;
    const j = await res.json();
    // `ok:false` = la funzione risponde ma la chiave non c'è (non_configurato).
    if (j?.ok === false || !Array.isArray(j?.province)) return vuota;
    return {
      province: j.province as VenditeProvincia[],
      totaleProvince: Number(j.totaleProvince ?? 0),
      senzaProvincia: j.senzaProvincia ?? { ordini: 0, lordo: 0 },
      nonCollegato: false,
    };
  } catch {
    return vuota;
  }
}

/**
 * IL FATTURATO DI OGNI PROVINCIA (11/09/2026), per la colonna «Fatt.
 * provincia» dei Selezionati.
 *
 * ⚠️ È lo STESSO dato della scheda Copertura di Affiliazioni, dalla stessa
 * fonte: prima la **vista salvata** (`copertura_cache`, una query sola invece
 * della chiamata lenta a Orders), poi il ripiego sul calcolo dal vivo. Il
 * venduto è di Deluxy Orders: qui si somma per sigla e basta.
 *
 * Periodo: **tutto lo storico**. È la domanda vera davanti a un negozio
 * segnalato («questa zona vende?»), ed è l'unica risposta che non cambia
 * mentre si scorre l'elenco.
 *
 * ⚠️ Non lancia mai: senza Orders collegato torna `collegato: false` e la
 * colonna resta vuota, invece di spegnere l'elenco dei negozi.
 */
export async function fetchFatturatoProvince(): Promise<FatturatoProvince> {
  const vuoto: FatturatoProvince = { perSigla: new Map(), aggiornatoIl: null, collegato: false, senzaProvincia: 0 };
  try {
    const salvata = await fetchCoperturaSalvata().catch(() => null);
    const dallaVista = salvata?.vendite?.tutto;
    if (dallaVista) {
      return {
        perSigla: sommaPerSigla(dallaVista.province),
        aggiornatoIl: salvata?.aggiornatoIl ?? null,
        collegato: true,
        senzaProvincia: dallaVista.senzaProvincia?.lordo ?? 0,
      };
    }
    const vive = await fetchVenditePerProvincia({});
    if (vive.nonCollegato) return vuoto;
    return {
      perSigla: sommaPerSigla(vive.province),
      aggiornatoIl: null,
      collegato: true,
      senzaProvincia: vive.senzaProvincia?.lordo ?? 0,
    };
  } catch {
    return vuoto;
  }
}
