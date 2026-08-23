// Edge Function `ordini` (Deno): proxy di SOLA LETTURA verso Deluxy Orders, il
// registro centralizzato degli ordini Shopify.
//
// Esiste per una ragione sola: la chiave dell'API di Orders non può stare nel
// bundle dell'app. Scout gira anche nel browser, e tutto ciò che è nel bundle è
// leggibile da chiunque apra gli strumenti di sviluppo. Qui la chiave resta
// lato server, custodita nella cassaforte del Hub.
//
// Sola lettura, sempre: Scout non ha nulla da scrivere sugli ordini. Se un
// giorno servisse, va aggiunto un permesso esplicito — non allargato questo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';
import { chiaveIngressoValida } from '../_shared/chiaveIn.ts';

const BASE = Deno.env.get('ORDERS_URL') ?? 'https://deluxy-orders.vercel.app';

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
    const key = await chiaveHub('ORDERS_API_KEY');
    // Inerte finché la chiave non è configurata, come il proxy `anagrafiche`:
    // risponde `non_configurato` invece di un errore, così la schermata può
    // dire «i dati di vendita non sono collegati» e mostrare tutto il resto.
    if (!key) return json({ ok: false, reason: 'non_configurato' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    // Autenticazione: di norma un utente Scout loggato. L'aggiornamento della
    // copertura lo lancia però il **cron notturno**, che una sessione non ce
    // l'ha: per quella sola azione vale anche la chiave di servizio.
    //
    // ⚠️ Il controllo sta PRIMA dello smistamento delle azioni, non dentro un
    // ramo: un'azione aggiunta sopra il controllo sarebbe pubblica senza che
    // nessuno se ne accorga (è successo davvero in `hubspot-match`).
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const chiaveApi = (req.headers.get('x-api-key') ?? '').trim();
    const daServizio = chiaveApi ? (await chiaveIngressoValida(chiaveApi, admin)).ok : false;
    if (!userData?.user && !(daServizio && body.action === 'aggiorna_copertura')) {
      return json({ error: 'Non autenticato' }, 401);
    }

    // ── Aggiorna la COPERTURA salvata (la lancia il cron notturno) ───────────
    //
    // Salva i **dati grezzi** delle due chiamate lente — il registro (1056
    // partner) e il venduto per provincia — dentro `copertura_cache`. Il conto
    // resta nel client: se lo rifacessimo qui, la stessa regola vivrebbe in due
    // posti e al primo ritocco direbbero due cose diverse.
    //
    // ⚠️ È QUI che si guadagna il tempo: il client paginava il registro **50
    // alla volta** passando ogni volta da questa Edge, cioè ~22 andate e
    // ritorno prima di poter disegnare qualcosa. Da qui si chiede a pagine di
    // 200, e chi apre la schermata legge una riga di tabella.
    if (body.action === 'aggiorna_copertura') {
      const chiaveAnag = await chiaveHub('ANAGRAFICHE_API_KEY');
      if (!chiaveAnag) return json({ ok: false, reason: 'anagrafiche_non_configurato' });
      const ANAG = Deno.env.get('ANAGRAFICHE_URL') ?? 'https://deluxy-anagrafiche.vercel.app';

      // 1) I partner del registro, a pagine di 200.
      const partner: unknown[] = [];
      let completo = true;
      for (let page = 1; page <= 12; page++) {
        const r = await fetch(`${ANAG}/api/v1/partners?perPage=200&attivo=tutti&page=${page}`, {
          headers: { 'x-api-key': chiaveAnag },
        });
        if (!r.ok) {
          completo = false;
          break;
        }
        const j = await r.json().catch(() => ({}));
        const righe = j?.dati ?? [];
        if (!righe.length) break;
        // ⚠️ Si tengono SOLO i tre campi che la vista usa. Con i partner interi
        // erano 1,8 MB da scaricare a ogni apertura della schermata: si sarebbe
        // sostituita una lentezza con un'altra, meno visibile.
        for (const p of righe) {
          partner.push({ provincia: p?.provincia ?? null, citta: p?.citta ?? null, stato: p?.stato ?? null });
        }
      }

      // 2) Il venduto per provincia, per ogni periodo che la schermata offre.
      //    ⚠️ I confini si calcolano su **Europe/Rome**, non su UTC: la
      //    mezzanotte italiana sono le 22:00 o le 23:00 UTC, e due ore di ogni
      //    giorno finirebbero nel periodo prima.
      const oggiRoma = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
      const A = oggiRoma.getFullYear();
      const M = oggiRoma.getMonth();
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const periodi: Record<string, { da?: string; a?: string }> = {
        mese: { da: iso(new Date(A, M, 1)), a: iso(new Date(A, M + 1, 1)) },
        trimestre: {
          da: iso(new Date(A, Math.floor(M / 3) * 3, 1)),
          a: iso(new Date(A, Math.floor(M / 3) * 3 + 3, 1)),
        },
        anno: { da: iso(new Date(A, 0, 1)), a: iso(new Date(A + 1, 0, 1)) },
        'anno-scorso': { da: iso(new Date(A - 1, 0, 1)), a: iso(new Date(A, 0, 1)) },
        tutto: {},
      };

      const righeCache: { chiave: string; dati: unknown; aggiornato_il: string }[] = [
        { chiave: 'partner', dati: { partner, completo }, aggiornato_il: new Date().toISOString() },
      ];

      for (const [nome, int] of Object.entries(periodi)) {
        const p = new URLSearchParams();
        if (int.da) p.set('da', int.da);
        if (int.a) p.set('a', int.a);
        const r = await fetch(`${BASE}/api/v1/province${p.toString() ? `?${p}` : ''}`, {
          headers: { 'x-api-key': key },
        });
        if (!r.ok) continue; // un periodo che non risponde non deve far saltare gli altri
        righeCache.push({
          chiave: `vendite:${nome}`,
          dati: await r.json(),
          aggiornato_il: new Date().toISOString(),
        });
      }

      const { error } = await admin.from('copertura_cache').upsert(righeCache, { onConflict: 'chiave' });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, partner: partner.length, completo, periodi: righeCache.length - 1 });
    }

    let path = '';
    if (body.action === 'province') {
      const p = new URLSearchParams();
      // Senza anno si guarda tutto lo storico: per capire *dove* si vende, tre
      // anni dicono più di dodici mesi.
      if (body.anno) p.set('anno', String(body.anno));
      if (body.da) p.set('da', String(body.da));
      if (body.a) p.set('a', String(body.a));
      if (body.brand) p.set('brand', String(body.brand));
      path = `/api/v1/province${p.toString() ? `?${p}` : ''}`;
    } else {
      return json({ error: `Azione sconosciuta: ${body.action}` }, 400);
    }

    const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': key } });
    const txt = await res.text();
    if (!res.ok) return json({ error: `Orders ${res.status}: ${txt.slice(0, 300)}` }, res.status);
    return new Response(txt, { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
