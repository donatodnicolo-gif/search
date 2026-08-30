// Edge Function `ordini-mese` (Deno): gli ORDINI CHIUSI di un mese, aggregati.
//
// Nasce per Deluxy Budgets (30/08/2026, richiesta dell'utente): sul mese in
// corso i ricavi commerciali del consuntivo arrivano solo dalle fatture di
// Finance, che per costruzione sono indietro — gli ordini che Scout ha già
// CHIUSO nel mese sono il numero vivo. Qui si aggregano e basta: valore per
// linea e totale, niente clienti, niente margini, niente elenco.
//
// Auth: come `linee` — header `x-api-key`, valgono LINEE_API_KEY (secret) e la
// chiave d'ingresso di Scout (`chiavi_app._ingresso`). Sola lettura.
//
// Parametri (query string o body JSON): `anno` e `mese` (1..12), obbligatori.
//
// Che cos'è «chiuso»: `chiuso_il` dentro il mese e stato ≠ annullato. È la
// definizione di Scout (fornitura registrata e fattura emessa o agganciata),
// per questo la risposta dichiara l'avvertenza: un ordine chiuso HA già una
// fattura, quindi quando Finance la sincronizza lo stesso valore compare anche
// lì — chi mostra questi numeri accanto a Finance NON deve sommarli.
//
// Risposta: { ok, anno, mese, chiusi: { n, valore, senzaValore,
//             perLinea: [{ linea, n, valore }] }, avvertenza }
import { chiaveIngressoValida, clientAdmin, uguali } from '../_shared/chiaveIn.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const atteso = Deno.env.get('LINEE_API_KEY');
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const colSecret = Boolean(atteso) && uguali(key ?? '', atteso!);
    const colIngresso = colSecret ? false : (await chiaveIngressoValida(key, clientAdmin())).ok;
    if (!colSecret && !colIngresso) return json({ error: 'Chiave non valida' }, 401);

    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const anno = Number(url.searchParams.get('anno') ?? body.anno);
    const mese = Number(url.searchParams.get('mese') ?? body.mese);
    if (!Number.isInteger(anno) || anno < 2020 || anno > 2100 || !Number.isInteger(mese) || mese < 1 || mese > 12) {
      return json({ error: 'Servono anno e mese (1..12)' }, 400);
    }

    // Il mese in UTC, estremo destro esclusivo: il 31 alle 23:59 sta dentro.
    const dal = new Date(Date.UTC(anno, mese - 1, 1)).toISOString();
    const al = new Date(Date.UTC(anno, mese, 1)).toISOString();

    const admin = clientAdmin();
    const { data, error } = await admin
      .from('ordini')
      .select('valore, linea, stato, chiuso_il')
      .gte('chiuso_il', dal)
      .lt('chiuso_il', al)
      .neq('stato', 'annullato');
    if (error) return json({ error: error.message }, 500);

    const perLinea = new Map<string, { n: number; valore: number }>();
    let n = 0, valore = 0, senzaValore = 0;
    for (const o of data ?? []) {
      n++;
      const v = typeof o.valore === 'number' ? o.valore : 0;
      if (v === 0) senzaValore++;
      valore += v;
      const l = (o.linea ?? 'Senza linea').trim() || 'Senza linea';
      const g = perLinea.get(l) ?? { n: 0, valore: 0 };
      g.n++; g.valore += v; perLinea.set(l, g);
    }

    return json({
      ok: true,
      anno,
      mese,
      chiusi: {
        n,
        valore,
        // Gli ordini chiusi a valore zero si contano e si dicono: un totale che
        // li ingoia in silenzio sembra più piccolo del lavoro fatto.
        senzaValore,
        perLinea: [...perLinea]
          .map(([linea, g]) => ({ linea, n: g.n, valore: g.valore }))
          .sort((a, b) => b.valore - a.valore),
      },
      avvertenza:
        'Un ordine chiuso ha già una fattura: quando Finance la sincronizza lo stesso valore compare anche lì. Non sommare questi numeri a quelli di Finance.',
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Errore' }, 500);
  }
});
