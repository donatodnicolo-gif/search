import { NextRequest, NextResponse } from "next/server";

// PROXY SICURO app → Google (Places Autocomplete + Details), per il riempimento
// automatico degli indirizzi nei form.
//
// ⚠️ La chiave Google vive QUI come segreto (GOOGLE_GEOCODING_KEY), MAI nel
// browser: è lo stesso pattern di Scout (`supabase/functions/geocode`), ed è il
// motivo per cui non serve allentare la CSP messa il 27/08 — il browser parla
// solo con questa rotta, sulla stessa origine, e la rotta parla con Google.
//
// ⚠️ Sta sotto `/api/interno`, quindi è già protetta dal cookie di sessione
// della UI (vedi `src/middleware.ts`): non è raggiungibile con una chiave API,
// e non è raggiungibile da fuori senza essere loggati nel registro.
//
// ⚠️ INERTE senza la chiave: se GOOGLE_GEOCODING_KEY non è impostata risponde
// 503 con un messaggio chiaro, e il form ripiega sulla scrittura a mano — Maps
// è un aiuto al riempimento, non un cancello.
//
// ⚠️ NIENTE `components=country:it`: il registro ha anche indirizzi esteri
// (una boutique a Nizza, un fioraio a Parigi). Restringere all'Italia li
// renderebbe non trovabili, e chi cerca crederebbe che Maps non funziona.

const AUTOCOMPLETE = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

function comp(components: GoogleComponent[], tipo: string, corto = false): string | null {
  const c = components.find((x) => x.types.includes(tipo));
  return c ? (corto ? c.short_name : c.long_name) : null;
}

type GoogleComponent = { long_name: string; short_name: string; types: string[] };

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) {
    return NextResponse.json(
      { errore: "Completamento indirizzi non configurato", inerte: true },
      { status: 503 },
    );
  }

  const p = req.nextUrl.searchParams;
  const placeId = p.get("place_id")?.trim();
  const q = p.get("q")?.trim();

  // --- Dettaglio: da un place_id ai campi già spezzati per il form ---
  if (placeId) {
    const url =
      `${DETAILS}?place_id=${encodeURIComponent(placeId)}` +
      `&fields=address_component,formatted_address,geometry` +
      `&language=it&key=${key}`;
    const data = await fetch(url).then((r) => r.json()).catch(() => null);
    if (!data || data.status !== "OK") {
      return NextResponse.json({ errore: "Indirizzo non trovato" }, { status: 502 });
    }
    const cc: GoogleComponent[] = data.result.address_components ?? [];
    const via = comp(cc, "route");
    const civico = comp(cc, "street_number");
    // Provincia italiana = sigla (MI, PN). Google la mette in
    // administrative_area_level_2; in mancanza si ripiega sul livello 3.
    // ⚠️ TRAPPOLA della provincia: Google a volte mette in short_name
    // «Città Metropolitana di Milano», non «MI». La sigla la accettiamo SOLO se
    // è davvero una sigla (2 lettere): meglio lasciare il campo vuoto e
    // compilabile a mano che dedurre una provincia sbagliata («non dedurre dati
    // critici»).
    const grezza = comp(cc, "administrative_area_level_2", true) ?? comp(cc, "administrative_area_level_3", true);
    const provincia = grezza && /^[A-Za-z]{2}$/.test(grezza) ? grezza : null;
    return NextResponse.json({
      // «Via Montenapoleone 12»: la via col civico, che è ciò che sta nel campo
      // Indirizzo. Il resto (città, provincia) va nei suoi campi, non qui.
      indirizzo: [via, civico].filter(Boolean).join(" ") || null,
      citta: (comp(cc, "locality") ?? comp(cc, "postal_town") ?? comp(cc, "administrative_area_level_3"))?.toUpperCase() ?? null,
      provincia: provincia?.toUpperCase() ?? null,
      regione: comp(cc, "administrative_area_level_1"),
      cap: comp(cc, "postal_code"),
      paese: comp(cc, "country"),
      // Coordinate e testo pieno: non li salviamo (il modello non ha lat/lng),
      // ma tornano utili se un domani li si vorrà tenere.
      lat: data.result.geometry?.location?.lat ?? null,
      lng: data.result.geometry?.location?.lng ?? null,
      completo: data.result.formatted_address ?? null,
    });
  }

  // --- Suggerimenti: dalla stringa digitata a un elenco da scegliere ---
  if (!q || q.length < 3) return NextResponse.json({ suggerimenti: [] });
  const url =
    `${AUTOCOMPLETE}?input=${encodeURIComponent(q)}` +
    `&language=it&key=${key}`;
  const data = await fetch(url).then((r) => r.json()).catch(() => null);
  if (!data || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
    return NextResponse.json({ errore: "Ricerca non disponibile" }, { status: 502 });
  }
  const suggerimenti = (data.predictions ?? []).map((x: { description: string; place_id: string }) => ({
    testo: x.description,
    placeId: x.place_id,
  }));
  return NextResponse.json({ suggerimenti });
}
