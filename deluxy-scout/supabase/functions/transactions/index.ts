// Edge Function `transactions` (Deno): il ponte di Scout verso DELUXY
// TRANSACTIONS, il collettore unico delle richieste di pagamento (28/08/2026).
//
// Tre azioni, tutte per utenti Scout loggati:
//   { azione: 'crea',   richiesta_id }  → inoltra una riga di
//       `richieste_pagamento_fornitore` come richiesta firmata HMAC
//       (idempotente su `scout-<id>`): il fioraio/catering di un evento.
//   { azione: 'stato',  richiesta_id }  → rilegge lo stato live da Transactions
//       e aggiorna lo specchio locale (il webhook è un avviso, questa è la
//       verità a richiesta).
//   { azione: 'estrai', testo | immagine: {dati,tipo} } → lettura AI della
//       richiesta del fornitore (screenshot/testo) via POST /api/v1/estrai:
//       l'AI PROPONE, il mod-97 decide, e il modulo resta modificabile.
//
// ⚠️ SEGRETI: TRANSACTIONS_API_KEY e TRANSACTIONS_HMAC_SECRET NON stanno in
// `chiavi_app` (giuria sicurezza 28/08: quella colonna è in chiaro nel DB).
// Vivono nella cassaforte del Hub o nei secrets della funzione
// (`supabase secrets set`) — la precedenza è di `chiaveHub()` SENZA la mappa
// DA_APP, quindi hub → env.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE_DEFAULT = 'https://deluxy-transactions.vercel.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const testo = (v: unknown) => String(v ?? '').trim();

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

async function chiamataFirmata(
  metodo: 'GET' | 'POST',
  percorso: string,
  corpoOggetto?: unknown,
  idempotenza?: string,
): Promise<{ stato: number; dati: Record<string, unknown> | null } | { errore: string }> {
  const apiKey = (await chiaveHub('TRANSACTIONS_API_KEY'))?.trim();
  const segreto = (await chiaveHub('TRANSACTIONS_HMAC_SECRET'))?.trim();
  if (!apiKey || !segreto) {
    return { errore: 'Transactions non configurata: mancano TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET (cassaforte Hub o secrets).' };
  }
  const base = ((await chiaveHub('TRANSACTIONS_URL'))?.trim() || BASE_DEFAULT).replace(/\/$/, '');
  const corpo = corpoOggetto ? JSON.stringify(corpoOggetto) : '';
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const daFirmare = [metodo, percorso, timestamp, nonce, await sha256Hex(corpo)].join('\n');
  const firma = await hmacHex(segreto, daFirmare);
  const res = await fetch(`${base}${percorso}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-deluxy-timestamp': timestamp,
      'x-deluxy-nonce': nonce,
      'x-deluxy-signature': `sha256=${firma}`,
      ...(idempotenza ? { 'x-idempotency-key': idempotenza } : {}),
    },
    ...(corpo ? { body: corpo } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  return { stato: res.status, dati: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const b = await req.json().catch(() => ({}));
    const azione = testo(b?.azione);

    // ── LETTURA AI ── proxy verso il motore centrale. L'esito riempie un
    // modulo che la persona rilegge: non salva mai niente da solo.
    if (azione === 'estrai') {
      const corpo: Record<string, unknown> = {};
      if (testo(b?.testo)) corpo.testo = testo(b?.testo).slice(0, 20_000);
      if (b?.immagine?.dati) corpo.immagine = { dati: String(b.immagine.dati), tipo: testo(b.immagine.tipo) || 'image/jpeg' };
      if (!corpo.testo && !corpo.immagine) return json({ error: 'Serve un testo o una foto da leggere.' }, 400);
      const r = await chiamataFirmata('POST', '/api/v1/estrai', corpo);
      if ('errore' in r) return json({ error: r.errore }, 503);
      if (r.stato !== 200) return json({ error: String(r.dati?.errore ?? `Transactions ha risposto ${r.stato}`) }, 502);
      return json(r.dati);
    }

    const richiestaId = testo(b?.richiesta_id);
    if (!richiestaId) return json({ error: 'richiesta_id mancante' }, 400);
    const { data: riga } = await admin.from('richieste_pagamento_fornitore').select('*').eq('id', richiestaId).single();
    if (!riga) return json({ error: 'Richiesta non trovata' }, 404);

    // ── INOLTRO ── idempotente su `scout-<id>`: rimandarla non la duplica.
    if (azione === 'crea') {
      const riferimentoEsterno = `scout-${riga.id}`;
      const metodo = riga.metodo || 'iban';
      const r = await chiamataFirmata(
        'POST',
        '/api/v1/richieste',
        {
          importo: Number(riga.importo).toFixed(2),
          beneficiario: String(riga.beneficiario).slice(0, 120),
          metodo,
          ...(metodo === 'iban'
            ? { iban: String(riga.iban).replace(/\s+/g, '').toUpperCase() }
            : { riferimentoPagamento: String(riga.riferimento_pagamento) }),
          causale: String(riga.causale).slice(0, 140),
          categoria: 'fornitore',
          ...(riga.note ? { note: String(riga.note) } : {}),
          riferimentoEsterno,
        },
        riferimentoEsterno,
      );
      if ('errore' in r) {
        await admin.from('richieste_pagamento_fornitore').update({ esito_invio: r.errore, aggiornata_il: new Date().toISOString() }).eq('id', riga.id);
        return json({ error: r.errore }, 503);
      }
      if (r.stato !== 200 && r.stato !== 201) {
        const msg = String(r.dati?.errore ?? `Transactions ha risposto ${r.stato}`);
        await admin.from('richieste_pagamento_fornitore').update({ esito_invio: msg, aggiornata_il: new Date().toISOString() }).eq('id', riga.id);
        return json({ error: msg }, 502);
      }
      const agg = {
        trx_riferimento: String(r.dati?.riferimento ?? ''),
        trx_stato: String(r.dati?.stato ?? 'in_attesa'),
        esito_invio: '',
        inviata_il: new Date().toISOString(),
        aggiornata_il: new Date().toISOString(),
      };
      await admin.from('richieste_pagamento_fornitore').update(agg).eq('id', riga.id);
      return json({ ok: true, ...agg });
    }

    // ── STATO LIVE ── la verità si rilegge da là (lo specchio può invecchiare).
    if (azione === 'stato') {
      const r = await chiamataFirmata('GET', `/api/v1/richieste?riferimentoEsterno=${encodeURIComponent(`scout-${riga.id}`)}`);
      if ('errore' in r) return json({ error: r.errore }, 503);
      const righe = (r.dati?.richieste ?? []) as { stato?: string; pagatoCon?: string | null; pagataIl?: string | null }[];
      const remota = Array.isArray(righe) ? righe[0] : null;
      if (!remota) return json({ ok: true, trovata: false });
      const agg = {
        trx_stato: remota.stato ?? '',
        trx_pagato_con: remota.pagatoCon ?? '',
        trx_pagata_il: remota.pagataIl ?? null,
        aggiornata_il: new Date().toISOString(),
      };
      await admin.from('richieste_pagamento_fornitore').update(agg).eq('id', riga.id);
      return json({ ok: true, trovata: true, ...agg });
    }

    return json({ error: `Azione sconosciuta: ${azione}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'errore' }, 500);
  }
});
