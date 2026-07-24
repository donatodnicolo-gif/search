// Edge Function `smtp-config` (Deno): il venditore salva la PROPRIA casella
// email (Register.it) da cui l'app invierà per suo conto. La password entra qui,
// viene cifrata e salvata in `smtp_account` (RLS solo service_role): non esce mai
// più verso il client. Azioni:
//   { azione: 'stato' }                          → { configurato, utente?, verificato_il? }  (MAI la password)
//   { azione: 'salva', host, porta, utente, password, mittente? } → cifra e salva
//   { azione: 'verifica' }                        → prova una connessione SMTP reale
//   { azione: 'rimuovi' }                         → cancella la casella
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { cifra, credenzialiPerUtente, inviaMail } from '../_shared/smtp.ts';

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

    const body = await req.json().catch(() => ({}));

    if (body.azione === 'stato') {
      const { data } = await admin.from('smtp_account').select('utente, verificato_il').eq('owner', uid).maybeSingle();
      return json({ configurato: Boolean(data), utente: data?.utente ?? null, verificato_il: data?.verificato_il ?? null });
    }

    if (body.azione === 'salva') {
      const host = String(body.host ?? '').trim();
      const utente = String(body.utente ?? '').trim();
      const password = String(body.password ?? '');
      const porta = Number(body.porta ?? 465);
      const mittente = String(body.mittente ?? '').trim() || utente;
      if (!host || !utente || !password) return json({ error: 'host, utente e password sono obbligatori' }, 400);
      await admin.from('smtp_account').upsert({
        owner: uid,
        host,
        porta,
        utente,
        password_cifrata: await cifra(password),
        mittente,
        verificato_il: null,
        updated_at: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    if (body.azione === 'verifica') {
      const cred = await credenzialiPerUtente(admin, uid);
      if (!cred) return json({ ok: false, reason: 'non_configurato' });
      // Invio di prova all'indirizzo stesso dell'utente: conferma auth + recapito.
      const esito = await inviaMail(cred, {
        to: cred.user,
        subject: 'Deluxy Scout — email collegata',
        content: 'La tua casella è collegata a Deluxy Scout: le notifiche e i promemoria partiranno da qui.',
      });
      if (esito.ok) {
        const patch: Record<string, unknown> = { verificato_il: new Date().toISOString() };
        // Se ha funzionato un host diverso (fallback su Aruba), lo salviamo:
        // le prossime volte parte diretto senza ritentare.
        if (esito.hostUsato && esito.hostUsato !== cred.host) patch.host = esito.hostUsato;
        await admin.from('smtp_account').update(patch).eq('owner', uid);
        return json({ ok: true, inviata_a: cred.user, host: esito.hostUsato });
      }
      return json({ ok: false, reason: 'invio_fallito', dettaglio: esito.errore });
    }

    if (body.azione === 'rimuovi') {
      await admin.from('smtp_account').delete().eq('owner', uid);
      return json({ ok: true });
    }

    return json({ error: `Azione sconosciuta: ${body.azione}` }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
