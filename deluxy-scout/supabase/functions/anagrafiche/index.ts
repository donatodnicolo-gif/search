// Edge Function `anagrafiche` (Deno): proxy di SOLA LETTURA verso il registro
// Deluxy Anagrafiche. Custodisce la chiave `ANAGRAFICHE_API_KEY` come secret
// (mai nel bundle dell'app) e inoltra le query. Regola d'oro del registro:
// le app leggono, non tengono copie — questa funzione permette la lettura live.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = Deno.env.get('ANAGRAFICHE_URL') ?? 'https://deluxy-anagrafiche.vercel.app';

// NB: il client web invia anche `apikey` (e supabase-js aggiunge `x-client-info`):
// se non sono elencati qui il preflight fallisce e il browser dà "Failed to fetch".
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('ANAGRAFICHE_API_KEY');
    if (!key) return json({ error: 'ANAGRAFICHE_API_KEY non configurata' }, 500);

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));

    let path = '';
    if (body.action === 'cerca') {
      const p = new URLSearchParams();
      if (body.q) p.set('q', String(body.q));
      if (body.citta) p.set('citta', String(body.citta));
      if (body.categoria) p.set('categoria', String(body.categoria));
      if (body.stato) p.set('stato', String(body.stato));
      p.set('perPage', String(Math.min(Number(body.perPage ?? 10), 50)));
      path = `/api/v1/partners?${p.toString()}`;
    } else if (body.action === 'dettaglio' && body.id) {
      path = `/api/v1/partners/${encodeURIComponent(String(body.id))}`;
    } else {
      return json({ error: `Azione sconosciuta: ${body.action}` }, 400);
    }

    const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key } });
    const txt = await res.text();
    if (!res.ok) return json({ error: `Registro ${res.status}: ${txt.slice(0, 300)}` }, res.status);
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
