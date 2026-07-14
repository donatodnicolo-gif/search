// Supabase Edge Function `discover` (Deno).
//
// Scoperta negozi sul territorio da Google Places, con CACHE per non sprecare
// chiamate: se la zona è stata aggiornata da < 30 giorni si serve dal DB, altrimenti
// si interroga Google, si classifica per linea Deluxy e si fa l'upsert in `places`.
// I negozi mai visti prima vengono marcati `novita = true`.
//
// Azione:
//   { action: 'discover', lat, lng, radius? }  → { places, cached, nuovi }
//
// Riusa il secret GOOGLE_GEOCODING_KEY (Places API). Deploy:
//   supabase functions deploy discover --project-ref fdsziebgkljfsugqqbqd
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NEARBY = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const CACHE_GIORNI = 30;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// Mappa dei tipi Google → categoria Deluxy (per la classificazione via category_rules).
const TYPE_MAP: Record<string, string> = {
  jewelry_store: 'gioielleria',
  clothing_store: 'moda',
  shoe_store: 'moda',
  lodging: 'hotel',
  restaurant: 'ristorante',
  cafe: 'ristorante',
  bar: 'ristorante',
  meal_takeaway: 'ristorante',
  meal_delivery: 'ristorante',
  florist: 'fioraio',
  bakery: 'pasticceria',
  lawyer: 'studio legale',
  bank: 'banca',
  finance: 'banca',
  beauty_salon: 'retail',
  hair_care: 'retail',
  spa: 'retail',
  supermarket: 'retail',
  book_store: 'retail',
  furniture_store: 'retail',
  store: 'retail',
};

function categoriaDaTypes(types: string[]): string {
  for (const t of types) if (TYPE_MAP[t]) return TYPE_MAP[t];
  return 'altro';
}

// Trova la regola per categoria: esatta → parziale → 'altro'.
function regolaPerCategoria(categoria: string, regole: any[]) {
  const c = categoria.toLowerCase();
  return (
    regole.find((r) => r.categoria.toLowerCase() === c) ??
    regole.find((r) => c.includes(r.categoria.toLowerCase()) || r.categoria.toLowerCase().includes(c)) ??
    regole.find((r) => r.categoria.toLowerCase() === 'altro') ??
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const key = Deno.env.get('GOOGLE_GEOCODING_KEY');
    if (!key) return json({ error: 'GOOGLE_GEOCODING_KEY non configurato' }, 500);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action !== 'discover') return json({ error: `Azione sconosciuta: ${body.action}` }, 400);

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radius = Math.min(Math.max(Number(body.radius) || 300, 50), 2000);
    if (!isFinite(lat) || !isFinite(lng)) return json({ error: 'lat/lng mancanti' }, 400);

    const cella = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const nowIso = new Date().toISOString();
    const soglia = new Date(Date.now() - CACHE_GIORNI * 86400_000).toISOString();

    // Cache: se la cella è stata aggiornata di recente, servi dal DB senza chiamare Google.
    const { data: area } = await admin
      .from('google_aree')
      .select('refresh_at')
      .eq('cella', cella)
      .maybeSingle();

    let nuovi = 0;
    const cached = Boolean(area && area.refresh_at > soglia);

    if (!cached) {
      // Interroga Google Places Nearby con paginazione (fino a ~60 risultati, 3 pagine).
      let risultati: any[] = [];
      let pageUrl = `${NEARBY}?location=${lat},${lng}&radius=${radius}&language=it&key=${key}`;
      for (let page = 0; page < 3; page++) {
        const g = await (await fetch(pageUrl)).json();
        if (g.status !== 'OK' && g.status !== 'ZERO_RESULTS') {
          if (page === 0) return json({ error: g.error_message ?? g.status, status: g.status }, 502);
          break; // pagine successive fallite: tieni quello che abbiamo
        }
        risultati = risultati.concat(g.results ?? []);
        if (!g.next_page_token) break;
        // Il pagetoken diventa valido dopo un breve ritardo lato Google.
        await new Promise((r) => setTimeout(r, 2000));
        pageUrl = `${NEARBY}?pagetoken=${g.next_page_token}&key=${key}`;
      }
      // Dedup per place_id (le pagine possono sovrapporsi).
      const visti = new Set<string>();
      risultati = risultati.filter((r) => r.place_id && !visti.has(r.place_id) && visti.add(r.place_id));

      if (risultati.length) {
        const ids = risultati.map((r) => r.place_id);
        const { data: esistenti } = await admin
          .from('places')
          .select('google_place_id')
          .in('google_place_id', ids);
        const notiSet = new Set((esistenti ?? []).map((e: any) => e.google_place_id));

        const { data: regole } = await admin
          .from('category_rules')
          .select('categoria, linea_ipotizzata, aggancio_apertura, priorita');

        const nuoviRecord = risultati
          .filter((r) => !notiSet.has(r.place_id))
          .map((r) => {
            const types: string[] = r.types ?? [];
            const categoria = categoriaDaTypes(types);
            const regola = regolaPerCategoria(categoria, regole ?? []);
            return {
              nome: r.name,
              indirizzo: r.vicinity ?? null,
              lat: r.geometry?.location?.lat,
              lng: r.geometry?.location?.lng,
              categoria,
              google_types: types,
              google_place_id: r.place_id,
              source: 'google',
              novita: true,
              priorita: regola?.priorita ?? 'P3',
              linea_ipotizzata: regola?.linea_ipotizzata ?? null,
              aggancio_apertura: regola?.aggancio_apertura ?? null,
              google_refresh_at: nowIso,
            };
          })
          .filter((r) => isFinite(r.lat) && isFinite(r.lng));

        nuovi = nuoviRecord.length;
        if (nuoviRecord.length) await admin.from('places').insert(nuoviRecord);

        // Rinfresca il timestamp dei già noti (senza toccare starred/stato/hubspot).
        const notiIds = [...notiSet];
        if (notiIds.length) {
          await admin.from('places').update({ google_refresh_at: nowIso }).in('google_place_id', notiIds);
        }
      }

      // Registra il refresh della cella.
      await admin
        .from('google_aree')
        .upsert({ cella, centro_lat: lat, centro_lng: lng, refresh_at: nowIso });
    }

    // Restituisci tutte le attività vicine (da DB, ordinate per distanza).
    const { data: places, error } = await admin.rpc('places_vicini', {
      p_lat: lat,
      p_lng: lng,
      p_raggio: radius,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ places: places ?? [], cached, nuovi });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
