// Edge Function `servizi-consegne` (Deno): proxy di SOLA LETTURA verso la
// PIATTAFORMA CONSEGNE (deluxy-delivery), per leggere il suo catalogo dei
// servizi.
//
// Perché esiste (richiesta dell'utente, 27/08/2026, dalla pagina Linee di
// interesse: «ora dovresti poter richiamare l'app delivery per dire quali
// inserire»): Scout è il master delle LINEE DI INTERESSE, ma i servizi che si
// vendono davvero sono già scritti nella piattaforma. Finora le linee si
// battevano a mano da questa parte, e ci si accorgeva mesi dopo che «Eventi» e
// «Eventi & Catering» erano la stessa cosa scritta in due modi.
//
// ⚠️ Solo lettura, e in un verso solo. Il servizio appartiene alla piattaforma,
// la linea appartiene a Scout (Standard Deluxy §7: ogni dato ha una casa sola).
// Qui non si scrive niente di là, e quello che nasce di qua è una linea NOSTRA
// che tiene il codice del servizio come riferimento — non una copia del record.
//
// ⚠️ La chiave resta sul server: nel bundle web sarebbe leggibile da chiunque
// apra gli strumenti di sviluppo. Si prende dalla cassaforte (Impostazioni →
// App collegate, riga «Consegne»), come le altre.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

/** Dove risponde il canale app-to-app della piattaforma. */
const BASE_DEFAULT = 'https://deluxy-delivery.vercel.app/api/v1';

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
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const key = await chiaveHub('PIATTAFORMA_API_KEY');
    // ⚠️ NON è un errore: è uno STATO, e va detto com'è. La schermata che lo
    // riceve scrive «non collegata» e come collegarla, invece di mostrare un
    // rosso che sembra un guasto della piattaforma.
    if (!key) return json({ ok: false, motivo: 'non_configurato' });

    // L'indirizzo si può cambiare da Impostazioni senza rifare il deploy: un
    // dominio scritto nel codice è un dominio che si scopre sbagliato di
    // domenica.
    let base = BASE_DEFAULT;
    try {
      const { data } = await admin.from('chiavi_app').select('url_base').eq('app', 'piattaforma').maybeSingle();
      const u = (data?.url_base ?? '').trim();
      if (u) base = u.replace(/\/$/, '');
    } catch {
      // riga assente o tabella irraggiungibile: vale il default
    }

    const body = await req.json().catch(() => ({}));
    const ambito = typeof body?.ambito === 'string' ? `?ambito=${encodeURIComponent(body.ambito)}` : '';

    const res = await fetch(`${base}/app/servizi${ambito}`, {
      headers: { 'x-api-key': key, 'X-App': 'deluxy-scout' },
    });
    const txt = await res.text();
    if (!res.ok) {
      // ⚠️ Il messaggio della piattaforma si riporta INTERO (troncato): «401
      // chiave non valida» dice cosa fare, «non riuscito» manda a indovinare.
      return json({ ok: false, motivo: 'errore', stato: res.status, dettaglio: txt.slice(0, 300) });
    }
    let servizi: unknown;
    try {
      servizi = JSON.parse(txt);
    } catch {
      return json({ ok: false, motivo: 'errore', stato: res.status, dettaglio: 'Risposta non in JSON.' });
    }
    if (!Array.isArray(servizi)) {
      return json({ ok: false, motivo: 'errore', stato: res.status, dettaglio: 'Risposta inattesa: non è un elenco.' });
    }
    return json({ ok: true, servizi });
  } catch (e) {
    return json({ ok: false, motivo: 'errore', dettaglio: String((e as any)?.message ?? e) });
  }
});
