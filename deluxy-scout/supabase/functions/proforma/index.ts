// Edge Function `proforma` (Deno): proxy verso Deluxy Partner (FINANCE).
// Custodisce la chiave `PARTNER_API_KEY` (dal vault hub, fallback env) e inoltra:
//   { azione: 'crea',      partner, oggetto?, scadenza?, note?, righe: [...] } → POST  /api/proforma
//   { azione: 'conferma',  numero | id, fatturaNumero? }                       → PATCH /api/proforma
//   { azione: 'riepilogo', partner }                                           → GET   /api/riepilogo-finanziario
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';
import { chiaveIngressoValida } from '../_shared/chiaveIn.ts';

const BASE = Deno.env.get('PARTNER_URL') ?? 'https://deluxy-partner.vercel.app';
/** Il registro delle aziende: la casa dell'anagrafica (Standard Deluxy §7). */
const ANAGRAFICHE = Deno.env.get('ANAGRAFICHE_URL') ?? 'https://deluxy-anagrafiche.vercel.app';

/**
 * Il nome ridotto all'osso per confrontarlo: minuscolo, senza punteggiatura e
 * senza la forma societaria.
 *
 * ⚠️ Serve perché «Vivo Concerti» e «Vivo Concerti SRL» sono la stessa azienda
 * e nessuno dei due è scritto sbagliato: uno è come lo chiama chi vende,
 * l'altro come è iscritto. Senza questa riduzione la creazione automatica non
 * scatterebbe mai proprio nei casi per cui esiste.
 */
