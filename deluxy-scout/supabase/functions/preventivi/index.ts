// Edge Function `preventivi` (Deno): i PREVENTIVI DEI FORNITORI, richiamabili
// dalle altre app. Nasce per AI Mail: il fornitore risponde alla mail con un
// prezzo, e quel numero deve poter entrare in Scout senza che qualcuno lo
// ricopi a mano (e senza che si perda da dove viene).
//
// Auth: header `x-api-key` (la stessa chiave di `lead`/`trattativa`, vedi
// `_shared/chiaveIn.ts`). Deploy con --no-verify-jwt: l'auth è la chiave.
//
// ⚠️ IL CONTROLLO DELLA CHIAVE STA PRIMA DELLO SMISTAMENTO DELLE AZIONI, e non
// dentro i rami. In una funzione pubblicata `--no-verify-jwt` il primo `return`
// di un ramo è già la porta d'ingresso: è così che `hubspot-match` è rimasta
// aperta a chiunque. Aggiungendo un'azione qui, non spostarla sopra l'auth.
//
// POST /functions/v1/preventivi
//   { azione: 'lavori' }
//     → 200 { ok, lavori: [{ id, titolo, cliente, linea, serveEntro, preventivi, minimo }] }
//     I lavori APERTI, cioè quelli per cui un prezzo serve ancora.
//
//   { azione: 'registra', lavoro | lavoroId, fornitore, importo?, tempi?,
//     note?, fornitoreEmail?, mailRef? }
//     → 201 { ok, id, lavoro, messaggio }
//     → 404 { error, lavori: [...] }  nessun lavoro aperto con quel nome
//     → 409 { error, lavori: [...] }  più di uno: sceglie una persona, non noi
import { chiaveIngressoValida, clientAdmin } from '../_shared/chiaveIn.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const testo = (v: unknown, max = 500): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

/** La forma con cui un lavoro esce da qui: poca roba, ma quella che fa scegliere. */
function riassumi(l: any): Record<string, unknown> {
  const prev = (l.preventivi ?? []) as { importo: number | null; stato: string }[];
  // Il minimo si conta SOLO sui preventivi arrivati e non scartati: uno senza
  // importo non è «gratis», è ancora in attesa. Stessa regola di `confronto()`
  // in lib/preventivi.ts — se cambia là, va cambiata qui.
  const importi = prev.filter((p) => p.stato !== 'scartato' && p.importo != null).map((p) => Number(p.importo));
  return {
    id: l.id,
    titolo: l.titolo,
    cliente: l.places?.nome ?? null,
    linea: l.linea ?? null,
    serveEntro: l.serve_entro ?? null,
    preventivi: prev.length,
    minimo: importi.length ? Math.min(...importi) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = clientAdmin();

    // ── L'AUTH, PRIMA DI TUTTO IL RESTO ──────────────────────────────────────
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const auth = await chiaveIngressoValida(key, admin);
    if (!auth.ok) return json({ error: auth.motivo }, 401);

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const azione = typeof body.azione === 'string' ? body.azione : 'lavori';

    // I lavori aperti servono a tutte e due le azioni: alla prima come
    // risposta, alla seconda per trovare quello giusto e — se non lo trova —
    // per dire QUALI c'erano. Un «non trovato» senza l'elenco costringe chi
    // chiama a indovinare il nome esatto.
    const { data: lavori, error: errLavori } = await admin
      .from('lavori')
      .select('id, titolo, linea, serve_entro, places(nome), preventivi(importo, stato)')
      .eq('stato', 'aperto')
      .order('created_at', { ascending: false });
    if (errLavori) return json({ error: errLavori.message }, 500);
    const aperti = (lavori ?? []) as any[];

    if (azione === 'lavori') {
      return json({ ok: true, lavori: aperti.map(riassumi) });
    }

    if (azione !== 'registra') {
      return json({ error: 'Azione «' + azione + '» sconosciuta. Valide: lavori, registra.' }, 400);
    }

    // ── REGISTRA UN PREVENTIVO ───────────────────────────────────────────────
    const fornitore = testo(body.fornitore, 200);
    if (!fornitore) return json({ error: 'Manca `fornitore`: chi ha fatto il prezzo.' }, 400);

    const lavoroId = testo(body.lavoroId, 60);
    const nomeLavoro = testo(body.lavoro, 300);

    let scelto: any;
    if (lavoroId) {
      scelto = aperti.find((l) => l.id === lavoroId);
      if (!scelto) return json({ error: 'Nessun lavoro aperto con quell’id.', lavori: aperti.map(riassumi) }, 404);
    } else {
      if (!nomeLavoro) {
        return json({ error: 'Manca `lavoro` (o `lavoroId`): per quale lavoro è il prezzo.', lavori: aperti.map(riassumi) }, 400);
      }
      const cercato = nomeLavoro.toLowerCase();
      // Prima il nome esatto, poi «uno contiene l'altro»: il titolo scritto in
      // una mail quasi mai combacia con quello dell'app.
      let candidati = aperti.filter((l) => String(l.titolo).toLowerCase() === cercato);
      if (!candidati.length) {
        candidati = aperti.filter((l) => {
          const t = String(l.titolo).toLowerCase();
          return t.includes(cercato) || cercato.includes(t);
        });
      }
      if (!candidati.length) {
        return json({ error: 'Nessun lavoro aperto che assomigli a «' + nomeLavoro + '».', lavori: aperti.map(riassumi) }, 404);
      }
      // ⚠️ Più di un candidato NON si risolve tirando a indovinare: si
      // restituiscono e sceglie chi chiama. Attaccare il prezzo di un fornitore
      // al lavoro sbagliato è un errore che poi nessuno va a cercare.
      if (candidati.length > 1) {
        return json(
          {
            error: '«' + nomeLavoro + '» corrisponde a ' + candidati.length + ' lavori aperti: serve lavoroId.',
            lavori: candidati.map(riassumi),
          },
          409,
        );
      }
      scelto = candidati[0];
    }

    const grezzo = body.importo;
    const importo = typeof grezzo === 'number' && Number.isFinite(grezzo) ? grezzo : null;
    if (grezzo != null && importo == null) {
      return json({ error: '`importo` deve essere un numero (euro, senza simboli) oppure assente.' }, 400);
    }

    const { data, error } = await admin
      .from('preventivi')
      .insert({
        lavoro_id: scelto.id,
        fornitore,
        importo,
        tempi: testo(body.tempi, 200),
        note: testo(body.note, 1000),
        fornitore_email: testo(body.fornitoreEmail, 200),
        mail_ref: testo(body.mailRef, 100),
        origine: 'mail',
        // Col prezzo dentro, il preventivo è arrivato; senza, lo si sta ancora
        // aspettando. Lo stato si deduce, non lo si chiede a chi chiama —
        // stessa regola di `aggiungiPreventivo` in lib/preventivi.ts.
        stato: importo != null ? 'ricevuto' : 'richiesto',
      })
      .select('id')
      .single();
    if (error) return json({ error: error.message }, 500);

    return json(
      {
        ok: true,
        id: data.id,
        lavoro: { id: scelto.id, titolo: scelto.titolo },
        messaggio:
          importo != null
            ? 'Preventivo di ' + fornitore + ' (€ ' + importo + ') registrato su «' + scelto.titolo + '».'
            : fornitore + ' segnato in attesa di prezzo su «' + scelto.titolo + '».',
      },
      201,
    );
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
