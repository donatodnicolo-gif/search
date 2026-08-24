// La chiave con cui le ALTRE app chiamano Scout, e come la si verifica.
//
// Due posti, in quest'ordine:
//   1. la riga `_ingresso` della tabella `chiavi_app` — generata dall'admin da
//      Profilo → Impostazioni, senza riga di comando;
//   2. il secret `COMMERCIALE_API_KEY`, che è dov'era prima e resta valido.
//
// Perché il primo: un secret di Supabase **non si rilegge**. Quando bisogna
// dare quella chiave a un'altra app o la si è annotata da qualche parte, o si è
// costretti a rigenerarla — spegnendo in silenzio le integrazioni che la usavano
// già. Il 29/07/2026 è successo esattamente questo.
//
// ⚠️ Il secret resta come **seconda** strada e non viene tolto: se la tabella
// non è raggiungibile o la riga non c'è, le integrazioni che funzionavano
// continuano a funzionare. Una migrazione di segreti che spegne quello che c'è
// non è una migrazione, è un guasto programmato.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const APP_CHIAVE_INGRESSO = '_ingresso';

/** Confronto a tempo costante: su un segreto, `===` esce alla prima differenza.
 *  Esportata perché la usi CHIUNQUE confronti una chiave (es. `linee`): questo
 *  file esiste apposta, e un `!==` scritto altrove è la stessa falla di nuovo. */
export function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * La chiave presentata da chi chiama vale?
 *
 * `admin` è il client service_role: `chiavi_app` ha una RLS che la riserva
 * all'amministratore, quindi da qui si legge solo con quel client.
 */
export async function chiaveIngressoValida(
  presentata: string | null | undefined,
  admin: SupabaseClient,
): Promise<{ ok: boolean; motivo?: string }> {
  const data = (presentata ?? '').trim();
  if (!data) return { ok: false, motivo: 'Chiave API mancante (header x-api-key).' };

  // 1. La chiave generata dall'app.
  try {
    const { data: riga } = await admin
      .from('chiavi_app')
      .select('chiave')
      .eq('app', APP_CHIAVE_INGRESSO)
      .maybeSingle();
    const salvata = (riga?.chiave ?? '').trim();
    if (salvata && uguali(data, salvata)) return { ok: true };
  } catch {
    // Tabella assente o irraggiungibile: si prova il secret.
  }

  // 2. Il secret storico.
  const env = (Deno.env.get('COMMERCIALE_API_KEY') ?? '').trim();
  if (env && uguali(data, env)) return { ok: true };

  if (!env) {
    return {
      ok: false,
      motivo:
        'Scout non ha nessuna chiave d\'ingresso: generala da Profilo → Impostazioni → «Chi può scrivere in Scout».',
    };
  }
  return { ok: false, motivo: 'Chiave API non valida (header x-api-key).' };
}

/** Il client service_role, uguale in tutte le funzioni che ne hanno bisogno. */
export function clientAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}
