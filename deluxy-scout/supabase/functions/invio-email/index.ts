// Edge Function `invio-email` (Deno): invia un'email di prospezione a UNO o PIÙ
// contatti, dalla casella personale del venditore (Register.it). Il corpo è HTML
// (formattazione dallo Script) e i segnaposto tra [ ] vengono personalizzati per
// destinatario ([nome], [negozio]…) + variabili manuali uguali per tutti ([data]…).
//
// ✉️ DUE STRADE, IN QUEST'ORDINE — e la ragione conta:
//   1. **AI Mail** (`/api/v1/invia`, se c'è `MAIL_API_TOKEN` e l'utente ha lì la
//      sua casella). Manda **e lascia la copia nella cartella «Inviata»** del
//      server, più la registrazione in AI Mail. È quello che serve a chi scrive:
//      ritrovare in Outlook e in AI Mail quello che ha mandato da Scout.
//   2. **SMTP diretto** (ripiego). La mail parte, ma **non resta traccia nella
//      casella di chi l'ha scritta**: SMTP consegna e basta, la copia in
//      «Inviata» è un'operazione IMAP che qui nessuno fa. Era il comportamento
//      di prima ed è il motivo per cui le mail di Scout «sparivano».
// Mai tutte e due per lo stesso destinatario: sarebbe una mail doppia.
//
// Sicurezza: la password SMTP non transita mai (sta cifrata in smtp_account,
// letta solo dal service_role via credenzialiPerUtente). L'utente dev'essere
// loggato. Invio SEQUENZIALE con un tetto massimo, esito per destinatario.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { credenzialiPerUtente, inviaMail } from '../_shared/smtp.ts';
import { chiaveAiMail, inviaViaAiMail } from '../_shared/aimail.ts';

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
    // Può mancare: se AI Mail sa servire questo utente, si manda comunque.
    const cred = await credenzialiPerUtente(admin, uid);

    // Strada 1: AI Mail. Serve la chiave e l'email dell'utente Scout loggato,
    // che è anche l'utente/casella su cui AI Mail deve operare.
    const casella = (userData?.user?.email ?? '').trim().toLowerCase();
    const chiave = casella ? await chiaveAiMail() : null;
    // Diventa true appena AI Mail dice che per questa casella non può fare
    // niente: da lì in poi si va di SMTP senza ritentare per ogni destinatario.
    let aiMailFuoriGioco = !chiave || !casella;

    if (!cred && aiMailFuoriGioco) {
      return json(
        { error: 'Casella email non configurata. Collegala da Profilo → La mia email.', reason: 'smtp_non_configurato' },
        400,
      );
    }

    // La casella "effettiva" può cambiare al primo invio (fallback Aruba se il
    // cert di Register.it non è valido); da lì in poi si usa quella.
    let credCorrente = cred;
    const esiti: { email: string; ok: boolean; errore?: string; via?: 'aimail' | 'smtp' }[] = [];
    for (const d of validi) {
      const a = String(d.email);
      const html = comeHtml(personalizza(corpo, d, manuali));
      const testo = comeTesto(html);
      const subject = personalizza(oggetto || 'Deluxy', d, manuali) || 'Deluxy';

      // ── Strada 1: AI Mail (la copia resta in «Inviata») ──────────────────
      if (!aiMailFuoriGioco && chiave) {
        const r = await inviaViaAiMail(chiave, casella, { a, oggetto: subject, html, testo });
        if (r.ok) {
          esiti.push({ email: a, ok: true, via: 'aimail' });
          continue;
        }
        if (r.cassettaAssente) aiMailFuoriGioco = true;
        // Senza SMTP di scorta il fallimento è definitivo: va detto qui, con la
        // ragione vera, altrimenti l'utente vede un destinatario fallito e basta.
        if (!credCorrente) {
          esiti.push({ email: a, ok: false, errore: `AI Mail: ${r.errore ?? 'invio non riuscito'}`.slice(0, 140) });
          continue;
        }
      }

      // ── Strada 2: SMTP diretto (nessuna copia in «Inviata») ──────────────
      if (!credCorrente) {
        esiti.push({ email: a, ok: false, errore: 'Nessuna casella disponibile per l\'invio.' });
        continue;
      }
      try {
        const esito = await inviaMail(credCorrente, { to: a, subject, html, content: testo });
        if (!esito.ok) throw new Error(esito.errore ?? 'invio non riuscito');
        if (esito.hostUsato && esito.hostUsato !== credCorrente.host) credCorrente = { ...credCorrente, host: esito.hostUsato };
        esiti.push({ email: a, ok: true, via: 'smtp' });
      } catch (e) {
        esiti.push({ email: a, ok: false, errore: String((e as any)?.message ?? e).slice(0, 140) });
      }
    }

    const riusciti = esiti.filter((e) => e.ok);
    const inviate = riusciti.length;
    return json({
      inviate,
      totale: validi.length,
      falliti: esiti.filter((e) => !e.ok),
      da: cred?.from ?? casella,
      // Quante mail hanno lasciato la copia in «Inviata». Il client lo dice a
      // chi ha scritto: «la trovi anche nella tua posta» non è un dettaglio.
      inInviata: riusciti.filter((e) => e.via === 'aimail').length,
      via: riusciti.length ? (riusciti.every((e) => e.via === 'aimail') ? 'aimail' : riusciti.some((e) => e.via === 'aimail') ? 'misto' : 'smtp') : undefined,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
