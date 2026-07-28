// Edge Function `health` (Deno): sonda di salute PUBBLICA di Deluxy Scout.
//
// Scout è una SPA statica su Vercel: ogni percorso viene riscritto su
// index.html, quindi `/api/health` rispondeva 200 con dell'HTML. Il Hub la
// scartava (si aspetta JSON) e ripiegava sulla semplice raggiungibilità: «app
// su, database non pervenuto». Un'app che si apre e poi non carica niente
// perché il database è fermo risultava perfettamente sana.
//
// Il `vercel.json` della build web manda `/api/health` qui. Formato secondo lo
// standard Deluxy: { ok, app, database }.
//
// ⚠️ Va deployata con `--no-verify-jwt`: deve rispondere senza sessione, se no
// il Hub non può leggerla. Non espone nulla — solo se il database risponde.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let database = false;
  let dettaglio: string | undefined;
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // La lettura più leggera possibile: una riga sola, contando solo la testata.
    // Interessa che il database risponda, non cosa contiene.
    const r = await fetch(`${url}/rest/v1/places?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=none' },
      signal: AbortSignal.timeout(5000),
    });
    database = r.ok;
    if (!r.ok) dettaglio = `il database ha risposto ${r.status}`;
  } catch (e) {
    dettaglio = String((e as any)?.message ?? e).slice(0, 120);
  }

  // `ok: true` anche col database giù: il SERVER sta rispondendo (è questa
  // richiesta). È `database: false` a dire cosa non va. Rispondere 500 farebbe
  // dire al Hub «app giù», mandando a cercare il guasto nel posto sbagliato.
  return new Response(
    JSON.stringify({ ok: true, app: 'deluxy-scout', database, ...(dettaglio ? { dettaglio } : {}) }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } },
  );
});
