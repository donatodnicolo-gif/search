// Edge Function `proforma` (Deno): proxy verso Deluxy Partner (FINANCE).
// Custodisce la chiave `PARTNER_API_KEY` (dal vault hub, fallback env) e inoltra:
//   { azione: 'crea',      partner, oggetto?, scadenza?, note?, righe: [...] } → POST  /api/proforma
//   { azione: 'conferma',  numero | id, fatturaNumero? }                       → PATCH /api/proforma
//   { azione: 'riepilogo', partner }                                           → GET   /api/riepilogo-finanziario
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const BASE = Deno.env.get('PARTNER_URL') ?? 'https://deluxy-partner.vercel.app';

// NB: il client web invia anche `apikey` (e supabase-js aggiunge `x-client-info`):
// se non sono elencati qui il preflight fallisce e il browser dà "Failed to fetch".
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/**
 * LA CARTA INTESTATA LA SCEGLIE IL SERVER, non chi chiama (27/08/2026,
 * revisione di sicurezza).
 *
 * ⚠️ Prima arrivava dal client — `intestazione: body.intestazione` — e veniva
 * inoltrata a FINANCE alla lettera, che la CONGELA sul documento. Voleva dire
 * che un venditore poteva emettere una pro-forma con l'IBAN che preferiva:
 * non serviva nemmeno toccare la tabella dei template. Il documento esce a nome
 * dell'azienda, quindi l'azienda decide con quali coordinate esce.
 *
 * Si legge col service_role perché la tabella è di lettura aperta ma non
 * vogliamo dipendere dalla sessione di chi chiama: la carta intestata è la
 * stessa per tutti.
 */
