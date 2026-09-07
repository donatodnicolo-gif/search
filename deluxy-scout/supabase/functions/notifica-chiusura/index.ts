// Edge Function `notifica-chiusura` (Deno): quando una trattativa viene CHIUSA
// (vinta o persa) invia via email i motivi indicati dal commerciale al
// responsabile (admin) e al venditore della trattativa. Serve a capire
// perché si vince e perché si perde.
//
// Usa gli STESSI secret SMTP_* del progetto già usati da `notifica-task` e
// `promemoria` (le cui email arrivano — verificato dall'utente, 7 set 2026):
// i secret Supabase sono condivisi da tutte le Edge Function, quindi non serve
// configurare nulla di nuovo, basta il deploy. Se per qualche motivo mancassero,
// risponde { sent: false, reason: 'smtp_non_configurato' } senza errore e il
// motivo resta comunque salvato sulla trattativa (colonna `motivo_chiusura`).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ADMIN_EMAIL = 'nicolo.donato@deluxy.it';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const LABEL_FASE: Record<string, string> = { closedwon: 'VINTA', closedlost: 'PERSA' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const { deal_key } = await req.json();
    if (!deal_key) return json({ error: 'deal_key mancante' }, 400);

    // La trattativa può essere Scout (uuid) o solo HubSpot (`hs_<id>`).
    let negozio = '—';
    let fase = '';
    let motivo = '';
    let valore: number | null = null;
    let ownerId: string | null = null;
    if (String(deal_key).startsWith('hs_')) {
      const { data: d } = await admin
        .from('hubspot_deals')
        .select('nome, fase, valore, motivo_chiusura')
        .eq('hubspot_id', String(deal_key).slice(3))
        .single();
      if (!d) return json({ error: 'Trattativa non trovata' }, 404);
      negozio = d.nome ?? negozio;
      fase = d.fase ?? '';
      motivo = d.motivo_chiusura ?? '';
      valore = d.valore != null ? Number(d.valore) : null;
    } else {
      const { data: d } = await admin
        .from('deals')
        .select('fase, valore_atteso, motivo_chiusura, owner, linea, places(nome)')
        .eq('id', deal_key)
        .single();
      if (!d) return json({ error: 'Trattativa non trovata' }, 404);
      negozio = (d as any).places?.nome ?? negozio;
      fase = d.fase ?? '';
      motivo = d.motivo_chiusura ?? '';
      valore = d.valore_atteso != null ? Number(d.valore_atteso) : null;
      ownerId = d.owner ?? null;
    }
    if (!LABEL_FASE[fase]) return json({ sent: false, reason: 'trattativa_non_chiusa' });

    // Destinatari: admin + venditore (se diverso) + chi ha chiuso (se diverso).
    const ids = [ownerId, userData.user.id].filter(Boolean) as string[];
    const { data: profili } = await admin.from('profiles').select('id, email, nome').in('id', ids);
    const destinatari = new Set<string>([ADMIN_EMAIL]);
    for (const p of profili ?? []) if (p.email) destinatari.add(p.email);
    const chiusoDa = (profili ?? []).find((p: any) => p.id === userData.user.id);
    const nomeChiusoDa = chiusoDa?.nome || chiusoDa?.email?.split('@')[0] || 'Un commerciale';

    const host = Deno.env.get('SMTP_HOST');
    const user = Deno.env.get('SMTP_USER');
    const pass = Deno.env.get('SMTP_PASS');
    if (!host || !user || !pass) {
      return json({ sent: false, reason: 'smtp_non_configurato', to: [...destinatari] });
    }
    const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const from = Deno.env.get('SMTP_FROM') ?? user;

    const oggetto = `Trattativa ${LABEL_FASE[fase]}: ${negozio}`;
    const corpo =
      `${nomeChiusoDa} ha chiuso la trattativa con ${negozio} come ${LABEL_FASE[fase]}.\n\n` +
      (valore != null ? `• Valore: € ${valore.toLocaleString('it-IT')}\n` : '') +
      `• Motivo:\n${motivo || '(non indicato)'}\n\n` +
      `Apri le trattative: https://deluxy-scout.vercel.app/trattative\n`;

    const client = new SMTPClient({
      connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
    });
    await client.send({ from, to: [...destinatari], subject: oggetto, content: corpo });
    await client.close();

    return json({ sent: true, to: [...destinatari] });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
