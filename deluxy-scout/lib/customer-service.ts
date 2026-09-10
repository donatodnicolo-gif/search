// Lettura LIVE dal Deluxy Customer Service (deluxy-messaging), tramite la Edge
// Function `customer-service` che custodisce la chiave. Regola d'oro: il CS è
// la casa dell'assegnazione ordine → fornitore, Scout la legge e non la copia.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { indiceVendite, type IndiceVendite, type VenditeFornitore } from '@/lib/vendite-fornitori';

export type EsitoVenditeFornitori =
  | { ok: true; indice: IndiceVendite; ordini: number; valuteDiverse: string[] }
  /** Nessuna chiave salvata in App collegate: la schermata lo dice e mostra il resto. */
  | { ok: false; motivo: 'non_configurato' }
  | { ok: false; motivo: 'errore'; dettaglio: string };

/**
 * Gli ordini che il CS ha affidato a ogni fornitore negli ultimi 30 e
 * `giorni` (180) giorni. ⚠️ Non lancia mai: «vendite non collegate» è uno
 * stato da mostrare, non un guasto che deve spegnere l'elenco dei fornitori.
 */
export async function fetchVenditeFornitori(giorni = 180): Promise<EsitoVenditeFornitori> {
  try {
    const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/customer-service`;
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return { ok: false, motivo: 'errore', dettaglio: 'Sessione scaduta: rientra.' };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: env.supabaseAnonKey(),
      },
      body: JSON.stringify({ action: 'fornitori', giorni }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      // 404 = la funzione non è ancora deployata: si dice, senza rumore.
      return {
        ok: false,
        motivo: 'errore',
        dettaglio:
          res.status === 404
            ? 'La funzione `customer-service` non è ancora pubblicata.'
            : `La funzione ha risposto ${res.status}.`,
      };
    }
    if (body.ok) {
      const righe = (body.fornitori ?? []) as VenditeFornitore[];
      return {
        ok: true,
        indice: indiceVendite(righe, { giorniLunga: body.finestre?.lunga ?? giorni, asOf: body.asOf ?? null }),
        ordini: Number(body.ordini ?? righe.length),
        valuteDiverse: (body.valuteDiverse ?? []) as string[],
      };
    }
    if (body.motivo === 'non_configurato') return { ok: false, motivo: 'non_configurato' };
    return {
      ok: false,
      motivo: 'errore',
      dettaglio: [body.stato ? `Errore ${body.stato}` : null, body.dettaglio].filter(Boolean).join(': ') || 'Non riuscito.',
    };
  } catch (e: any) {
    return { ok: false, motivo: 'errore', dettaglio: String(e?.message ?? e) };
  }
}
