// Edge Function `customer-service` (Deno): proxy di SOLA LETTURA verso il
// Deluxy Customer Service (`deluxy-messaging`), l'app che decide a quale
// fornitore va un ordine.
//
// Esiste per la stessa ragione di `ordini`: la chiave dell'API del Customer
// Service non può stare nel bundle di Scout, che gira anche nel browser. Qui
// resta lato server, letta dalla cassaforte (`chiavi_app`, riga
// `customer-service`, oppure il vault del Hub / env `MESSAGING_API_KEY`).
//
// Azioni:
//   `fornitori` → GET /api/v1/fornitori?giorni=N — quanti ordini ha avuto ogni
//                 fornitore negli ultimi 30 e negli ultimi N (default 180)
//                 giorni, e per quanto. Serve alle schermate Fornitori e
//                 Segnalazioni CS (10/09/2026).
//
// Sola lettura, sempre: Scout non ha nulla da scrivere sugli ordini del CS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE_DEFAULT = Deno.env.get('MESSAGING_URL') ?? 'https://deluxy-messaging.vercel.app';

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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ⚠️ Il controllo sta PRIMA dello smistamento delle azioni (lezione di
    // `hubspot-match`): un'azione aggiunta sopra sarebbe pubblica.
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const key = await chiaveHub('MESSAGING_API_KEY');
    // Inerte finché la chiave non è configurata: la schermata dice «vendite
    // non collegate» e mostra tutto il resto.
    if (!key) return json({ ok: false, motivo: 'non_configurato' });

    // L'indirizzo lo può cambiare l'admin dalla schermata App collegate.
    const { data: riga } = await admin.from('chiavi_app').select('url_base').eq('app', 'customer-service').maybeSingle();
    const base = ((riga?.url_base as string | null) ?? '').trim().replace(/\/$/, '') || BASE_DEFAULT;

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'fornitori';

    if (action === 'fornitori') {
      const giorni = Math.min(730, Math.max(1, Math.round(Number(body.giorni ?? 180)) || 180));
      const res = await fetch(`${base}/api/v1/fornitori?giorni=${giorni}`, {
        headers: { 'x-api-key': key, Accept: 'application/json' },
      });
      const txt = await res.text();
      const dati = (() => {
        try {
          return JSON.parse(txt);
        } catch {
          return null;
        }
      })();
      if (!res.ok) {
        return json({
          ok: false,
          motivo: 'errore',
          stato: res.status,
          dettaglio: (dati?.errore ?? dati?.error ?? txt).toString().slice(0, 200),
        });
      }
      return json({ ok: true, ...(dati ?? {}) });
    }

    return json({ error: `Azione sconosciuta: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, motivo: 'errore', dettaglio: String((e as Error)?.message ?? e) }, 500);
  }
});
