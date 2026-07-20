// Edge Function `invio-email` (Deno): invia un'email di prospezione a UNO o PIÙ
// contatti, dalla casella personale del venditore (Register.it), personalizzando
// i segnaposto {nome} e {negozio} per ciascun destinatario.
//
// Sicurezza: la password SMTP non transita mai (sta cifrata in smtp_account,
// letta solo dal service_role via credenzialiPerUtente). L'utente dev'essere
// loggato. Invio SEQUENZIALE con un tetto massimo, esito per destinatario.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { credenzialiPerUtente } from '../_shared/smtp.ts';

const MAX_DESTINATARI = 60; // tetto prudente (limiti d'invio Register.it + antispam)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

function personalizza(testo: string, d: { nome?: string | null; negozio?: string | null }): string {
  return (testo ?? '')
    .replace(/\{nome\}/gi, (d.nome ?? '').trim() || 'Gentile cliente')
    .replace(/\{negozio\}/gi, (d.negozio ?? '').trim() || '');
}

const emailValida = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    const oggetto: string = String(body.oggetto ?? '').trim();
    const corpo: string = String(body.corpo ?? '');
    const destinatari: { email: string; nome?: string | null; negozio?: string | null }[] = Array.isArray(body.destinatari) ? body.destinatari : [];

    if (!corpo.trim()) return json({ error: 'Il testo dell\'email è vuoto.' }, 400);
    const validi = destinatari.filter((d) => d?.email && emailValida(String(d.email)));
    if (!validi.length) return json({ error: 'Nessun destinatario con email valida.' }, 400);
    if (validi.length > MAX_DESTINATARI) return json({ error: `Troppi destinatari (max ${MAX_DESTINATARI} per invio).` }, 400);

    // Casella del mittente = quella personale dell'utente (Register.it).
    const cred = await credenzialiPerUtente(admin, uid);
    if (!cred) return json({ error: 'Casella email non configurata. Collegala da Profilo → La mia email.', reason: 'smtp_non_configurato' }, 400);

    const client = new SMTPClient({
      connection: { hostname: cred.host, port: cred.port, tls: cred.port === 465, auth: { username: cred.user, password: cred.pass } },
    });

    const esiti: { email: string; ok: boolean; errore?: string }[] = [];
    for (const d of validi) {
      try {
        await client.send({
          from: cred.from,
          to: String(d.email),
          subject: personalizza(oggetto || 'Deluxy', d) || 'Deluxy',
          content: personalizza(corpo, d),
        });
        esiti.push({ email: String(d.email), ok: true });
      } catch (e) {
        esiti.push({ email: String(d.email), ok: false, errore: String((e as any)?.message ?? e).slice(0, 140) });
      }
    }
    try {
      await client.close();
    } catch {
      /* la connessione può già essere chiusa */
    }

    const inviate = esiti.filter((e) => e.ok).length;
    return json({ inviate, totale: validi.length, falliti: esiti.filter((e) => !e.ok), da: cred.from });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
