// Edge Function `promemoria` (Deno): invia all'utente che la chiama un riepilogo
// email delle sue prossime cose da fare — task aperti in scadenza/scaduti e
// follow-up di trattative con scadenza raggiunta.
//
// Come `notifica-task`: se i secret SMTP non sono configurati la funzione è
// INERTE ({ sent: false, reason: 'smtp_non_configurato' }), nessun invio.
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

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Non autenticato' }, 401);

    const oggi = new Date().toISOString().slice(0, 10);

    const { data: tasks } = await admin
      .from('tasks')
      .select('titolo, priorita, scadenza')
      .eq('owner', uid)
      .eq('completata', false)
      .not('scadenza', 'is', null)
      .lte('scadenza', oggi)
      .order('scadenza');
    const { data: deals } = await admin
      .from('deals')
      .select('linea, scadenza, next_action, places(nome)')
      .eq('owner', uid)
      .not('scadenza', 'is', null)
      .lte('scadenza', oggi)
      .not('fase', 'in', '("closedwon","closedlost")')
      .order('scadenza');

    const nTask = tasks?.length ?? 0;
    const nDeal = deals?.length ?? 0;
    if (!nTask && !nDeal) return json({ sent: false, reason: 'niente_in_scadenza' });

    const { data: profilo } = await admin.from('profiles').select('email, nome').eq('id', uid).single();
    if (!profilo?.email) return json({ sent: false, reason: 'email_assente' });

    // Il promemoria parte dalla casella personale dell'utente (Register.it).
    const cred = await credenzialiPerUtente(admin, uid);
    if (!cred) return json({ sent: false, reason: 'smtp_non_configurato', task: nTask, followup: nDeal });

    const righeTask = (tasks ?? []).map((t: any) => `• [${t.priorita}] ${t.titolo} (scad. ${t.scadenza})`).join('\n');
    const righeDeal = (deals ?? [])
      .map((d: any) => `• ${d.places?.nome ?? 'Trattativa'} — ${d.linea ?? ''} (scad. ${d.scadenza})${d.next_action ? ` → ${d.next_action}` : ''}`)
      .join('\n');
    const corpo =
      `Ciao ${profilo.nome ?? ''},\n\nil tuo riepilogo Deluxy Scout di oggi:\n\n` +
      (nTask ? `TASK IN SCADENZA (${nTask})\n${righeTask}\n\n` : '') +
      (nDeal ? `FOLLOW-UP TRATTATIVE (${nDeal})\n${righeDeal}\n\n` : '') +
      `Apri l'app: https://deluxy-scout.vercel.app\n`;

    const esito = await inviaMail(cred, { to: profilo.email, subject: `Promemoria Scout: ${nTask + nDeal} cose in scadenza`, content: corpo });
    if (!esito.ok) return json({ sent: false, error: esito.errore }, 502);

    return json({ sent: true, to: profilo.email, task: nTask, followup: nDeal });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
