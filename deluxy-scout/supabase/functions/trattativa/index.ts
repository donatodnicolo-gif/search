// Edge Function `trattativa` (Deno): apre una trattativa nel CRM commerciale
// (Scout) da un'altra app Deluxy. La usa AI Mail con l'azione "Apri trattativa":
// l'AI estrae i dati dalla mail, l'utente conferma, la chiamata arriva qui.
//
// Auth: header `x-api-key: <COMMERCIALE_API_KEY>` (stesso nome del secret che le
// app chiamanti usano per "Commerciale"). Server-to-server: nessun utente
// loggato, quindi si lavora con la service_role e la trattativa nasce SENZA
// owner — la si assegna poi dall'app.
//
// POST /functions/v1/trattativa
//   { azione: 'apri', negozio, linea?, valoreAtteso?, fase?, scadenza?, nextAction? }
//   → 200 { ok, id, place: { id, nome }, link }
//   → 404 { error, candidati: [{ id, nome, zona }] }  negozio non trovato/ambiguo
//
// Deploy:
//   supabase functions deploy trattativa --project-ref fdsziebgkljfsugqqbqd
//   supabase secrets set COMMERCIALE_API_KEY=... --project-ref fdsziebgkljfsugqqbqd
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('SCOUT_WEB_URL') ?? 'https://deluxy-scout.vercel.app').replace(/\/$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

// Le fasi ammesse dall'enum `dealstage_t`, più le parole che un'altra app (o
// l'AI che legge una mail) può usare al posto del codice tecnico.
const FASI = ['appointmentscheduled', 'decisionmakerboughtin', 'contractsent', 'closedwon', 'closedlost'];
const ALIAS_FASE: Record<string, string> = {
  'primo contatto': 'appointmentscheduled',
  contatto: 'appointmentscheduled',
  appuntamento: 'appointmentscheduled',
  'appuntamento fissato': 'appointmentscheduled',
  interessato: 'decisionmakerboughtin',
  'in trattativa': 'decisionmakerboughtin',
  trattativa: 'decisionmakerboughtin',
  proposta: 'contractsent',
  preventivo: 'contractsent',
  'offerta inviata': 'contractsent',
  vinta: 'closedwon',
  chiusa: 'closedwon',
  'chiusa vinta': 'closedwon',
  persa: 'closedlost',
  'chiusa persa': 'closedlost',
};

function normalizzaFase(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s) return 'appointmentscheduled';
  if (FASI.includes(s)) return s;
  return ALIAS_FASE[s] ?? 'appointmentscheduled';
}

/** Nome confrontabile: minuscole, senza accenti, punteggiatura e forme sociali. */
function normNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|societa|di|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const atteso = Deno.env.get('COMMERCIALE_API_KEY');
    if (!atteso) return json({ error: 'COMMERCIALE_API_KEY non configurata su Scout.' }, 500);
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (key !== atteso) return json({ error: 'Chiave API mancante o non valida (header x-api-key).' }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const azione = (body.azione as string) ?? 'apri';
    if (azione !== 'apri') return json({ error: `Azione sconosciuta: ${azione}` }, 400);

    const negozio = typeof body.negozio === 'string' ? body.negozio.trim() : '';
    if (!negozio) return json({ error: 'Manca il negozio della trattativa (campo `negozio`).' }, 400);

    // service_role: server-to-server, la RLS è già stata superata dalla chiave.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1. Trova il negozio per nome. Prima il match esatto normalizzato, poi
    //    "contiene": un solo candidato = si procede, più di uno = si chiede.
    const primaParola = negozio.split(/\s+/)[0] ?? negozio;
    const { data: candidati } = await admin
      .from('places')
      .select('id, nome, zona, stato')
      .or(`nome.ilike.%${negozio}%,nome.ilike.${primaParola}%`)
      .limit(25);

    const lista = candidati ?? [];
    const target = normNome(negozio);
    const esatti = lista.filter((p: any) => normNome(p.nome) === target);
    const scelto = esatti.length === 1 ? esatti[0] : lista.length === 1 ? lista[0] : null;

    if (!scelto) {
      return json(
        {
          error: lista.length
            ? `Più negozi corrispondono a «${negozio}»: apri la trattativa dall'app scegliendo quello giusto.`
            : `Nessun negozio corrispondente a «${negozio}» nel CRM commerciale.`,
          candidati: lista.slice(0, 8).map((p: any) => ({ id: p.id, nome: p.nome, zona: p.zona })),
        },
        404,
      );
    }

    // 2. Se sul negozio c'è già una trattativa aperta, non se ne crea un'altra:
    //    due trattative gemelle sullo stesso negozio sono un fastidio, non un dato.
    const { data: aperte } = await admin
      .from('deals')
      .select('id, fase')
      .eq('place_id', scelto.id)
      .not('fase', 'in', '("closedwon","closedlost")')
      .limit(1);
    if (aperte && aperte.length) {
      return json({
        ok: true,
        gia_aperta: true,
        id: aperte[0].id,
        place: { id: scelto.id, nome: scelto.nome },
        messaggio: `«${scelto.nome}» ha già una trattativa aperta.`,
        link: `${APP_URL}/(app)/attivita/${scelto.id}`,
      });
    }

    // 3. Apri la trattativa.
    const valore = typeof body.valoreAtteso === 'number' && isFinite(body.valoreAtteso) ? body.valoreAtteso : null;
    const linea = typeof body.linea === 'string' && body.linea.trim() ? body.linea.trim() : null;
    const scadenza = typeof body.scadenza === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.scadenza) ? body.scadenza : null;
    const nextAction = typeof body.nextAction === 'string' && body.nextAction.trim() ? body.nextAction.trim() : null;
    const oggetto = typeof body.oggetto === 'string' && body.oggetto.trim() ? body.oggetto.trim() : null;

    const { data: creata, error } = await admin
      .from('deals')
      .insert({
        place_id: scelto.id,
        linea,
        linee: linea ? [linea] : null,
        fase: normalizzaFase(body.fase),
        valore_atteso: valore,
        next_action: nextAction,
        scadenza,
        // Per cosa è la trattativa: se il chiamante non lo dice, la prossima
        // azione è comunque una traccia migliore di niente.
        oggetto: oggetto ?? nextAction,
        canale: 'web', // arriva da fuori (AI Mail, lead internet): canale web
        owner: null, // nessun utente dietro la chiamata: si assegna dall'app
        hubspot_deal_id: null,
      })
      .select('id')
      .single();
    if (error) return json({ error: error.message }, 500);

    // Il negozio entra fra i "da visitare" se era ancora fermo: c'è una
    // trattativa aperta sopra, non è più solo un nome sulla mappa.
    if (scelto.stato !== 'cliente') {
      await admin.from('places').update({ stato: 'da_visitare' }).eq('id', scelto.id).neq('stato', 'cliente');
    }

    return json(
      {
        ok: true,
        id: creata.id,
        place: { id: scelto.id, nome: scelto.nome },
        messaggio: `Trattativa aperta per «${scelto.nome}».`,
        link: `${APP_URL}/(app)/attivita/${scelto.id}`,
      },
      201,
    );
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
