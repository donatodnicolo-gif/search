// Edge Function `notifica-chiusura` (Deno): quando una trattativa si chiude —
// vinta o persa — manda un'email con il MOTIVO a chi deve saperlo: il
// responsabile commerciale, il venditore che la seguiva, e chi l'ha chiusa.
//
// ⭐ 07/09/2026, richiesta dell'utente (da un altro account, rifatta qui):
// «chiusura vinta/persa con motivo obbligatorio, inviato via email a
// responsabile e venditore».
//
// Chi è il responsabile lo dice il PROFILO (`profiles.responsabile`, migr.
// 0106/0118: la bandierina assegnata dal Team), non una lista scritta qui.
// ⚠️ Finché nessun profilo ha la bandierina (al 04/09 erano 0 su 3) l'email
// va comunque all'amministratore, così la chiusura non resta senza testimoni.
//
// Sicurezza: stesso schema di `notifica-task` — JWT dell'utente obbligatorio,
// service role solo per leggere trattativa e profili, SMTP dai secret
// (`credenzialiPerUtente`: prima la casella personale di chi chiude, poi i
// secret globali SMTP_*). Senza SMTP risponde { sent: false } e non fallisce.
//
// Deploy: supabase functions deploy notifica-chiusura
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { credenzialiPerUtente, inviaMail } from '../_shared/smtp.ts';

const AMMINISTRATORI = ['nicolo.donato@deluxy.it'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const LABEL_FASE: Record<string, string> = {
  closedwon: 'VINTA',
  closedlost: 'PERSA',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);
    const chiChiude = userData.user;

    const { deal_id } = await req.json();
    if (!deal_id) return json({ error: 'deal_id mancante' }, 400);

    const { data: deal } = await admin
      .from('deals')
      .select('id, place_id, fase, valore_atteso, oggetto, linea, linee, owner, motivo_chiusura, motivo_perso, chiusa_il, places(nome)')
      .eq('id', deal_id)
      .single();
    if (!deal) return json({ error: 'Trattativa non trovata' }, 404);
    if (!LABEL_FASE[deal.fase]) return json({ sent: false, reason: 'non_chiusa' });
    if (!deal.motivo_chiusura) return json({ sent: false, reason: 'motivo_assente' });

    // I destinatari: responsabili (flag sul profilo), il venditore, chi chiude.
    // Senza responsabili, l'amministratore. Ogni indirizzo una volta sola.
    const { data: profili } = await admin.from('profiles').select('id, email, nome, responsabile');
    const tutti = (profili ?? []) as { id: string; email: string | null; nome: string | null; responsabile: boolean | null }[];
    const responsabili = tutti.filter((p) => p.responsabile && p.email).map((p) => p.email!);
    const venditore = tutti.find((p) => p.id === deal.owner);
    const destinatari = new Set<string>();
    for (const e of responsabili.length ? responsabili : AMMINISTRATORI) destinatari.add(e.toLowerCase());
    if (venditore?.email) destinatari.add(venditore.email.toLowerCase());
    if (chiChiude.email) destinatari.add(chiChiude.email.toLowerCase());
    if (!destinatari.size) return json({ sent: false, reason: 'nessun_destinatario' });

    const cred = await credenzialiPerUtente(admin, chiChiude.id);
    if (!cred) return json({ sent: false, reason: 'smtp_non_configurato' });

    const nomeChiude = tutti.find((p) => p.id === chiChiude.id)?.nome || chiChiude.email?.split('@')[0] || 'Un collega';
    const negozio = (deal as any).places?.nome ?? 'negozio';
    const esito = LABEL_FASE[deal.fase];
    const linee: string[] = Array.isArray(deal.linee) && deal.linee.length ? deal.linee : deal.linea ? [deal.linea] : [];
    const valore = deal.valore_atteso != null ? `€ ${Number(deal.valore_atteso).toLocaleString('it-IT')}` : 'valore non indicato';
    const oggetto = `Trattativa ${esito}: ${negozio}${deal.oggetto ? ` · ${deal.oggetto}` : ''}`;
    const corpo =
      `${nomeChiude} ha chiuso una trattativa su Deluxy Scout.\n\n` +
      `• Cliente: ${negozio}\n` +
      (deal.oggetto ? `• Per: ${deal.oggetto}\n` : '') +
      (linee.length ? `• Linea: ${linee.join(', ')}\n` : '') +
      `• Esito: ${esito}\n` +
      `• Valore: ${valore}\n` +
      (venditore ? `• Seguita da: ${venditore.nome || venditore.email}\n` : '') +
      (deal.fase === 'closedlost' && deal.motivo_perso ? `• Categoria: ${String(deal.motivo_perso).replace('_', ' ')}\n` : '') +
      `\nMotivo:\n${deal.motivo_chiusura}\n\n` +
      `Aprila qui: https://deluxy-scout.vercel.app/trattative?apri=${deal.id}\n`;

    const esiti: { to: string; ok: boolean; errore?: string }[] = [];
    for (const to of destinatari) {
      const r = await inviaMail(cred, { to, subject: oggetto, content: corpo });
      esiti.push({ to, ok: r.ok, errore: r.errore });
    }
    const inviate = esiti.filter((e) => e.ok).length;
    if (!inviate) return json({ sent: false, error: esiti[0]?.errore ?? 'invio fallito', esiti }, 502);
    return json({ sent: true, inviate, destinatari: [...destinatari], esiti });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
