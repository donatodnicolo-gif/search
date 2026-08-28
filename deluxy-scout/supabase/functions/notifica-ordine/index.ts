// Edge Function `notifica-ordine` (Deno): annuncia un ORDINE NUOVO a tutta la
// squadra, come fa Shopify con gli ordini del sito.
//
// Richiesta dell'utente (28/08/2026): «quando viene creato un ordine poi manda
// una mail a tutti gli account dell'app come quella degli ordini shopify
// quindi [ORDINE SCOUT] ecc».
//
// ⭐ **L'OGGETTO PORTA IL RIFERIMENTO** (`[ORDINE SCOUT] SCOUT007 · Cliente ·
// € 1.200`): è il numero che va scritto come DDT sulla consegna, e chi legge
// la mail dal telefono deve poterlo copiare senza aprirla.
//
// ⚠️ **SICUREZZA.** Chiama solo un utente Scout loggato (JWT verificato), e i
// destinatari NON arrivano dal chiamante: si leggono dai profili qui dentro.
// Se li scegliesse il client, questa funzione sarebbe un modo per spedire mail
// a chiunque con le caselle di Deluxy.
//
// ⚠️ **NON RILANCIA.** Se l'ordine ha già `annunciato_il`, risponde
// `{ sent: false, reason: 'gia_annunciato' }`: una casella che riceve due
// volte lo stesso ordine smette di fidarsi della terza.
//
// ⚠️ Se lo SMTP non è configurato la funzione è INERTE (`smtp_non_configurato`)
// e non è un errore: l'ordine è già salvato, la mail è un di più.
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

const euro = (v: unknown) =>
  v == null || v === '' ? null : `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const { ordine_id } = await req.json();
    if (!ordine_id) return json({ error: 'ordine_id mancante' }, 400);

    const { data: o } = await admin.from('ordini').select('*').eq('id', ordine_id).single();
    if (!o) return json({ error: 'Ordine non trovato' }, 404);
    if (o.annunciato_il) return json({ sent: false, reason: 'gia_annunciato' });

    // ⚠️ La prenotazione PRIMA dell'invio: due chiamate in parallelo (doppio
    // clic, due schede aperte) devono trovarne una sola libera. La `is null`
    // nella update è la condizione di corsa — chi arriva secondo aggiorna zero
    // righe e si ferma, invece di mandare la seconda copia.
    const { data: preso } = await admin
      .from('ordini')
      .update({ annunciato_il: new Date().toISOString() })
      .eq('id', ordine_id)
      .is('annunciato_il', null)
      .select('id');
    if (!preso?.length) return json({ sent: false, reason: 'gia_annunciato' });

    const { data: profili } = await admin.from('profiles').select('id, email, nome');
    const destinatari = (profili ?? []).map((p: any) => p.email).filter((e: string) => !!e && e.includes('@'));
    if (!destinatari.length) {
      await admin.from('ordini').update({ annunciato_il: null }).eq('id', ordine_id);
      return json({ sent: false, reason: 'nessun_destinatario' });
    }

    // Mittente: la casella di chi segue l'ordine, con i secret globali come
    // ripiego (stessa regola di `notifica-task`).
    const cred = await credenzialiPerUtente(admin, o.owner ?? null);
    if (!cred) {
      // ⚠️ Si RILASCIA la prenotazione: senza, l'ordine resterebbe segnato
      // «annunciato» pur non avendo mandato niente, e configurare lo SMTP dopo
      // non lo recupererebbe più.
      await admin.from('ordini').update({ annunciato_il: null }).eq('id', ordine_id);
      return json({ sent: false, reason: 'smtp_non_configurato' });
    }

    const chiSegue = (profili ?? []).find((p: any) => p.id === o.owner);
    const nomeChiSegue = chiSegue?.nome || chiSegue?.email?.split('@')[0] || null;

    const rif = o.riferimento ?? '(senza riferimento)';
    const valore = euro(o.valore);
    const oggetto = `[ORDINE SCOUT] ${rif} · ${o.cliente}${valore ? ` · ${valore}` : ''}`;

    const righe = [
      `Nuovo ordine su Deluxy Scout.`,
      ``,
      `• Riferimento: ${rif}`,
      `• Cliente: ${o.cliente}`,
      o.descrizione ? `• Cosa: ${o.descrizione}` : null,
      o.linea ? `• Linea: ${o.linea}` : null,
      valore ? `• Valore (IVA esclusa): ${valore}` : `• Valore: non ancora indicato`,
      o.canale ? `• Canale: ${o.canale}` : null,
      nomeChiSegue ? `• Seguito da: ${nomeChiSegue}` : null,
      ``,
      // ⚠️ L'istruzione operativa sta NELLA MAIL: è il momento in cui serve, e
      // chi apre la consegna non ha sotto mano né questo documento né me.
      `Se serve una consegna, apri il servizio sulla piattaforma e scrivi ${rif} nel campo DDT:`,
      `così la consegna resta legata a questo ordine.`,
      ``,
      `Aprilo qui: https://deluxy-scout.vercel.app/ordini`,
    ].filter((r) => r !== null);
    const corpo = righe.join('\n');

    // Un invio per destinatario: `inviaMail` prende un indirizzo solo, e così
    // l'esito si sa per ciascuno invece di perdersi in un tutto-o-niente.
    const esiti: { to: string; ok: boolean; errore?: string }[] = [];
    for (const to of destinatari) {
      const e = await inviaMail(cred, { to, subject: oggetto, content: corpo });
      esiti.push({ to, ok: e.ok, ...(e.ok ? {} : { errore: e.errore }) });
    }
    const riusciti = esiti.filter((e) => e.ok).length;
    if (!riusciti) {
      await admin.from('ordini').update({ annunciato_il: null }).eq('id', ordine_id);
      return json({ sent: false, esiti }, 502);
    }
    return json({ sent: true, riferimento: rif, destinatari: riusciti, esiti });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
