// Edge Function `lead` (Deno): intake dei LEAD WEB da fuori (form del sito,
// AI Mail, automazioni). Il lead entra nella coda di qualificazione di Scout
// (tabella `leads`, stato "nuovo"): NON crea trattative da solo — la qualifica
// la fa una persona dalla sezione Lead web (docs/VISIONE-COMMERCIALE.md).
//
// Auth: header `x-api-key: <COMMERCIALE_API_KEY>` (stessa chiave dell'endpoint
// `trattativa`). Deploy con --no-verify-jwt (l'auth è la chiave, non un JWT).
//
// POST /functions/v1/lead
//   { nome, contatto?, fonte?, messaggio? }   fonte: sito|mail|social|passaparola|altro
//   → 201 { ok, id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const atteso = Deno.env.get('COMMERCIALE_API_KEY');
    if (!atteso) return json({ error: 'COMMERCIALE_API_KEY non configurata su Scout.' }, 500);
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (key !== atteso) return json({ error: 'Chiave API mancante o non valida (header x-api-key).' }, 401);

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
      .select('id')
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, id: data.id, messaggio: `Lead «${nome}» in coda di qualificazione.` }, 201);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
