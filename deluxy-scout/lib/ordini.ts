// Lettura del venduto da **Deluxy Orders**, il registro centralizzato degli
// ordini Shopify. Passa dalla Edge Function `ordini`, che custodisce la chiave
// lato server (nel bundle web sarebbe leggibile da chiunque).
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface VenditeProvincia {
  provincia: string; // com'è scritta negli ordini: sigla di targa, a volte estera
  ordini: number;
  lordo: number;
  clienti: number;
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
export async function fetchVenditePerProvincia(anno?: number): Promise<RispostaProvince> {
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
      body: JSON.stringify({ action: 'province', ...(anno ? { anno } : {}) }),
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