async function intestazioneDelBrand(admin: any, brand: string | null | undefined) {
  const q = admin
    .from('template_documento')
    .select('nome, brand, logo_data_url, ragione_sociale, indirizzo, cap, citta, provincia, piva, codice_fiscale, rea, sdi, pec, telefono, email, sito, banca, iban, bic, intestatario_conto, note_piede, predefinito')
    .limit(1);
  // Prima quella del brand chiesto; se non c'è, la predefinita. Se non c'è
  // nemmeno quella, si va senza: di là FINANCE usa la sua.
  const { data: perBrand } = brand ? await q.eq('brand', brand) : { data: null };
  let riga = perBrand?.[0];
  if (!riga) {
    const { data: pre } = await admin
      .from('template_documento')
      .select('nome, brand, logo_data_url, ragione_sociale, indirizzo, cap, citta, provincia, piva, codice_fiscale, rea, sdi, pec, telefono, email, sito, banca, iban, bic, intestatario_conto, note_piede, predefinito')
      .eq('predefinito', true)
      .limit(1);
    riga = pre?.[0];
  }
  if (!riga) return undefined;
  // I nomi che FINANCE si aspetta (camelCase): la traduzione sta QUI, in un
  // posto solo, e non nel client.
  return {
    nome: riga.nome ?? null,
    brand: riga.brand ?? null,
    logoDataUrl: riga.logo_data_url ?? null,
    ragioneSociale: riga.ragione_sociale ?? null,
    indirizzo: riga.indirizzo ?? null,
    cap: riga.cap ?? null,
    citta: riga.citta ?? null,
    provincia: riga.provincia ?? null,
    piva: riga.piva ?? null,
    codiceFiscale: riga.codice_fiscale ?? null,
    rea: riga.rea ?? null,
    sdi: riga.sdi ?? null,
    pec: riga.pec ?? null,
    telefono: riga.telefono ?? null,
    email: riga.email ?? null,
    sito: riga.sito ?? null,
    banca: riga.banca ?? null,
    iban: riga.iban ?? null,
    bic: riga.bic ?? null,
    intestatarioConto: riga.intestatario_conto ?? null,
    notePiede: riga.note_piede ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = await chiaveHub('PARTNER_API_KEY'); // vault hub, fallback env
    if (!key) return json({ error: 'PARTNER_API_KEY non configurata' }, 500);

    // Autenticazione: chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    const headers = {
      'X-API-Key': key,
      'X-App': 'deluxy-scout',
      'Content-Type': 'application/json',
    };

    let res: Response;
    if (body.azione === 'crea') {
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          partner: body.partner,
          // ⭐ 26/08/2026 — i documenti di FINANCE sono DUE: `preventivo`
          // (l'offerta che il cliente accetta) e `proforma` (la richiesta di
          // pagamento). Senza `tipo` si crea una pro-forma, come sempre.
          tipo: body.tipo === 'preventivo' ? 'preventivo' : undefined,
          oggetto: body.oggetto ?? undefined,
          scadenza: body.scadenza ?? undefined,
          validoFino: body.validoFino ?? undefined,
          note: body.note ?? undefined,
          // ⭐ 27/08/2026 — con quale INTESTAZIONE: FINANCE tiene un template
          // per brand (logo, dati societari, coordinate di pagamento). Si passa
          // il brand per nome; senza, di là si usa il predefinito.
          brand: body.brand ?? undefined,
          // ⚠️ L'intestazione la possiede Scout e la RISOLVE QUI, dal
          // template del brand. Quella eventualmente mandata dal client si
          // IGNORA: di là viene congelata sul documento, quindi accettarla
          // dal chiamante voleva dire lasciargli scegliere l'IBAN su cui il
          // cliente bonifica.
          intestazione: await intestazioneDelBrand(admin, body.brand),
          righe: body.righe,
        }),
      });
    } else if (body.azione === 'conferma') {
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: body.id ?? undefined,
          numero: body.numero ?? undefined,
          fatturaNumero: body.fatturaNumero ?? undefined,
        }),
      });
    } else if (body.azione === 'esito_preventivo') {
      // L'offerta la chiude il CLIENTE: accettata o rifiutata. È l'unico
      // passaggio che Scout può fare su un preventivo — l'invio e l'annullo
      // restano azioni di FINANCE, che possiede il documento.
      const stato = body.stato === 'rifiutata' ? 'rifiutata' : 'accettata';
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: body.id ?? undefined,
          numero: body.numero ?? undefined,
          tipo: 'preventivo',
          stato,
        }),
      });
    } else if (body.azione === 'riepilogo') {
      // Riepilogo finanziario del cliente (fatturato + andamento). L'app gestisce
      // con grazia se l'endpoint non esiste ancora su Partner.
      const p = new URLSearchParams({ partner: String(body.partner ?? '') });
      res = await fetch(`${BASE}/api/riepilogo-finanziario?${p.toString()}`, { headers });
    } else if (body.azione === 'cerca_fatture') {
      // ⭐ 27/08/2026 — CERCA LE FATTURE per ragione sociale e importo.
      //
      // Il numero, quando si chiude un ordine, quasi nessuno ce l'ha: si sa
      // chi è il cliente e quanto vale. Questa cerca su quello, e torna un
      // elenco da GUARDARE — l'aggancio lo decide una persona, perché il nome
      // può somigliare a quello di un altro cliente.
      const p = new URLSearchParams();
      if (body.cliente) p.set('cliente', String(body.cliente));
      if (body.numero) p.set('numero', String(body.numero));
      // fattura (default) o ricevuta: su Fatture in Cloud sono due elenchi
      // diversi, e cercare in quello sbagliato non trova niente.
      if (body.tipo) p.set('tipo', String(body.tipo));
      if (body.importo != null) p.set('importo', String(body.importo));
      if (body.anno) p.set('anno', String(body.anno));
      res = await fetch(`${BASE}/api/v1/fatture-cerca?${p.toString()}`, { headers });
    } else if (body.azione === 'cerca_fattura') {
      // ⭐ 27/08/2026 — CERCA UNA FATTURA GIÀ EMESSA, per numero.
      //
      // Serve alla chiusura di un ordine: prima di emetterne una nuova si
      // guarda se quella che il cliente ha già ricevuto esiste davvero di là.
      // ⚠️ Si VERIFICA, non si crede: agganciare un numero scritto a mano
      // senza controllarlo vorrebbe dire dichiarare fatturato un ordine con
      // un riferimento che non esiste — e nessuno se ne accorgerebbe finché
      // qualcuno non va a cercare quella fattura.
      const p = new URLSearchParams({ numero: String(body.numero ?? '') });
      res = await fetch(`${BASE}/api/fatture?${p.toString()}`, { headers });
    } else {
      return json({ error: `Azione sconosciuta: ${body.azione}` }, 400);
    }

    // Inoltra la risposta di Partner così com'è (incl. errore/candidati sui 404).
    const txt = await res.text();
    return new Response(txt, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
