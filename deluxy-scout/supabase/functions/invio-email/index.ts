// Edge Function `invio-email` (Deno): invia un'email di prospezione a UNO o PIÙ
// contatti, dalla casella personale del venditore (Register.it). Il corpo è HTML
// (formattazione dallo Script) e i segnaposto tra [ ] vengono personalizzati per
// destinatario ([nome], [negozio]…) + variabili manuali uguali per tutti ([data]…).
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sostituisci(testo: string, chiave: string, valore: string): string {
  const c = escapeRe(chiave);
  return testo
    .replace(new RegExp(`\\[\\s*${c}\\s*\\]`, 'gi'), valore)
    .replace(new RegExp(`\\{\\s*${c}\\s*\\}`, 'gi'), valore); // retro-compat {nome}/{negozio}
}

type Dest = { email: string; nome?: string | null; negozio?: string | null; ruolo?: string | null; telefono?: string | null; zona?: string | null };

/** Sostituisce le variabili di contatto + quelle manuali (uguali per tutti). */
function personalizza(testo: string, d: Dest, manuali: Record<string, string>): string {
  let out = testo ?? '';
  out = sostituisci(out, 'nome', (d.nome ?? '').trim() || 'Gentile cliente');
  out = sostituisci(out, 'negozio', (d.negozio ?? '').trim());
  out = sostituisci(out, 'ruolo', (d.ruolo ?? '').trim());
  out = sostituisci(out, 'email', (d.email ?? '').trim());
  out = sostituisci(out, 'telefono', (d.telefono ?? '').trim());
  out = sostituisci(out, 'zona', (d.zona ?? '').trim());
  for (const [k, v] of Object.entries(manuali)) out = sostituisci(out, k, v);
  return out;
}

const sembraHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);
/** Testo piano → HTML (a capo → <br>) per i modelli vecchi non formattati. */
function comeHtml(s: string): string {
  return sembraHtml(s) ? s : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
/** HTML → testo piano (fallback per client che non mostrano l'HTML). */
function comeTesto(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    const destinatari: Dest[] = Array.isArray(body.destinatari) ? body.destinatari : [];
    // Variabili manuali (uguali per tutti): { chiave-lower: valore }.
    const manuali: Record<string, string> = body.variabili && typeof body.variabili === 'object' ? body.variabili : {};

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
        const html = comeHtml(personalizza(corpo, d, manuali));
        await client.send({
          from: cred.from,
          to: String(d.email),
          subject: personalizza(oggetto || 'Deluxy', d, manuali) || 'Deluxy',
          html,
          content: comeTesto(html), // fallback testo per i client senza HTML
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
