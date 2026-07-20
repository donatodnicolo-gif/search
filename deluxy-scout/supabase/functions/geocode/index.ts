// Supabase Edge Function `geocode` (Deno).
//
// Proxy sicuro app → Google (Geocoding + Places). Le chiavi Google vivono QUI come
// secret (GOOGLE_GEOCODING_KEY), mai nel bundle dell'app. L'app chiama questa
// funzione autenticata col proprio JWT Supabase.
//
// Azioni:
//   { action: 'geocode',      address }  → { lat, lng, formatted_address }
//   { action: 'autocomplete', input }    → { predictions: [{ description, place_id }] }
//   { action: 'details',      place_id } → { lat, lng, formatted_address }
//   (senza action, con `address` → 'geocode', per retrocompatibilità)
//
// Perché lato server: la chiave Maps dell'app è ristretta all'app Android e NON
// può fare Geocoding/Places via REST; serve una chiave con quelle API abilitate,
// che non deve finire nel client.
//
// Deploy:
//   supabase functions deploy geocode --project-ref fdsziebgkljfsugqqbqd
//   supabase secrets set GOOGLE_GEOCODING_KEY=AIza... --project-ref fdsziebgkljfsugqqbqd
//
// Prerequisiti Google Cloud: abilitare "Geocoding API" e "Places API" + billing;
// chiave con restrizione API = quelle due (nessuna restrizione app Android).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const AUTOCOMPLETE = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json';

// Bias verso Milano per i suggerimenti.
const MILANO = '45.4642,9.19';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
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

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? (body.address ? 'geocode' : null);

    if (action === 'geocode') {
      return await geocode(String(body.address ?? ''), key);
    }
    if (action === 'autocomplete') {
      return await autocomplete(String(body.input ?? ''), key);
    }
    if (action === 'details') {
      return await details(String(body.place_id ?? ''), key);
    }
    return json({ error: `Azione sconosciuta: ${action}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function geocode(address: string, key: string) {
  if (!address.trim()) return json({ error: 'Indirizzo mancante' }, 400);
  const url = `${GEOCODE}?address=${encodeURIComponent(address.trim())}&language=it&region=it&key=${key}`;
  const data = await (await fetch(url)).json();
  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    return json({ error: 'Indirizzo non trovato', status: data.status }, 404);
  }
  if (data.status !== 'OK') return json({ error: data.error_message ?? data.status, status: data.status }, 502);
  const best = data.results[0];
  return json({
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
    formatted_address: best.formatted_address ?? address,
  });
}

async function autocomplete(input: string, key: string) {
  if (input.trim().length < 3) return json({ predictions: [] });
  const url =
    `${AUTOCOMPLETE}?input=${encodeURIComponent(input.trim())}` +
    `&language=it&components=country:it&location=${MILANO}&radius=40000&key=${key}`;
  const data = await (await fetch(url)).json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return json({ error: data.error_message ?? data.status, status: data.status }, 502);
  }
  const predictions = (data.predictions ?? []).map((p: any) => ({
    description: p.description as string,
    place_id: p.place_id as string,
  }));
  return json({ predictions });
}

async function details(placeId: string, key: string) {
  if (!placeId) return json({ error: 'place_id mancante' }, 400);
  const url = `${DETAILS}?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address&language=it&key=${key}`;
  const data = await (await fetch(url)).json();
  if (data.status !== 'OK' || !data.result?.geometry) {
    return json({ error: data.error_message ?? data.status ?? 'Dettagli non trovati', status: data.status }, 502);
  }
  const loc = data.result.geometry.location;
  return json({
    lat: loc.lat,
    lng: loc.lng,
    formatted_address: data.result.formatted_address ?? '',
  });
}
