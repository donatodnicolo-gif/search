// Edge Function `anagrafiche` (Deno): proxy di SOLA LETTURA verso il registro
// Deluxy Anagrafiche. Custodisce la chiave `ANAGRAFICHE_API_KEY` come secret
// (mai nel bundle dell'app) e inoltra le query. Regola d'oro del registro:
// le app leggono, non tengono copie — questa funzione permette la lettura live.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('ANAGRAFICHE_URL') ?? 'https://deluxy-anagrafiche.vercel.app';

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
    const key = await chiaveHub('ANAGRAFICHE_API_KEY'); // dalla cassaforte hub, fallback env
    if (!key) return json({ error: 'ANAGRAFICHE_API_KEY non configurata' }, 500);

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));

    // SCRITTURA: archivia/ripristina un referente del partner. Richiede una
    // chiave di SCRITTURA dedicata (`ANAGRAFICHE_WRITE_KEY`) e l'endpoint sul
    // registro. Finché non ci sono, resta inerte (l'archiviazione locale in
    // Scout è già avvenuta): { ok:false, reason:'non_configurato' }.
    if (body.action === 'archivia_referente') {
      const writeKey = await chiaveHub('ANAGRAFICHE_WRITE_KEY');
      if (!writeKey) return json({ ok: false, reason: 'non_configurato' });
      const res = await fetch(`${BASE}/api/v1/referenti/archivia`, {
        method: 'POST',
        headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Identità del partner: riferimento esterno di Scout (place_id).
          riferimento: { sistema: 'scout', idEsterno: body.placeId },
          // Contesto per il match del partner se il riferimento non esiste ancora.
          negozio: body.negozio ?? null,
          citta: body.citta ?? null,
          // Referente da archiviare (match per email/telefono/nome dentro il partner).
          referente: { nome: body.nome ?? null, email: body.email ?? null, telefono: body.telefono ?? null },
          archiviato: Boolean(body.archiviato),
          origine: 'deluxy-scout',
        }),
      });
      const txt = await res.text();
      if (!res.ok) return json({ ok: false, reason: `registro_${res.status}`, dettaglio: txt.slice(0, 200) });
      return json({ ok: true });
    }

    // SCRITTURA: crea/aggiorna il PARTNER nel registro a partire da un negozio
    // Scout (upsert-merge per riferimento esterno scout+place_id). Serve una
    // chiave con scope di scrittura partner (`ANAGRAFICHE_PARTNER_KEY`). Inerte
    // finché non è impostata: { ok:false, reason:'non_configurato' }.
    if (body.action === 'upsert_partner') {
      const partnerKey = await chiaveHub('ANAGRAFICHE_PARTNER_KEY');
      if (!partnerKey) return json({ ok: false, reason: 'non_configurato' });
      // Mappa lo stato Scout → stato del registro.
      const STATO: Record<string, string> = {
        da_visitare: 'prospect',
        visitato: 'in_contatto',
        cliente: 'attivo',
        perso: 'non_interessato',
      };
      const payload: Record<string, unknown> = {
        sistema: 'scout',
        idEsterno: String(body.placeId ?? ''),
        nome: body.nome ?? null,
        citta: body.citta ?? null,
        indirizzo: body.indirizzo ?? null,
        categoria: body.categoria ?? null,
        asOf: new Date().toISOString(),
      };
      // Stato: se arriva lo stato "vero" di Anagrafiche (8 valori) si usa
      // direttamente; altrimenti si mappa dai 4 stati di pipeline di Scout.
      const STATI_REGISTRO = new Set([
        'prospect', 'in_contatto', 'in_attesa', 'in_trattativa',
        'da_ricontattare', 'attivo', 'non_interessato', 'dismesso',
      ]);
      if (body.statoRegistro && STATI_REGISTRO.has(String(body.statoRegistro))) {
        payload.stato = String(body.statoRegistro);
      } else if (body.stato && STATO[String(body.stato)]) {
        payload.stato = STATO[String(body.stato)];
      }
      // Mappa le linee di Scout (label) → chiavi interessi del registro, speculare
      // alla lettura lato app. Finché i cataloghi non sono identici, così il
      // round-trip resta stabile (una linea può espandersi in più chiavi).
      const LINEA_A_INTERESSE: Record<string, string[]> = {
        consegne: ['consegne'],
        affiliazioni: ['affiliazione'],
        affiliazione: ['affiliazione'],
        gifting: ['gifting'],
        'eventi & catering': ['eventi', 'catering'],
        eventi: ['eventi'],
        catering: ['catering'],
        concierge: ['pr_activation'],
        clientelling: ['in_store'],
        'food supplier': ['vendor'],
        vendor: ['vendor'],
        're-seller': ['reseller'],
        reseller: ['reseller'],
      };
      if (Array.isArray(body.linee) && body.linee.length) {
        const chiavi = new Set<string>();
        for (const l of body.linee) {
          const k = LINEA_A_INTERESSE[String(l).trim().toLowerCase()];
          if (k) k.forEach((x) => chiavi.add(x));
          else chiavi.add(String(l).trim().toLowerCase());
        }
        payload.interessi = [...chiavi];
      }
      const res = await fetch(`${BASE}/api/v1/partners`, {
        method: 'POST',
        headers: { 'x-api-key': partnerKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) return json({ ok: false, reason: `registro_${res.status}`, dettaglio: txt.slice(0, 200) });
      return json({ ok: true });
    }

    let path = '';
    if (body.action === 'cerca') {
      const p = new URLSearchParams();
      if (body.q) p.set('q', String(body.q));
      if (body.citta) p.set('citta', String(body.citta));
      if (body.categoria) p.set('categoria', String(body.categoria));
      if (body.stato) p.set('stato', String(body.stato));
      p.set('perPage', String(Math.min(Number(body.perPage ?? 10), 50)));
      path = `/api/v1/partners?${p.toString()}`;
    } else if (body.action === 'dettaglio' && body.id) {
      path = `/api/v1/partners/${encodeURIComponent(String(body.id))}`;
    } else {
      return json({ error: `Azione sconosciuta: ${body.action}` }, 400);
    }

    const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key } });
    const txt = await res.text();
    if (!res.ok) return json({ error: `Registro ${res.status}: ${txt.slice(0, 300)}` }, res.status);
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
