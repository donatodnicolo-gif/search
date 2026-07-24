// Edge Function `notifica-task` (Deno): invia un'email all'assegnatario quando
// gli viene assegnato un task da un altro utente.
//
// Sicurezza: le credenziali SMTP vivono QUI come secret, mai nel bundle.
// Se i secret SMTP non sono configurati, la funzione NON invia nulla e risponde
// { sent: false, reason: 'smtp_non_configurato' } (nessun errore): la feature è
// inerte finché non si impostano le credenziali.
//
// Secret richiesti per attivare l'invio:
//   supabase secrets set SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... SMTP_FROM=...
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { credenzialiPerUtente, inviaMail } from '../_shared/smtp.ts';

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

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const { task_id } = await req.json();
    if (!task_id) return json({ error: 'task_id mancante' }, 400);

    const { data: task } = await admin.from('tasks').select('*').eq('id', task_id).single();
    if (!task) return json({ error: 'Task non trovato' }, 404);

    // Niente notifica se il task è per sé stessi.
    if (!task.owner || task.owner === task.creato_da) {
      return json({ sent: false, reason: 'self_assign' });
    }

    const { data: profili } = await admin
      .from('profiles')
      .select('id, email, nome')
      .in('id', [task.owner, task.creato_da].filter(Boolean));
    const assegnatario = (profili ?? []).find((p: any) => p.id === task.owner);
    const creatore = (profili ?? []).find((p: any) => p.id === task.creato_da);
    if (!assegnatario?.email) return json({ sent: false, reason: 'email_assegnatario_assente' });

    // Mittente = la casella personale di CHI assegna il task (fallback: secret globali).
    const cred = await credenzialiPerUtente(admin, task.creato_da ?? null);
    if (!cred) return json({ sent: false, reason: 'smtp_non_configurato' });

    const nomeCreatore = creatore?.nome || creatore?.email?.split('@')[0] || 'Un collega';
    const scad = task.scadenza ? ` (scadenza ${task.scadenza})` : '';
    const oggetto = `Nuovo task Deluxy Scout: ${task.titolo}`;
    const corpo =
      `${nomeCreatore} ti ha assegnato un task su Deluxy Scout:\n\n` +
      `• ${task.titolo}\n` +
      `• Priorità: ${task.priorita}${scad}\n\n` +
      `Aprilo qui: https://deluxy-scout.vercel.app/task\n`;

    const esito = await inviaMail(cred, { to: assegnatario.email, subject: oggetto, content: corpo });
    if (!esito.ok) return json({ sent: false, error: esito.errore }, 502);

    return json({ sent: true, to: assegnatario.email });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
