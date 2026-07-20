// Edge Function `proforma` (Deno): proxy verso l'API pro-forma di Deluxy
// Partner. Custodisce la chiave `PARTNER_API_KEY` come secret (mai nel bundle
// dell'app) e inoltra le azioni:
//   { azione: 'crea',     partner, oggetto?, scadenza?, note?, righe: [...] }  → POST /api/proforma
//   { azione: 'conferma', numero | id, fatturaNumero? }                        → PATCH /api/proforma
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BASE = Deno.env.get('PARTNER_URL') ?? 'https://deluxy-partner.vercel.app';

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
    const key = Deno.env.get('PARTNER_API_KEY');
    if (!key) return json({ error: 'PARTNER_API_KEY non configurata' }, 500);

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    const headers = {
      'X-API-Key': key,
      'X-App': 'deluxy-scout',
      'Content-Type': 'application/json',
    };

    let res: Response;
    if (body.azione === 'crea') {
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          partner: body.partner,
          oggetto: body.oggetto ?? undefined,
          scadenza: body.scadenza ?? undefined,
          note: body.note ?? undefined,
          righe: body.righe,
        }),
      });
    } else if (body.azione === 'conferma') {
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: body.id ?? undefined,
          numero: body.numero ?? undefined,
          fatturaNumero: body.fatturaNumero ?? undefined,
        }),
      });
    } else {
      return json({ error: `Azione sconosciuta: ${body.azione}` }, 400);
    }

    // Inoltra la risposta di Partner così com'è (incl. errore/candidati sui 404).
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
