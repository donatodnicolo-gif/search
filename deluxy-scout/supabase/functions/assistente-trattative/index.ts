// Edge Function `assistente-trattative` (Deno): riassume in linguaggio naturale
// lo stato della pipeline. Riceve dal client l'elenco (già filtrato e unificato
// dalle 3 fonti) delle trattative visibili all'utente e chiede a un modello
// Claude una sintesi + le azioni prioritarie + i punti d'attenzione.
//
// Sicurezza: chiave AI come secret, mai nel bundle. Inerte se non configurata.
// Secret: ANTHROPIC_API_KEY (da impostare). L'utente dev'essere loggato.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // veloce ed economico, adatto al riassunto

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

const eur = (n: number) => '€ ' + Math.round(n).toLocaleString('it-IT');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const aiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!aiKey) return json({ disponibile: false, reason: 'ai_non_configurata' });

    const body = await req.json().catch(() => ({}));
    const trattative: any[] = Array.isArray(body.trattative) ? body.trattative : [];
    const contesto: string = typeof body.contesto === 'string' ? body.contesto : '';
    if (!trattative.length) return json({ disponibile: true, vuoto: true });

    // Aggregati calcolati qui (deterministici): il modello li commenta, non li ricalcola.
    const val = (d: any) => Number(d.valore ?? 0);
    const aperte = trattative.filter((d) => d.fase !== 'closedwon' && d.fase !== 'closedlost');
    const vinte = trattative.filter((d) => d.fase === 'closedwon');
    const perse = trattative.filter((d) => d.fase === 'closedlost');
    const aggregati = {
      totali: trattative.length,
      aperte: aperte.length,
      valore_aperto: aperte.reduce((s, d) => s + val(d), 0),
      valore_vinto: vinte.reduce((s, d) => s + val(d), 0),
      valore_perso: perse.reduce((s, d) => s + val(d), 0),
      vinte: vinte.length,
      perse: perse.length,
      in_ritardo: trattative.filter((d) => d.scadenza && d.scadenza < new Date().toISOString().slice(0, 10) && d.fase !== 'closedwon' && d.fase !== 'closedlost').length,
    };

    const sys =
      'Sei l\'assistente commerciale di Deluxy (consegne di lusso, Milano). Ricevi un elenco di trattative ' +
      'con la loro fase, valore atteso, linea, scadenza follow-up ed eventuale ritardo. ' +
      'Rispondi SOLO con un oggetto JSON valido, in italiano, tono professionale e concreto, senza markdown. ' +
      'Schema: {"sintesi": string (2-3 frasi sullo stato generale, cita i numeri chiave), ' +
      '"azioni": string[] (3-5 azioni prioritarie concrete, la più urgente per prima, nomina i negozi), ' +
      '"attenzione": string[] (0-3 rischi o trattative ferme/in ritardo da recuperare, con il perché)}. ' +
      'Sii specifico e brevissimo per voce. Non inventare dati non presenti.';

    const userMsg = JSON.stringify({
      aggregati,
      filtro_attivo: contesto || 'nessuno',
      trattative: trattative.slice(0, 80).map((d) => ({
        negozio: d.negozio ?? null,
        fase: d.fase,
        valore: val(d) || null,
        linea: d.linea ?? null,
        scadenza: d.scadenza ?? null,
        in_ritardo: Boolean(d.scadenza && d.scadenza < new Date().toISOString().slice(0, 10) && d.fase !== 'closedwon' && d.fase !== 'closedlost'),
        prossima_azione: d.next_action ?? null,
        venditore: d.owner_nome ?? null,
      })),
    });

    const aiRes = await fetch(ANTHROPIC, {
      method: 'POST',
      headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: sys, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!aiRes.ok) return json({ error: `AI ${aiRes.status}: ${(await aiRes.text().catch(() => '')).slice(0, 200)}` }, 502);
    const aiData = await aiRes.json();
    const testo: string = aiData.content?.[0]?.text ?? '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(testo);
    } catch {
      const m = testo.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    return json({
      disponibile: true,
      aggregati: {
        ...aggregati,
        valore_aperto_txt: eur(aggregati.valore_aperto),
        valore_vinto_txt: eur(aggregati.valore_vinto),
      },
      sintesi: String(parsed.sintesi ?? '').trim(),
      azioni: Array.isArray(parsed.azioni) ? parsed.azioni.map(String).slice(0, 5) : [],
      attenzione: Array.isArray(parsed.attenzione) ? parsed.attenzione.map(String).slice(0, 3) : [],
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
