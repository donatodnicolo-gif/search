// Edge Function `mail` (Deno): proxy verso AI Mail (deluxy-mail).
// Custodisce la chiave API di AI Mail server-side (secret MAIL_API_TOKEN, fallback
// vault hub) e chiede le ultime mail ricevute da un contatto per la scheda Scout.
//   { azione: 'messaggi', email: '<contatto>', limite?: 10 } → GET /api/v1/messaggi
// L'header x-utente (casella su cui operare) = email dell'utente Scout loggato.
//
//   { azione: 'richieste', limite?: 50 } → importa in `leads` la posta della
// CASELLA COMMERCIALE (secret MAIL_CASELLA_RICHIESTE, default
// commerciale@deluxy.it): ogni mail arrivata lì è una richiesta da lavorare.
// Dedup sul Message-ID (`leads.mail_id`, migr. 0042).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('MAIL_URL') ?? 'https://deluxy-mail.vercel.app';

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
    // Chiave di AI Mail: prima il secret dell'edge function, poi il vault hub.
    const key = Deno.env.get('MAIL_API_TOKEN') ?? (await chiaveHub('MAIL_API_TOKEN'));
    if (!key) return json({ ok: false, errore: 'MAIL_API_TOKEN non configurata' }, 500);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Chi chiama: di norma un utente Scout loggato (la sua email = casella su
    // cui leggere). L'import delle richieste non dipende da chi lo lancia, così
    // vale anche una chiave server-to-server (cron, automazioni).
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const email = userData?.user?.email;
    const chiaveApi = (req.headers.get('x-api-key') ?? '').trim();
    const daServizio = Boolean(chiaveApi) && chiaveApi === Deno.env.get('COMMERCIALE_API_KEY');

    const body = await req.json().catch(() => ({}));
    // L'azione "richieste" accetta anche la chiave; tutto il resto vuole l'utente.
    if (!email && !(daServizio && body.azione === 'richieste')) {
      return json({ ok: false, errore: 'Non autenticato' }, 401);
    }

    // ── Richieste Web: la posta della casella commerciale diventa lead ────────
    if (body.azione === 'richieste') {
      const casella = Deno.env.get('MAIL_CASELLA_RICHIESTE') ?? 'commerciale@deluxy.it';
      const limite = Math.min(Math.max(Number(body.limite ?? 50) || 50, 1), 100);
      const p = new URLSearchParams({ casella: '1', limite: String(limite) });
      if (body.da) p.set('da', String(body.da));

      const res = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
        headers: { 'x-api-key': key, 'x-utente': casella },
      });
      const dati = await res.json().catch(() => null);
      if (!res.ok || !dati?.ok) {
        // 404 = in AI Mail non c'è un utente attivo con quella email: è la causa
        // più probabile, e dal messaggio grezzo non si capirebbe cosa fare.
        const errore =
          res.status === 404
            ? `In AI Mail non c'è una casella attiva «${casella}». Creala fra gli utenti di AI Mail (o cambia il secret MAIL_CASELLA_RICHIESTE), poi riprova.`
            : (dati?.errore ?? `AI Mail ha risposto ${res.status} per la casella ${casella}.`);
        return json({ ok: false, errore, casella }, res.status === 404 ? 404 : 502);
      }

      const messaggi: any[] = Array.isArray(dati.messaggi) ? dati.messaggi : [];
      // Le nostre stesse mail non sono richieste.
      const inArrivo = messaggi.filter((m) => m.direzione !== 'uscita' && m.email !== casella);
      const ids = inArrivo.map((m) => m.messageId).filter(Boolean);

      let importati = 0;
      if (ids.length) {
        const { data: gia } = await admin.from('leads').select('mail_id').in('mail_id', ids);
        const noti = new Set((gia ?? []).map((r: any) => r.mail_id));
        const nuovi = inArrivo
          .filter((m) => m.messageId && !noti.has(m.messageId))
          .map((m) => ({
            nome: m.da || m.email || 'Richiesta senza mittente',
            contatto: m.email ?? null,
            fonte: 'mail',
            // L'oggetto dice cosa chiede; l'anteprima aggiunge il contesto.
            messaggio: [m.oggetto, m.anteprima].filter(Boolean).join(' — ').slice(0, 2000) || null,
            mail_id: m.messageId,
          }));
        if (nuovi.length) {
          const { error } = await admin.from('leads').insert(nuovi);
          if (error) return json({ ok: false, errore: error.message }, 500);
          importati = nuovi.length;
        }
      }

      return json({ ok: true, casella, lette: inArrivo.length, importate: importati });
    }

    if (body.azione !== 'messaggi') return json({ ok: false, errore: `Azione sconosciuta: ${body.azione}` }, 400);
    // Da qui in poi serve l'utente: la casella da leggere è la sua.
    if (!email) return json({ ok: false, errore: 'Non autenticato' }, 401);

    const contatto = String(body.email ?? '').trim();
    if (!contatto) return json({ ok: false, errore: 'Manca email del contatto' }, 400);
    const limite = Math.min(Math.max(Number(body.limite ?? 30) || 30, 1), 100);

    const p = new URLSearchParams({ email: contatto, limite: String(limite) });
    if (body.da) p.set('da', String(body.da));
    if (body.a) p.set('a', String(body.a));
    if (body.server) p.set('server', '1');
    const res = await fetch(`${BASE}/api/v1/messaggi?${p.toString()}`, {
      headers: { 'x-api-key': key, 'x-utente': email },
    });
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ ok: false, errore: String((e as any)?.message ?? e) }, 500);
  }
});
