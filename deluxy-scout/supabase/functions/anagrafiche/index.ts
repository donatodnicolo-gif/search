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

    // SCRITTURA: unisce nel registro le due anagrafiche di un doppione che in
    // Scout è appena stato unito. Senza questo passaggio l'unione vive solo
    // qui: il registro resta con due schede e, siccome l'import fa `upsert on
    // conflict (anagrafiche_id)`, **al giro dopo il doppione torna**.
    // Misurato il 23/08/2026: 65 coppie su 364 si sarebbero disfatte da sole.
    //
    // ⚠️ Nel registro la sorgente viene ARCHIVIATA, non cancellata: un'unione
    // sbagliata si può ancora guardare in faccia.
    if (body.action === 'unisci_anagrafiche') {
      const writeKey = await chiaveHub('ANAGRAFICHE_WRITE_KEY');
      if (!writeKey) return json({ ok: false, reason: 'non_configurato' });
      const res = await fetch(`${BASE}/api/v1/partners/unisci`, {
        method: 'POST',
        headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sorgenteId: body.sorgenteId,
          destinazioneId: body.destinazioneId,
          prova: body.prova === true,
        }),
      });
      const txt = await res.text();
      const dati = (() => {
        try {
          return JSON.parse(txt);
        } catch {
          return null;
        }
      })();
      // ⚠️ L'esito NON si ingoia: 403 vuol dire che la chiave che abbiamo è di
      // sola lettura, ed è un'informazione azionabile («creane una di
      // scrittura»), non un guasto misterioso. Restituirlo come `ok:true`
      // farebbe credere unito ciò che nel registro è ancora doppio.
      if (!res.ok) {
        return json({
          ok: false,
          reason: res.status === 403 ? 'chiave_sola_lettura' : `registro_${res.status}`,
          dettaglio: (dati?.errore ?? dati?.error ?? txt).toString().slice(0, 200),
        });
      }
      return json({ ok: true, ...(dati ?? {}) });
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
      // Account = venditore che segue il cliente. Stringa vuota = azzera.
      if (typeof body.account === 'string') payload.account = body.account.trim() || null;
      if (Array.isArray(body.linee) && body.linee.length) {
        const chiavi = new Set<string>();
        for (const l of body.linee) {
          const k = LINEA_A_INTERESSE[String(l).trim().toLowerCase()];
          if (k) k.forEach((x) => chiavi.add(x));
          else chiavi.add(String(l).trim().toLowerCase());
        }
        payload.interessi = [...chiavi];
      }
      // I REFERENTI, quando il chiamante ne ha: il registro li fonde per
      // email/telefono/nome (`mergeContatti`), quindi rimandare lo stesso
      // referente non ne crea un secondo. Serve alla qualifica di una richiesta
      // web: chi ci ha scritto è una persona vera con nome e recapito, e
      // creare l'azienda senza di lui vorrebbe dire mettere nel registro una
      // scheda muta — il nome di chi chiama resterebbe solo dentro Scout.
      if (Array.isArray(body.contatti) && body.contatti.length) {
        payload.contatti = body.contatti
          .map((c: any) => ({
            nome: c?.nome ?? null,
            email: c?.email ?? null,
            telefono: c?.telefono ?? null,
            ruolo: c?.ruolo ?? null,
          }))
          .filter((c: any) => c.nome || c.email || c.telefono);
      }
      const res = await fetch(`${BASE}/api/v1/partners`, {
        method: 'POST',
        headers: { 'x-api-key': partnerKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) return json({ ok: false, reason: `registro_${res.status}`, dettaglio: txt.slice(0, 200) });
      // ⚠️ L'ESITO NON SI BUTTA VIA (26/08/2026). Fino a qui si rispondeva
      // `{ok:true}` e basta: chi chiamava non sapeva se l'anagrafica era NATA
      // adesso o esisteva già, e soprattutto **perdeva l'id** che il registro
      // manda indietro — l'unico modo che ha Scout di agganciare il negozio
      // alla scheda del registro senza aspettare l'import della notte.
      //   esito: 'creato' (201) | 'merged' (200, c'era già)
      const dati = (() => {
        try {
          return JSON.parse(txt);
        } catch {
          return null;
        }
      })();
      return json({
        ok: true,
        esito: dati?.esito ?? null,
        id: dati?.id ?? null,
        nome: dati?.nome ?? null,
      });
    }

    let path = '';
    if (body.action === 'cerca') {
      const p = new URLSearchParams();
      if (body.q) p.set('q', String(body.q));
      if (body.citta) p.set('citta', String(body.citta));
      if (body.categoria) p.set('categoria', String(body.categoria));
      if (body.stato) p.set('stato', String(body.stato));
      // `fonte` = quale app ha segnalato il partner (es. `deluxy-suppliers`,
      // i fioristi e le pasticcerie trovati dall'app fornitori). Senza questo
      // filtro l'unico modo di trovarli era scaricare tutti i 600+ prospect.
      if (body.fonte) p.set('fonte', String(body.fonte));
      // `statoFornitore` = il rapporto di fornitura (da_provare | abituale |
      // da_evitare): serve alla vista Fornitori. Come per `fonte`, il client
      // verifica che il filtro sia stato applicato davvero — una funzione
      // vecchia lo ignorerebbe in silenzio.
      if (body.statoFornitore) p.set('statoFornitore', String(body.statoFornitore));
      if (body.page) p.set('page', String(body.page));
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
