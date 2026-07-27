// Edge Function `ordini` (Deno): proxy di SOLA LETTURA verso Deluxy Orders, il
// registro centralizzato degli ordini Shopify.
//
// Esiste per una ragione sola: la chiave dell'API di Orders non può stare nel
// bundle dell'app. Scout gira anche nel browser, e tutto ciò che è nel bundle è
// leggibile da chiunque apra gli strumenti di sviluppo. Qui la chiave resta
// lato server, custodita nella cassaforte del Hub.
//
// Sola lettura, sempre: Scout non ha nulla da scrivere sugli ordini. Se un
// giorno servisse, va aggiunto un permesso esplicito — non allargato questo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('ORDERS_URL') ?? 'https://deluxy-orders.vercel.app';

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
    const key = await chiaveHub('ORDERS_API_KEY');
    // Inerte finché la chiave non è configurata, come il proxy `anagrafiche`:
    // risponde `non_configurato` invece di un errore, così la schermata può
    // dire «i dati di vendita non sono collegati» e mostrare tutto il resto.
    if (!key) return json({ ok: false, reason: 'non_configurato' });

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));

    let path = '';
    if (body.action === 'province') {
      const p = new URLSearchParams();
      // Senza anno si guarda tutto lo storico: per capire *dove* si vende, tre
      // anni dicono più di dodici mesi.
      if (body.anno) p.set('anno', String(body.anno));
      if (body.da) p.set('da', String(body.da));
      if (body.a) p.set('a', String(body.a));
      if (body.brand) p.set('brand', String(body.brand));
      path = `/api/v1/province${p.toString() ? `?${p}` : ''}`;
    } else {
      return json({ error: `Azione sconosciuta: ${body.action}` }, 400);
    }

    const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key } });
    const txt = await res.text();
    if (!res.ok) return json({ error: `Orders ${res.status}: ${txt.slice(0, 300)}` }, res.status);
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
