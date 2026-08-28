// Edge Function `transactions-esito` (Deno): il WEBHOOK degli esiti da Deluxy
// Transactions (28/08/2026). Va deployata con `--no-verify-jwt`: chi chiama
// non è un utente Scout, è Transactions — e la sua identità la prova la FIRMA
// HMAC, verificata fail-closed sul corpo grezzo prima di leggerne il
// contenuto (finestra ±5 minuti; i ritentativi arrivano rifirmati freschi).
//
// Aggiorna lo specchio su `richieste_pagamento_fornitore`
// (riferimentoEsterno = `scout-<id>`): stato, come è uscito il denaro
// (`pagatoCon`), quando. IDEMPOTENTE: la stessa notifica due volte scrive gli
// stessi valori. Gli allegati-prova restano in Transactions e si aprono da là.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sha256Hex(dati: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dati));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(segreto: string, messaggio: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', chiave, new TextEncoder().encode(messaggio));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
  try {
    const segreto = (await chiaveHub('TRANSACTIONS_HMAC_SECRET'))?.trim();
    if (!segreto) return json({ error: 'Canale non configurato.' }, 503); // fail-closed

    const corpo = await req.text();
    const timestamp = (req.headers.get('x-deluxy-timestamp') ?? '').trim();
    const firma = (req.headers.get('x-deluxy-signature') ?? '').replace(/^sha256=/i, '').trim();
    const ts = Number(timestamp);
    if (!timestamp || !firma || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) {
      return json({ error: 'Firma non valida.' }, 401);
    }
    const attesa = await hmacHex(segreto, `${timestamp}\n${await sha256Hex(corpo)}`);
    // Confronto a lunghezza e contenuto: su una firma esadecimale il timing
    // leak è teorico, ma il confronto secco resta la forma giusta.
    if (attesa.length !== firma.length) return json({ error: 'Firma non valida.' }, 401);
    let diff = 0;
    for (let i = 0; i < attesa.length; i++) diff |= attesa.charCodeAt(i) ^ firma.charCodeAt(i);
    if (diff !== 0) return json({ error: 'Firma non valida.' }, 401);

    const payload = JSON.parse(corpo) as {
      riferimento?: string;
      riferimentoEsterno?: string;
      stato?: string;
      pagatoCon?: string | null;
      pagataIl?: string | null;
      motivo?: string | null;
    };
    const rifEsterno = payload.riferimentoEsterno ?? '';
    if (!rifEsterno.startsWith('scout-')) return json({ ok: true, nota: 'Riferimento non nostro: ignorata.' });
    const id = rifEsterno.slice('scout-'.length);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: riga } = await admin.from('richieste_pagamento_fornitore').select('id').eq('id', id).maybeSingle();
    if (!riga) return json({ ok: true, nota: 'Richiesta non trovata: ignorata.' });

    await admin
      .from('richieste_pagamento_fornitore')
      .update({
        trx_riferimento: payload.riferimento ?? undefined,
        trx_stato: payload.stato ?? '',
        trx_pagato_con: payload.pagatoCon ?? '',
        trx_pagata_il: payload.pagataIl ?? null,
        ...(payload.motivo ? { esito_invio: `Transactions: ${payload.motivo}` } : {}),
        aggiornata_il: new Date().toISOString(),
      })
      .eq('id', id);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'errore' }, 500);
  }
});
