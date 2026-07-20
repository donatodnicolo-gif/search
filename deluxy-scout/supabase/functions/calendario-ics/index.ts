// Edge Function `calendario-ics` (Deno): feed iCalendar (.ics) del calendario
// personale, sottoscrivibile da Google/Apple/Outlook con un URL segreto:
//   .../functions/v1/calendario-ics?token=<cal_token>
// Espone (sola lettura) i task in scadenza e i follow-up delle trattative
// dell'utente identificato dal token. Deploy con --no-verify-jwt (i calendari
// esterni non inviano il JWT Supabase; l'accesso è governato dal token segreto).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*' };

function esc(s: string): string {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function dateCompatta(iso: string): string {
  return iso.replace(/-/g, ''); // YYYY-MM-DD -> YYYYMMDD
}
function giornoDopo(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return new Response('token mancante', { status: 400, headers: cors });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profilo } = await admin.from('profiles').select('id, nome').eq('cal_token', token).single();
    if (!profilo) return new Response('feed non trovato', { status: 404, headers: cors });

    const { data: tasks } = await admin
      .from('tasks')
      .select('id, titolo, priorita, scadenza, completata, places(nome)')
      .eq('owner', profilo.id)
      .eq('completata', false)
      .not('scadenza', 'is', null);
    const { data: deals } = await admin
      .from('deals')
      .select('id, linea, scadenza, next_action, fase, places(nome)')
      .eq('owner', profilo.id)
      .not('scadenza', 'is', null)
      .not('fase', 'in', '("closedwon","closedlost")');

    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const eventi: string[] = [];

    for (const t of tasks ?? []) {
      const nome = (t as any).places?.nome;
      eventi.push(
        [
          'BEGIN:VEVENT',
          `UID:task-${t.id}@deluxy-scout`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dateCompatta(t.scadenza)}`,
          `DTEND;VALUE=DATE:${giornoDopo(t.scadenza)}`,
          `SUMMARY:${esc(`[Task ${t.priorita}] ${t.titolo}`)}`,
          nome ? `LOCATION:${esc(nome)}` : '',
          'END:VEVENT',
        ].filter(Boolean).join('\r\n'),
      );
    }
    for (const d of deals ?? []) {
      const nome = (d as any).places?.nome ?? 'Trattativa';
      eventi.push(
        [
          'BEGIN:VEVENT',
          `UID:deal-${d.id}@deluxy-scout`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dateCompatta(d.scadenza)}`,
          `DTEND;VALUE=DATE:${giornoDopo(d.scadenza)}`,
          `SUMMARY:${esc(`Follow-up: ${nome}${d.linea ? ` (${d.linea})` : ''}`)}`,
          d.next_action ? `DESCRIPTION:${esc(d.next_action)}` : '',
          `LOCATION:${esc(nome)}`,
          'END:VEVENT',
        ].filter(Boolean).join('\r\n'),
      );
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Deluxy//Scout//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Deluxy Scout${profilo.nome ? ` — ${profilo.nome}` : ''}`,
      'X-WR-TIMEZONE:Europe/Rome',
      ...eventi,
      'END:VCALENDAR',
    ].join('\r\n');

    return new Response(ics, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="deluxy-scout.ics"',
      },
    });
  } catch (e) {
    return new Response('errore: ' + String((e as any)?.message ?? e), { status: 500, headers: cors });
  }
});
