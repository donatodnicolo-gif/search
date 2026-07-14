// Supabase Edge Function `geocode` (Deno).
//
// Proxy sicuro app → Google Geocoding API. La chiave Google vive QUI come secret
// (GOOGLE_GEOCODING_KEY), mai nel bundle dell'app. L'app chiama questa funzione
// autenticata col proprio JWT Supabase e passa un indirizzo; riceve lat/lng.
//
// Perché lato server: la chiave Maps dell'app è ristretta all'app Android e NON
// può fare geocoding via REST; serve una chiave con l'API Geocoding abilitata,
// che non deve finire nel client.
//
// Deploy:
//   supabase functions deploy geocode --project-ref fdsziebgkljfsugqqbqd
//   supabase secrets set GOOGLE_GEOCODING_KEY=AIza... --project-ref fdsziebgkljfsugqqbqd
//
// Prerequisiti Google Cloud: abilitare "Geocoding API" + billing attivo; creare
// una chiave con restrizione API = Geocoding API (nessuna restrizione app Android).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE = 'https://maps.googleapis.com/maps/api/geocode/json';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors, ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const key = Deno.env.get('GOOGLE_GEOCODING_KEY');
    if (!key) return json({ error: 'GOOGLE_GEOCODING_KEY non configurato' }, 500);

    // Verifica il JWT dell'utente (l'app deve essere autenticata).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const { address } = await req.json();
    if (!address || typeof address !== 'string' || !address.trim()) {
      return json({ error: 'Indirizzo mancante' }, 400);
    }

    // Bias su Italia (lingua/regione IT). Non forziamo components=country:IT così
    // resta tollerante, ma diamo priorità ai risultati italiani.
    const url =
      `${GOOGLE}?address=${encodeURIComponent(address.trim())}` +
      `&language=it&region=it&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
      return json({ error: 'Indirizzo non trovato', status: data.status }, 404);
    }
    if (data.status !== 'OK') {
      // REQUEST_DENIED / OVER_QUERY_LIMIT / INVALID_REQUEST…
      return json({ error: data.error_message ?? data.status, status: data.status }, 502);
    }

    const best = data.results[0];
    const loc = best.geometry?.location;
    return json({
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: best.formatted_address ?? address,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