function nomeRidotto(v: string): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[.,'`"]/g, ' ')
    .replace(/\b(s\s*r\s*l|srls|s\s*p\s*a|s\s*n\s*c|s\s*a\s*s|sc|ss|societa|soc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ⭐ IL CLIENTE CHE IN FINANCE NON C'È ANCORA (28/08/2026, richiesta
 * dell'utente: «se non esiste crea tu in finance usando i dati di
 * anagrafiche»).
 *
 * FINANCE risponde «Partner non trovato» e la fattura si ferma. Il dato però
 * esiste: sta nel REGISTRO, che è la casa delle anagrafiche. Qui lo si legge di
 * là e si crea la scheda in FINANCE con `POST /api/v1/partners` — la rotta che
 * esiste apposta per questo ed è idempotente.
 *
 * ⚠️ **Si crea SOLO su una corrispondenza ESATTA e UNICA.** Se nel registro ci
 * sono due «Rossi» o nessuno che si chiami davvero così, non si sceglie il più
 * somigliante: si torna il 404 col motivo. Una scheda cliente creata sull'ipotesi
 * sbagliata è una fattura intestata all'azienda sbagliata, e quella non si
 * corregge con un annulla.
 *
 * ⚠️ **Torna il NOME UFFICIALE**, che è quello con cui la scheda nasce in
 * FINANCE: riprovare col nome scritto sull'ordine («Vivo Concerti») darebbe di
 * nuovo 404 sulla scheda appena creata («Vivo Concerti SRL»).
 *
 * ⚠️ **Il referente amministrativo si copia solo se è DICHIARATO tale** nel
 * registro. Dedurlo dal primo contatto in elenco vorrebbe dire mandare i
 * solleciti a chi capita.
 */
async function creaPartnerDaRegistro(
  nomeCercato: string,
  headersFinance: Record<string, string>,
): Promise<{ nome: string } | { motivo: string }> {
  const cercato = nomeRidotto(nomeCercato);
  if (!cercato) return { motivo: 'il nome del cliente è vuoto' };

  const chiave = await chiaveHub('ANAGRAFICHE_API_KEY');
  if (!chiave) return { motivo: 'la chiave del registro Anagrafiche non è configurata' };

  let elenco: any[] = [];
  try {
    const q = new URLSearchParams({ q: nomeCercato, perPage: '10' });
    const r = await fetch(`${ANAGRAFICHE}/api/v1/partners?${q.toString()}`, {
      headers: { 'x-api-key': chiave, 'X-App': 'deluxy-scout' },
    });
    if (!r.ok) return { motivo: `il registro Anagrafiche ha risposto ${r.status}` };
    elenco = (await r.json())?.dati ?? [];
  } catch (e) {
    return { motivo: `il registro Anagrafiche non risponde (${String((e as any)?.message ?? e).slice(0, 120)})` };
  }

  const esatti = elenco.filter(
    (a) => nomeRidotto(a?.nome ?? '') === cercato || nomeRidotto(a?.ragioneSociale ?? '') === cercato,
  );
  if (!esatti.length) {
    return {
      motivo: elenco.length
        ? `nel registro non c'è un'azienda che si chiami esattamente così (le più simili: ${elenco.slice(0, 3).map((a) => a.nome).join(', ')})`
        : "non c'è nemmeno nel registro Anagrafiche",
    };
  }
  if (esatti.length > 1) {
    return { motivo: `nel registro ce ne sono ${esatti.length} con questo nome: va scelto a mano` };
  }

  const a = esatti[0];
  const amm = (a?.contatti ?? []).find((c: any) => /ammin|contab/i.test(String(c?.ruolo ?? '')));
  const res = await fetch(`${BASE}/api/v1/partners`, {
    method: 'POST',
    headers: headersFinance,
    body: JSON.stringify({
      anagraficaId: a.id,
      nome: a.nome,
      ragioneSociale: a.ragioneSociale ?? undefined,
      categoria: a.categoria ?? undefined,
      citta: a.citta ?? undefined,
      email: a.email ?? undefined,
      telefono: a.telefono ?? undefined,
      ...(amm ? { ammNome: amm.nome ?? undefined, ammEmail: amm.email ?? undefined, ammTelefono: amm.telefono ?? undefined } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { motivo: `FINANCE non ha accettato la scheda (${res.status}: ${t.slice(0, 160)})` };
  }
  return { nome: String(a.nome) };
}

// NB: il client web invia anche `apikey` (e supabase-js aggiunge `x-client-info`):
// se non sono elencati qui il preflight fallisce e il browser dà "Failed to fetch".
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-api-key, x-client-info',
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

    // AUTENTICAZIONE, in due modi.
    //
    // 1. Un UTENTE SCOUT collegato (il client web di Scout): com'è sempre stato.
    // 2. La CHIAVE D'INGRESSO delle app (header `x-api-key`): la stessa che
    //    usa già la funzione gemella `preventivi`, e con la stessa verifica.
    //
    // ⚠️ Il secondo modo serve perché anche AI Mail deve poter preparare una
    // pro-forma da una mail (chiesto il 27/08/2026): AI Mail non ha e non può
    // avere una sessione utente di Scout, ha una chiave d'app. Prima l'unica
    // strada era che chiamasse FINANCE direttamente — e così facendo la
    // pro-forma usciva con la carta intestata PREDEFINITA invece di quella del
    // brand, perché è questa funzione a sceglierla.
    // ⚠️ Quello che NON cambia: la carta intestata la decide comunque il
    // server (vedi `intestazioneDelBrand`). Chi chiama non può indicarla, con
    // la chiave o senza — è la revisione di sicurezza del 27/08/2026, e vale
    // per tutti e due i modi.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const chiaveApp = req.headers.get('x-api-key');
    let autorizzato = false;
    if (chiaveApp) {
      const esito = await chiaveIngressoValida(chiaveApp, admin);
      autorizzato = esito.ok;
      if (!autorizzato) return json({ error: esito.motivo ?? 'Chiave API non valida' }, 401);
    } else {
      const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
      const { data: userData } = await admin.auth.getUser(jwt);
      autorizzato = Boolean(userData?.user);
    }
    if (!autorizzato) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({}));
    const headers = {
      'X-API-Key': key,
      'X-App': 'deluxy-scout',
      'Content-Type': 'application/json',
    };

    let res: Response;
    if (body.azione === 'crea') {
      // ⚠️ L'intestazione si risolve UNA volta sola: serve identica anche al
      // secondo tentativo, e rifarla vorrebbe dire due letture del template
      // per un documento solo.
      const intestazione = await intestazioneDelBrand(admin, body.brand);
      /** Lo stesso documento, con il nome del cliente che si vuole provare. */
      const emetti = (partner: string) =>
        fetch(`${BASE}/api/proforma`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            partner,
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
            intestazione,
            righe: body.righe,
          }),
        });

      res = await emetti(String(body.partner ?? ''));

      /**
       * ⭐ IL CLIENTE CHE IN FINANCE NON C'È: lo si crea dal registro e si
       * riprova UNA volta (28/08/2026, richiesta dell'utente: «se non esiste
       * crea tu in finance usando i dati di anagrafiche»).
       *
       * ⚠️ Un solo ritentativo, e solo su «Partner non trovato»: se il
       * secondo tentativo fallisce si torna il suo errore. Riprovare in un
       * ciclo su una rotta che SCRIVE è il modo di emettere tre documenti
       * per una vendita sola.
       */
      if (res.status === 404) {
        const primo = await res.text();
        if (primo.includes('Partner non trovato')) {
          const esito = await creaPartnerDaRegistro(String(body.partner ?? ''), headers);
          if ('nome' in esito) {
            res = await emetti(esito.nome);
          } else {
            // ⚠️ Si dice PERCHÉ non è stato creato, e si tengono i candidati
            // che FINANCE aveva proposto: «non trovato» e basta rimanda a
            // cercare a mano senza sapere dove.
            let originale: Record<string, unknown> = {};
            try {
              originale = JSON.parse(primo);
            } catch {
              // risposta non JSON: si tiene solo il motivo
            }
            return json(
              {
                ...originale,
                errore: `Il cliente in FINANCE non c'è e non l'ho potuto creare: ${esito.motivo}.`,
              },
              404,
            );
          }
        } else {
          return new Response(primo, { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        }
      }
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
    } else if (body.azione === 'documento') {
      // ⭐ I DATI di una pro-forma/preventivo già emessi (28/08/2026, per la
      // copia stampabile dentro Scout: la pagina di FINANCE è dietro login).
      // Sola lettura: righe, totali, date — l'API li dà già con GET ?numero=.
      const p = new URLSearchParams({ numero: String(body.numero ?? '') });
      if (body.tipo === 'preventivo') p.set('tipo', 'preventivo');
      res = await fetch(`${BASE}/api/proforma?${p.toString()}`, { headers });
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
