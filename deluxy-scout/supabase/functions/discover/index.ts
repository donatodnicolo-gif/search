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

// Tipi Google interrogati singolarmente con `rankby=distance` (vedi nota nel handler).
// Sono quelli che generano le linee Deluxy; l'ordine non conta (i risultati si uniscono).
const TIPI_RICERCA = [
  'clothing_store',
  'jewelry_store',
  'shoe_store',
  'florist',
  'bakery',
  'restaurant',
  'cafe',
  'lodging',
  'beauty_salon',
  'lawyer',
  'bank',
];

// Preset del filtro "cosa cerco" scelto dall'app (sottomenu Mappa).
// 'affiliazioni' = solo affiliati (fioristi + pasticcerie); 'tutti' = flusso pieno.
const PRESET_TIPI: Record<string, string[]> = {
  affiliazioni: ['florist', 'bakery'],
  fiori: ['florist'],
  pasticcerie: ['bakery'],
  tutti: TIPI_RICERCA,
};

/** Distanza in metri (Haversine). */
function distanzaMetri(aLat: number, aLng: number, bLat?: number, bLng?: number): number {
  if (!isFinite(bLat as number) || !isFinite(bLng as number)) return Infinity;
  const R = 6371000;
  const dLat = ((bLat! - aLat) * Math.PI) / 180;
  const dLng = ((bLng! - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat! * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Scorre le pagine di una Nearby. `dentro` (opzionale) serve alle query
 * `rankby=distance`, che sono ordinate per distanza: appena l'ultimo risultato
 * di una pagina esce dal raggio, le pagine dopo sono tutte più lontane → stop.
 * Lancia se già la prima pagina fallisce (chiave/quota), così il chiamante decide.
 */
async function pagineNearby(
  url0: string,
  key: string,
  maxPagine: number,
  dentro?: (r: any) => boolean,
): Promise<any[]> {
  const out: any[] = [];
  let url = url0;
  for (let p = 0; p < maxPagine; p++) {
    const g = await (await fetch(url)).json();
    if (g.status !== 'OK' && g.status !== 'ZERO_RESULTS') {
      if (p === 0) throw new Error(g.error_message ?? g.status);
      break; // pagine successive fallite: tieni quello che hai
    }
    const res: any[] = g.results ?? [];
    out.push(...res);
    if (dentro && res.length && !dentro(res[res.length - 1])) break;
    if (!g.next_page_token) break;
    // Il pagetoken diventa valido dopo un breve ritardo lato Google.
    await new Promise((r) => setTimeout(r, 2000));
    url = `${NEARBY}?pagetoken=${g.next_page_token}&key=${key}`;
  }
  return out;
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

    // Filtro "cosa cerco" (sottomenu Mappa): default = affiliati (fioristi + pasticcerie).
    const filtro = PRESET_TIPI[body.filtro as string] ? (body.filtro as string) : 'affiliazioni';
    const tipiCercati = PRESET_TIPI[filtro];
    const soloAffiliati = filtro !== 'tutti'; // con 'tutti' includiamo anche la generica

    // La cache è per-filtro: cercare "solo fiori" non deve marcare la cella come
    // "già scansionata per tutto". Cella = coordinate + filtro.
    const cella = `${lat.toFixed(3)},${lng.toFixed(3)}@${filtro}`;
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
      // Google Nearby, quando gli passi un `radius`, ordina per PROMINENZA e tronca a
      // 60 risultati: in zone dense (Quadrilatero/San Babila) ci sono più di 60 esercizi
      // anche entro 100 m, quindi le boutique piccole — proprio il nostro target — restano
      // sistematicamente fuori (verificato: MooRER in Corso Venezia 2 non usciva).
      // Rimedio: affiancare, per ogni tipo che ci interessa, una query `rankby=distance`
      // che restituisce i più VICINI invece dei più famosi. Ogni tipo ha il suo budget di
      // risultati, quindi i negozi sotto casa ci sono di sicuro.
      const dentroRaggio = (r: any) =>
        distanzaMetri(lat, lng, r.geometry?.location?.lat, r.geometry?.location?.lng) <= radius;

      // Generica (prominenza): solo quando cerco "Tutti" — copre i tipi non elencati.
      // Con un filtro (affiliati/fiori/pasticcerie) la si SALTA, altrimenti Google
      // riporterebbe tutto il rumore vanificando il filtro.
      const generica = soloAffiliati
        ? Promise.resolve([] as any[])
        : pagineNearby(`${NEARBY}?location=${lat},${lng}&radius=${radius}&language=it&key=${key}`, key, 3);

      // Per tipo (distanza): in parallelo; `rankby=distance` non ammette `radius`.
      const perTipo = tipiCercati.map((t) =>
        pagineNearby(
          `${NEARBY}?location=${lat},${lng}&rankby=distance&type=${t}&language=it&key=${key}`,
          key,
          2,
          dentroRaggio,
        ),
      );

      const esiti = await Promise.allSettled([generica, ...perTipo]);
      // Se fallisce la generica è un problema vero (chiave/quota); i singoli tipi no.
      if (esiti[0].status === 'rejected') {
        const err = (esiti[0] as PromiseRejectedResult).reason;
        return json({ error: String(err?.message ?? err) }, 502);
      }
      // `rankby=distance` ignora il raggio → filtriamo noi. Dedup per place_id.
      const visti = new Set<string>();
      const risultati = esiti
        .flatMap((e) => (e.status === 'fulfilled' ? e.value : []))
        .filter((r) => r.place_id && dentroRaggio(r) && !visti.has(r.place_id) && visti.add(r.place_id));

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
              google_rating: typeof r.rating === 'number' ? r.rating : null,
              google_reviews: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
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

        // Rinfresca timestamp + recensioni dei già noti (senza toccare starred/stato/hubspot).
        // Le recensioni cambiano per negozio → update mirati in parallelo (poche decine).
        const noti = risultati.filter((r) => notiSet.has(r.place_id));
        await Promise.all(
          noti.map((r) =>
            admin
              .from('places')
              .update({
                google_refresh_at: nowIso,
                google_rating: typeof r.rating === 'number' ? r.rating : null,
                google_reviews: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
              })
              .eq('google_place_id', r.place_id),
          ),
        );
      }

      // Registra il refresh della cella.
      await admin
        .from('google_aree')
        .upsert({ cella, centro_lat: lat, centro_lng: lng, refresh_at: nowIso });
    }

    // Abbina i negozi della zona al CRM HubSpot (flag contatto / trattativa aperta).
    // Best-effort: se fallisce (es. tabelle CRM vuote) la scoperta prosegue.
    try {
      await admin.rpc('abbina_places_vicini', { p_lat: lat, p_lng: lng, p_raggio: radius });
    } catch {
      /* ignora: i flag HubSpot restano ai valori precedenti */
    }

    // Restituisci le attività vicine (da DB, ordinate per distanza).
    const { data: places, error } = await admin.rpc('places_vicini', {
      p_lat: lat,
      p_lng: lng,
      p_raggio: radius,
    });
    if (error) return json({ error: error.message }, 500);

    // Coerenza col sottomenu: se ho filtrato la ricerca, filtro anche l'output per
    // categoria (fioraio/pasticceria), così "solo fiori" mostra solo fioristi.
    const CAT_FILTRO: Record<string, string[]> = {
      affiliazioni: ['fioraio', 'pasticceria'],
      fiori: ['fioraio'],
      pasticcerie: ['pasticceria'],
    };
    const catAmmesse = CAT_FILTRO[filtro];
    const risposta = catAmmesse
      ? (places ?? []).filter((p: any) => catAmmesse.includes(p.categoria))
      : (places ?? []);

    return json({ places: risposta, cached, nuovi, filtro });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
