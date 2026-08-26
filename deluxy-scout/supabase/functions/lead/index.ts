// Edge Function `lead` (Deno): intake dei LEAD WEB da fuori (form del sito,
// AI Mail, automazioni). Il lead entra in `leads` e — dal 25/08/2026, richiesta
// utente — la TRATTATIVA nasce da sola (`_shared/autoqualifica.ts`): sul
// contatto di rubrica se chi scrive è già noto, altrimenti creando negozio e
// contatto dai dati ricevuti. Se l'auto-qualifica fallisce resta «nuovo» in
// coda e lo qualifica una persona, come prima.
//
// Auth: header `x-api-key: <COMMERCIALE_API_KEY>` (stessa chiave dell'endpoint
// `trattativa`). Deploy con --no-verify-jwt (l'auth è la chiave, non un JWT).
//
// POST /functions/v1/lead
//   { nome, contatto?, fonte?, messaggio? }   fonte: sito|mail|social|passaparola|altro
//   → 201 { ok, id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveIngressoValida, clientAdmin } from '../_shared/chiaveIn.ts';
import { autoQualificaLead } from '../_shared/autoqualifica.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const FONTI = new Set(['sito', 'mail', 'social', 'passaparola', 'altro']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // La chiave d'ingresso: quella generata dall'app (Profilo → Impostazioni)
    // oppure il secret storico. Vedi `_shared/chiaveIn.ts`.
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const auth = await chiaveIngressoValida(key, clientAdmin());
    if (!auth.ok) return json({ error: auth.motivo }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
    if (!nome) return json({ error: 'Manca il campo `nome` (chi ci ha contattato).' }, 400);

    const contatto = typeof body.contatto === 'string' && body.contatto.trim() ? body.contatto.trim() : null;
    const fonte = typeof body.fonte === 'string' && FONTI.has(body.fonte) ? body.fonte : 'sito';
    const messaggio = typeof body.messaggio === 'string' && body.messaggio.trim() ? body.messaggio.trim().slice(0, 2000) : null;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Anti-doppione morbido: stesso nome+contatto ancora "nuovo" → non duplicare.
    if (contatto) {
      const { data: doppio } = await admin
        .from('leads')
        .select('id')
        .eq('stato', 'nuovo')
        .ilike('nome', nome)
        .ilike('contatto', contatto)
        .limit(1);
      if (doppio && doppio.length) {
        return json({ ok: true, id: doppio[0].id, gia_presente: true, messaggio: 'Lead già in coda.' });
      }
    }

    const { data, error } = await admin
      .from('leads')
      .insert({ nome, contatto, fonte, messaggio })
      .select('id, nome, contatto, messaggio')
      .single();
    if (error) return json({ error: error.message }, 500);

    // AUTO-QUALIFICA (25/08/2026): la trattativa nasce subito — sul contatto
    // di rubrica se chi scrive è già noto, altrimenti creando negozio e
    // contatto dai dati ricevuti. Best-effort: se fallisce, il lead resta
    // «nuovo» in coda e lo qualifica una persona.
    const q = await autoQualificaLead(admin, data as never);
    const dettaglio =
      q.esito === 'agganciato'
        ? 'Trattativa creata sul contatto già in rubrica.'
        : q.esito === 'creato'
          ? 'Trattativa creata, con negozio e contatto nuovi.'
          : 'In coda di qualificazione.';

    return json({ ok: true, id: (data as { id: string }).id, esito: q.esito, messaggio: `Lead «${nome}»: ${dettaglio}` }, 201);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
