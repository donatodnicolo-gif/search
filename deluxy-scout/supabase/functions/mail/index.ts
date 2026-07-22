// Edge Function `mail` (Deno): proxy verso AI Mail (deluxy-mail).
// Custodisce la chiave API di AI Mail server-side (secret MAIL_API_TOKEN, fallback
// vault hub) e chiede le ultime mail ricevute da un contatto per la scheda Scout.
//   { azione: 'messaggi', email: '<contatto>', limite?: 10 } → GET /api/v1/messaggi
// L'header x-utente (casella su cui operare) = email dell'utente Scout loggato.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('MAIL_URL') ?? 'https://deluxy-mail.vercel.app';

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
    // Chiave di AI Mail: prima il secret dell'edge function, poi il vault hub.
    const key = Deno.env.get('MAIL_API_TOKEN') ?? (await chiaveHub('MAIL_API_TOKEN'));
    if (!key) return json({ ok: false, errore: 'MAIL_API_TOKEN non configurata' }, 500);

    // Il chiamante dev'essere un utente Scout loggato: la sua email = casella.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const email = userData?.user?.email;
    if (!email) return json({ ok: false, errore: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.azione !== 'messaggi') return json({ ok: false, errore: `Azione sconosciuta: ${body.azione}` }, 400);

    const contatto = String(body.email ?? '').trim();
    if (!contatto) return json({ ok: false, errore: 'Manca email del contatto' }, 400);
    const limite = Math.min(Math.max(Number(body.limite ?? 10) || 10, 1), 30);

    const p = new URLSearchParams({ email: contatto, limite: String(limite) });
    const res = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
      headers: { 'x-api-key': key, 'x-utente': email },
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ ok: false, errore: String((e as any)?.message ?? e) }, 500);
  }
});
