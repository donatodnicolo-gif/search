// Edge Function `linee` (Deno): Scout è il MASTER delle linee di interesse.
// Le altre app Deluxy leggono da qui l'albero delle linee (con sottolinee).
//
// Auth: header `x-api-key: <LINEE_API_KEY>` (chiave condivisa, secret server-side).
// Sola lettura. GET/POST equivalenti; parametri opzionali:
//   ?soloAttive=1  → esclude le linee/sottolinee in standby (attiva_bool=false)
//
// Risposta: { linee: [{ id, nome, icona, attiva, ordine, pitch,
//                       sottolinee: [{ id, nome, icona, attiva, ordine, pitch }] }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  parent_id: string | null;
  ordine: number;
  icona: string | null;
  pitch: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const atteso = Deno.env.get('LINEE_API_KEY');
    if (!atteso) return json({ error: 'LINEE_API_KEY non configurata sul master' }, 500);
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (key !== atteso) return json({ error: 'Chiave API mancante o non valida (header x-api-key).' }, 401);

    const url = new URL(req.url);
    const soloAttive = url.searchParams.get('soloAttive') === '1' || url.searchParams.get('soloAttive') === 'true';

    // service_role: bypassa la RLS (accesso server-to-server autorizzato dalla chiave).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let q = admin
      .from('lines')
      .select('id, nome, attiva_bool, parent_id, ordine, icona, pitch')
      .eq('archiviata', false)
      .order('ordine')
      .order('nome');
    if (soloAttive) q = q.eq('attiva_bool', true);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const righe = (data ?? []) as Riga[];
    const pub = (r: Riga) => ({ id: r.id, nome: r.nome, icona: r.icona, attiva: r.attiva_bool, ordine: r.ordine, pitch: r.pitch });
    const top = righe.filter((r) => !r.parent_id);
    const figli = righe.filter((r) => r.parent_id);
    const linee = top.map((t) => ({ ...pub(t), sottolinee: figli.filter((f) => f.parent_id === t.id).map(pub) }));

    return json({ linee, totale: linee.length, aggiornato: new Date().toISOString() });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
