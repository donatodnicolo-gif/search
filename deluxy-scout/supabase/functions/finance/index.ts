// Edge Function `finance` (Deno): proxy di SOLA LETTURA verso Deluxy Partner
// (FINANCE), per sapere **chi ha smesso di fatturare**.
//
// È il dato che definisce un DORMIENTE (lib/livelli.ts): un cliente che ha
// comprato e poi si è fermato. Scout da solo non può saperlo — il fatturato
// vive in Finance — e finora usava lo stato del registro, che significa
// «rapporto interrotto» e non «non fattura da N mesi»: due cose diverse.
//
// La chiave di Finance resta lato server: nel bundle web sarebbe leggibile da
// chiunque apra gli strumenti di sviluppo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('PARTNER_URL') ?? 'https://deluxy-partner.vercel.app';

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
    const key = await chiaveHub('PARTNER_API_KEY');
    // Inerte finché la chiave non c'è, come gli altri proxy: la schermata
    // mostra tutto il resto e dice che il dato finanziario non è collegato.
    if (!key) return json({ ok: false, reason: 'non_configurato' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action !== 'stato_clienti') return json({ error: `Azione sconosciuta: ${body.action}` }, 400);

    const res = await fetch(`${BASE}/api/clienti/stato`, {
      headers: { 'X-API-Key': key, 'X-App': 'deluxy-scout' },
    });
    const txt = await res.text();
    if (!res.ok) return json({ error: `Finance ${res.status}: ${txt.slice(0, 300)}` }, res.status);
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
