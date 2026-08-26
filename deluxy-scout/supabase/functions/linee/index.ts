// Edge Function `linee` (Deno): Scout è il MASTER delle linee di interesse.
// Le altre app Deluxy leggono da qui l'albero delle linee (con sottolinee).
//
// Auth: header `x-api-key`. Valgono DUE chiavi: il secret `LINEE_API_KEY` e la
// chiave d'ingresso di Scout (`chiavi_app._ingresso`, quella di `lead` e
// `trattativa`) — che a differenza di un secret di Supabase si puo' rileggere
// dall'app per darla a un'altra app senza rigenerarla.
// Sola lettura. GET/POST equivalenti; parametri opzionali:
//   ?soloAttive=1  → esclude le linee/sottolinee in standby (attiva_bool=false)
//   ?soloVetrina=1 → solo quelle offerte ai partner nella loro casa
//                    (`in_vetrina`, migr. 0071): è il filtro che usa
//                    deluxy-delivery per «Che cosa ti serve?».
//
// ⚠️ Sono DUE domande diverse: «la linea è viva commercialmente» e «la si offre
// ai partner». Magazzino è viva ed è un servizio interno: in vetrina non ci va.
//
// Risposta: { linee: [{ id, nome, icona, attiva, inVetrina, ordine, pitch,
//                       sottolinee: [...] }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveIngressoValida, clientAdmin, uguali } from '../_shared/chiaveIn.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

interface Riga {
  id: string;
  nome: string;
  attiva_bool: boolean;
  in_vetrina: boolean;
  parent_id: string | null;
  ordine: number;
  icona: string | null;
  pitch: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const atteso = Deno.env.get('LINEE_API_KEY');
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    // Due chiavi valide, e non è generosità: `LINEE_API_KEY` è un secret di
    // Supabase, e un secret **non si rilegge** — quando bisogna darlo a
    // un'altra app o lo si è annotato da qualche parte, o si è costretti a
    // rigenerarlo spegnendo le integrazioni che lo usavano. La chiave
    // d'ingresso (`chiavi_app._ingresso`, generata da Profilo → Impostazioni)
    // si rilegge dall'app, ed è già quella di `lead` e `trattativa`.
    //
    // ⚠️ Confronto a tempo costante (audit 24/08/2026): `!==` esce alla prima
    // differenza e su una chiave è misurabile da fuori.
    const colSecret = Boolean(atteso) && uguali(key ?? '', atteso!);
    const colIngresso = colSecret ? false : (await chiaveIngressoValida(key, clientAdmin())).ok;
    if (!colSecret && !colIngresso) {
      return json(
        {
          error: atteso
            ? 'Chiave API mancante o non valida (header x-api-key).'
            : 'Chiave non valida: sul master non è impostata LINEE_API_KEY, quindi vale solo la chiave d’ingresso di Scout.',
        },
        401,
      );
    }

    const url = new URL(req.url);
    const soloAttive = url.searchParams.get('soloAttive') === '1' || url.searchParams.get('soloAttive') === 'true';
    const soloVetrina = url.searchParams.get('soloVetrina') === '1' || url.searchParams.get('soloVetrina') === 'true';

    // service_role: bypassa la RLS (accesso server-to-server autorizzato dalla chiave).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let q = admin
      .from('lines')
      .select('id, nome, attiva_bool, in_vetrina, parent_id, ordine, icona, pitch')
      .eq('archiviata', false)
      .order('ordine')
      .order('nome');
    if (soloAttive) q = q.eq('attiva_bool', true);
    if (soloVetrina) q = q.eq('in_vetrina', true);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const righe = (data ?? []) as Riga[];
    const pub = (r: Riga) => ({
      id: r.id,
      nome: r.nome,
      icona: r.icona,
      attiva: r.attiva_bool,
      inVetrina: r.in_vetrina,
      ordine: r.ordine,
      pitch: r.pitch,
    });
    const top = righe.filter((r) => !r.parent_id);
    const figli = righe.filter((r) => r.parent_id);
    const linee = top.map((t) => ({ ...pub(t), sottolinee: figli.filter((f) => f.parent_id === t.id).map(pub) }));

    return json({ linee, totale: linee.length, aggiornato: new Date().toISOString() });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
