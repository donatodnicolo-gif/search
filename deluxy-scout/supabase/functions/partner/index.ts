// Edge Function `partner` (Deno): **il registro Anagrafiche avvisa Scout** che
// un partner è nato o è cambiato, e Scout se lo crea in casa.
//
// Il verso opposto esiste già da tempo (`sincronizzaPlaceRegistro` in Scout →
// azione `upsert_partner` del registro): questa è la metà che mancava, e senza
// la quale un'azienda creata in Anagrafiche in Scout non compariva mai —
// bisognava importarla da terminale o rifarla a mano (segnalato il 29/07/2026,
// caso «Flowers and More»).
//
// Auth: header `x-api-key: <COMMERCIALE_API_KEY>`, la stessa chiave di `lead` e
// `trattativa`. Deploy con --no-verify-jwt: l'autenticazione è la chiave.
//
// POST /functions/v1/partner
//   { anagraficheId, nome, stato?, citta?, provincia?, indirizzo?, categoria?,
//     interessi?: string[], account?, lat?, lng? }
//   → 200 { ok, id, creato: true|false }
//
// ⚠️ IDEMPOTENTE, e deve restarlo: il legame è `places.anagrafiche_id` (indice
// unico parziale). Il registro può richiamarci quante volte vuole — a ogni
// salvataggio, a ogni cambio di stato — e qui non nascono doppioni.
//
// ⚠️ Su un negozio già esistente NON si sovrascrive tutto: si aggiornano lo
// stato commerciale e i campi anagrafici, ma si lasciano stare `starred`,
// `creato_da`, la priorità e le coordinate. Quelli sono lavoro fatto in Scout
// da una persona, e il registro non ne sa niente.
import { chiaveIngressoValida, clientAdmin } from '../_shared/chiaveIn.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/**
 * Il vocabolario condiviso (deluxy-anagrafiche/src/lib/stati.ts e
 * deluxy-scout/types/index.ts). Uno stato fuori lista **non si indovina**: si
 * scarta e si lascia il negozio come sta, perché scrivere uno stato sbagliato è
 * peggio che non scriverlo.
 */
const STATI = new Set([
  'selezionato',
  'lead',
  'prospect',
  'in_trattativa',
  'attivo',
  'a_rischio',
  'non_interessato',
  'dismesso',
]);

/**
 * Il MOMENTO del contatto: nel registro si chiama `livello`, qui
 * `places.livello_contatto` — «livello» in Scout è già la scala del funnel.
 *
 * ⚠️ Fino al 31/07/2026 questi tre erano **stati**. Un registro non ancora
 * aggiornato può mandarli ancora come `stato`: in quel caso valgono come
 * momento, e lo stato commerciale diventa `lead` — che è ciò che hanno sempre
 * voluto dire.
 */
const MOMENTI = new Set(['in_contatto', 'in_attesa', 'da_ricontattare']);

/** Stato commerciale → stato di pipeline di Scout (types/index.ts). */
const PIPELINE: Record<string, string> = {
  selezionato: 'da_visitare',
  lead: 'da_visitare',
  prospect: 'da_visitare',
  in_trattativa: 'visitato',
  attivo: 'cliente',
  a_rischio: 'cliente',
  non_interessato: 'perso',
  dismesso: 'perso',
};

const testo = (v: unknown, max = 300): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = clientAdmin();
    // La chiave d'ingresso: quella generata dall'app (tabella `chiavi_app`)
    // oppure il secret storico. Vedi `_shared/chiaveIn.ts`.
    const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const auth = await chiaveIngressoValida(key, admin);
    if (!auth.ok) return json({ error: auth.motivo }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const anagraficheId = testo(body.anagraficheId, 80);
    const nome = testo(body.nome, 200);
    if (!anagraficheId) return json({ error: 'Manca `anagraficheId`: è il legame fra le due app.' }, 400);
    if (!nome) return json({ error: 'Manca `nome`.' }, 400);

    const statoRegistro = testo(body.stato, 40);
    const livelloRegistro = testo(body.livello, 40);
    // Un registro non aggiornato può mandare il momento al posto dello stato:
    // in quel caso è un lead, e il valore vecchio diventa il momento.
    const daStato = statoRegistro && MOMENTI.has(statoRegistro);
    // Uno stato che non conosciamo non viene tradotto a caso: si ignora.
    const stato = daStato ? 'lead' : statoRegistro && STATI.has(statoRegistro) ? statoRegistro : null;
    const momento = livelloRegistro && MOMENTI.has(livelloRegistro)
      ? livelloRegistro
      : daStato
        ? statoRegistro
        : null;
    const interessi = Array.isArray(body.interessi)
      ? (body.interessi as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 20)
      : null;

    const { data: gia } = await admin
      .from('places')
      .select('id')
      .eq('anagrafiche_id', anagraficheId)
      .maybeSingle();

    // Campi che il registro possiede davvero. `anagrafiche_stato` è la sua
    // parola; `stato_affiliazione` è la copia su cui lavora Scout.
    const comuni: Record<string, unknown> = {
      nome,
      indirizzo: testo(body.indirizzo),
      zona: testo(body.citta, 120),
      categoria: testo(body.categoria, 80),
      anagrafiche_account: testo(body.account, 120),
      ...(stato ? { anagrafiche_stato: stato, stato_affiliazione: stato, stato: PIPELINE[stato] } : {}),
      // Si scrive anche quando è null: togliere il momento è un'informazione
      // quanto metterlo — vuol dire che quella conversazione è chiusa.
      ...(stato || momento ? { livello_contatto: momento } : {}),
      ...(interessi?.length ? { linee_ipotizzate: interessi, linea_ipotizzata: interessi[0] } : {}),
    };

    if (gia) {
      const { error } = await admin.from('places').update(comuni).eq('id', gia.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: gia.id, creato: false });
    }

    // Le coordinate: il registro non le ha quasi mai, e `places.lat/lng` sono
    // obbligatorie. Zero significa «non posizionato»: il negozio entra in
    // lista lo stesso e sulla mappa si sistema dopo — meglio che perderlo.
    const lat = typeof body.lat === 'number' ? body.lat : 0;
    const lng = typeof body.lng === 'number' ? body.lng : 0;

    const { data, error } = await admin
      .from('places')
      .insert({
        ...comuni,
        anagrafiche_id: anagraficheId,
        lat,
        lng,
        priorita: 'P2',
        // Senza stato dal registro nasce come un nome sulla lista.
        stato: stato ? PIPELINE[stato] : 'da_visitare',
        // ⚠️ `starred: true` di proposito: `inLavorazione()` in lib/livelli.ts
        // mostra negli elenchi solo i negozi che una persona ha scelto o
        // stellato. Un partner del registro **è** una scelta, fatta in un'altra
        // app: senza la stella entrerebbe nel database e non lo vedrebbe
        // nessuno, che è esattamente il problema da cui siamo partiti.
        starred: true,
        source: 'anagrafiche',
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = l'indice unico su anagrafiche_id: due chiamate in corsa. Non è
      // un errore, è la sincronizzazione che ha funzionato due volte.
      if ((error as { code?: string }).code === '23505') {
        const { data: altrui } = await admin
          .from('places')
          .select('id')
          .eq('anagrafiche_id', anagraficheId)
          .maybeSingle();
        if (altrui) return json({ ok: true, id: altrui.id, creato: false });
      }
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, id: data.id, creato: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
