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
      // ⭐ P.IVA E CODICE FISCALE (03/09/2026). Erano l'anello che mancava: la
      // scheda in FINANCE nasceva col nome e la città, e senza P.IVA una
      // fattura non si emette — quindi il giro «vinta → ordine → documento»
      // finiva su una scheda inutilizzabile. Il registro li possiede, FINANCE
      // li accetta (li normalizza lui), noi li passiamo.
      pIva: a.pIva ?? undefined,
      codiceFiscale: a.codiceFiscale ?? undefined,
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
  const CAMPI =
    'nome, brand, logo_data_url, ragione_sociale, indirizzo, cap, citta, provincia, piva, codice_fiscale, rea, sdi, pec, telefono, email, sito, banca, iban, bic, intestatario_conto, note_piede, predefinito';
  // ⚠️⚠️ **SI CERCA FRA I TEMPLATE DELLA PRO-FORMA** (03/09/2026). La scelta era
  // per BRAND soltanto, con `limit(1)`: finché i tipi erano tre e le righe una
  // per insegna non si vedeva, ma il giorno che un brand ha due template — una
  // pro-forma e un «modulo di servizio», aggiunto oggi — quale dei due usciva
  // sulla pro-forma lo decideva l'ordine del database. Cioè il caso.
  //
  // ⚠️ Il ripiego SENZA tipo resta, ed è voluto: chi ha un template solo, magari
  // salvato prima che il tipo esistesse, deve continuare a vedere la sua carta
  // intestata invece di quella generale di FINANCE.
  const cerca = async (filtro: (q: any) => any) => {
    const { data } = await filtro(admin.from('template_documento').select(CAMPI).limit(1));
    return data?.[0];
  };
  const riga =
    (brand ? await cerca((q: any) => q.eq('brand', brand).eq('tipo', 'proforma')) : undefined) ??
    (await cerca((q: any) => q.eq('predefinito', true).eq('tipo', 'proforma'))) ??
    (brand ? await cerca((q: any) => q.eq('brand', brand)) : undefined) ??
    (await cerca((q: any) => q.eq('predefinito', true)));
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
    } else if (body.azione === 'annulla') {
      // ⭐ **ANNULLA IL DOCUMENTO** (03/09/2026, richiesta dell'utente: alla
      // domanda «l'annullamento di un ordine annulla anche la pro-forma?» →
      // «serve annullamento»).
      //
      // Prima l'annullo era solo un gesto dentro FINANCE: un ordine annullato in
      // Scout lasciava la sua pro-forma viva di là, e il documento continuava a
      // comparire fra quelli attivi (e nell'atteso da incassare).
      //
      // ⚠️ Il numero NON si libera: `PF 7/2026` resta assegnato. Un buco nella
      // serie è normale, due documenti con lo stesso numero no.
      //
      // ⚠️ Una FATTURA vera non passa di qui: FINANCE risponde 422 e si storna
      // con una nota di credito. Il 422 si racconta a chi ha premuto, non si
      // ingoia.
      res = await fetch(`${BASE}/api/proforma`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: body.id ?? undefined,
          numero: body.numero ?? undefined,
          tipo: body.tipo ?? undefined,
          stato: 'annullata',
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
    } else if (body.azione === 'incassi') {
      // ⭐⭐ FINANCE DICE A SCOUT COSA È STATO PAGATO (31/08/2026, richiesta
      // dell'utente: «servirebbe che FINANCE comunicasse a Scout se una
      // fattura o pro-forma è stata pagata»).
      //
      // ⚠️ FINANCE non si tocca, e non serve: il dato lo espone già —
      // `GET /api/fatture?numero=` torna `pagata` e `dataPagamento`, e
      // `GET /api/proforma?numero=` torna lo `stato`, dove «fatturata» è
      // esattamente il passaggio che scatta al ricevimento del saldo. Il
      // proprietario espone, il lettore legge (Standard §7): quindi è SCOUT
      // che va a chiedere, e nessuno dei due tiene la copia dei numeri
      // dell'altro — qui si scrive solo lo stato della propria riga e il
      // giorno in cui il saldo è arrivato.
      //
      // Gira in due modi, con lo stesso codice: dal bottone dell'app e dal
      // cron notturno (chiave d'ingresso). Un dato che arriva solo quando
      // qualcuno apre la schermata non è una comunicazione, è una coincidenza.
      const LIMITE = 300;
      const cache = new Map<string, { pagata: boolean; quando: string | null; intestatario: string | null; totale: number | null }>();

      /**
       * ⚠️⚠️ IL NUMERO NON È UN'IDENTITÀ (imparato il 31/08/2026, sui dati veri
       * e su una riga di denaro).
       *
       * Primo giro di questa funzione: l'ordine di **HAVI LOGISTICS** aveva
       * «PF 19/2026» scritto nel campo della fattura, FINANCE ha risolto quel
       * testo nella fattura **19/2026 di DIPTYQUE (OLFATTORIO)** — un altro
       * cliente — che risulta pagata, e l'ordine è stato segnato incassato.
       * Un incasso di un terzo attribuito a noi, in silenzio.
       *
       * Da qui due guardie, entrambe necessarie:
       *  1. un riferimento che comincia per «PF » è una PRO-FORMA, anche se sta
       *     nel campo della fattura: si chiede all'elenco giusto (chi lo ha
       *     scritto ha sbagliato campo, non documento);
       *  2. si confronta l'INTESTATARIO che torna da FINANCE col cliente della
       *     riga: se non combaciano, la riga NON si muove e il caso si
       *     dichiara. Meglio un incasso che aspetta una persona che un incasso
       *     inventato.
       */
      /**
       * ⚠️⚠️ GUARDIA 3: UN DOCUMENTO SALDATO NON È L'ORDINE INCASSATO (31/08/2026,
       * trovato subito dopo le prime due, sugli stessi dati).
       *
       * L'ordine di HAVI LOGISTICS vale **3.930 €**, la sua pro-forma saldata
       * «PF 19/2026» ne copre **219,60**: un acconto. Segnare l'ordine
       * «incassato» perché un suo documento è stato pagato vorrebbe dire
       * dichiarare entrati 3.930 € che non sono entrati — e sui riepiloghi per
       * periodo quel numero non torna più indietro da solo.
       *
       * Quindi si avanza solo se il documento COPRE la riga (tolleranza di un
       * euro, per gli arrotondamenti dell'IVA); se copre meno, non si muove
       * niente e il caso si dichiara: un acconto lo riconosce una persona.
       */
      function copreLaRiga(atteso: unknown, totaleDocumento: number | null) {
        const v = typeof atteso === 'number' ? atteso : Number(atteso);
        // Senza il valore atteso non c'è niente da confrontare: si passa (è il
        // caso delle richieste senza importo concordato).
        if (!Number.isFinite(v) || v <= 0) return true;
        if (totaleDocumento == null) return false; // «non lo so» non è «copre»
        return totaleDocumento + 1 >= v;
      }

      function nomiCompatibili(a: string | null | undefined, b: string | null | undefined) {
        const n = (s: unknown) =>
          String(s ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[^a-z0-9]+/g, '');
        const x = n(a);
        const y = n(b);
        // Sotto le 4 lettere un «contiene» non vuol dire niente: «bar» sta
        // dentro mezza Italia.
        if (x.length < 4 || y.length < 4) return false;
        return x.includes(y) || y.includes(x);
      }

      /** Chiede a FINANCE se un documento è saldato, e DI CHI è. Una domanda
       *  per numero: lo stesso documento può stare su più righe di Scout. */
      async function saldato(numeroGrezzo: string, tipoRichiesto: 'proforma' | 'fattura') {
        const numero = numeroGrezzo.trim();
        // Guardia 1: «PF …» è una pro-forma, in qualunque campo sia scritta.
        const tipo = /^pf[\s-]/i.test(numero) ? 'proforma' : tipoRichiesto;
        const chiave = `${tipo}:${numero}`;
        const gia = cache.get(chiave);
        if (gia) return gia;
        let out = { pagata: false, quando: null as string | null, intestatario: null as string | null, totale: null as number | null };
        try {
          const url =
            tipo === 'proforma'
              ? `${BASE}/api/proforma?numero=${encodeURIComponent(numero)}`
              : `${BASE}/api/fatture?numero=${encodeURIComponent(numero)}`;
          const r = await fetch(url, { headers });
          if (r.ok) {
            const d = await r.json();
            out =
              tipo === 'proforma'
                ? {
                    pagata: d?.stato === 'fatturata',
                    quando: d?.fatturataIl ?? null,
                    intestatario: d?.partner?.nome ?? null,
                    totale: typeof d?.totale === 'number' ? d.totale : null,
                  }
                : {
                    pagata: d?.pagata === true,
                    quando: d?.dataPagamento ?? null,
                    intestatario: d?.partner?.nome ?? null,
                    totale: typeof d?.totale === 'number' ? d.totale : typeof d?.importo === 'number' ? d.importo : null,
                  };
          }
          // ⚠️ Un 404 (documento non trovato di là) NON è «non pagato»: è
          // «non lo so». Resta `pagata: false` e la riga non si muove —
          // avanzare su un documento che non esiste sarebbe peggio.
        } catch {
          /* rete: si riprova al giro dopo */
        }
        cache.set(chiave, out);
        return out;
      }

      /**
       * ⚠️ LO STATO PUÒ SOLO AVANZARE. Se FINANCE risponde «non pagata» su una
       * riga che qui è già chiusa, non si torna indietro: il saldo può essere
       * stato registrato altrove (bonifico segnato a mano, compensazione), e
       * un automatismo che riapre una cosa chiusa cancella il lavoro di una
       * persona senza che nessuno se ne accorga.
       */
      const esito = {
        controllati: 0,
        aggiornati: 0,
        richieste_cliente: 0,
        richieste_pagamento: 0,
        ordini: 0,
        // ⚠️ Il documento saldato di UN ALTRO cliente non si ingoia: si
        // dichiara. È il caso HAVI/DIPTYQUE del 31/08 — un riferimento
        // sbagliato su una riga di denaro, che una persona deve guardare.
        da_guardare: [] as string[],
        errori: [] as string[],
      };

      // ── 1. Richieste clienti: pro-forma o fattura → «fatturata» ──
      const { data: rc } = await admin
        .from('richieste_cliente')
        .select('id, cliente, importo, proforma_numero, fattura_numero, stato')
        .not('stato', 'in', '("fatturata","persa","annullata")')
        .or('proforma_numero.not.is.null,fattura_numero.not.is.null')
        .limit(LIMITE);
      for (const r of rc ?? []) {
        esito.controllati++;
        // La FATTURA vale più della pro-forma: è il documento definitivo.
        const q = r.fattura_numero
          ? await saldato(String(r.fattura_numero), 'fattura')
          : await saldato(String(r.proforma_numero), 'proforma');
        if (!q.pagata) continue;
        // Guardia 2: il documento saldato deve essere DI QUESTO cliente.
        if (!nomiCompatibili(r.cliente, q.intestatario)) {
          esito.da_guardare.push(
            `richiesta di «${r.cliente}»: il documento ${r.fattura_numero ?? r.proforma_numero} risulta saldato ma è intestato a «${q.intestatario ?? 'sconosciuto'}»`,
          );
          continue;
        }
        if (!copreLaRiga(r.importo, q.totale)) {
          esito.da_guardare.push(
            `richiesta di «${r.cliente}»: il documento saldato copre ${q.totale ?? '?'} € su ${r.importo} € — sembra un acconto`,
          );
          continue;
        }
        const { error } = await admin
          .from('richieste_cliente')
          .update({ stato: 'fatturata', pagata_il: q.quando ?? new Date().toISOString() })
          .eq('id', r.id);
        if (error) esito.errori.push(`richiesta ${r.id}: ${error.message}`);
        else {
          esito.aggiornati++;
          esito.richieste_cliente++;
        }
      }

      // ── 2. Richieste di pagamento: pro-forma saldata → «pagata» ──
      const { data: rp } = await admin
        .from('richieste_pagamento')
        .select('id, cliente, proforma_numero, stato')
        .not('stato', 'in', '("pagata","annullata")')
        .not('proforma_numero', 'is', null)
        .limit(LIMITE);
      for (const r of rp ?? []) {
        esito.controllati++;
        const q = await saldato(String(r.proforma_numero), 'proforma');
        if (!q.pagata) continue;
        if (!nomiCompatibili(r.cliente, q.intestatario)) {
          esito.da_guardare.push(
            `pagamento di «${r.cliente}»: ${r.proforma_numero} risulta saldata ma è intestata a «${q.intestatario ?? 'sconosciuto'}»`,
          );
          continue;
        }
        // ⚠️ Si scrive lo STATO, non l'importo incassato: quanto è entrato lo
        // sa la contabilità, e ricopiarlo qui sarebbe un secondo numero per
        // lo stesso fatto — quello che il 24/08 ha già fatto danni sui costi.
        const { error } = await admin
          .from('richieste_pagamento')
          .update({ stato: 'pagata', updated_at: new Date().toISOString() })
          .eq('id', r.id);
        if (error) esito.errori.push(`pagamento ${r.id}: ${error.message}`);
        else {
          esito.aggiornati++;
          esito.richieste_pagamento++;
        }
      }

      // ── 3. Ordini: fattura saldata → «incassato» ──
      const { data: ord } = await admin
        .from('ordini')
        .select('id, cliente, valore, fattura_numero, proforma_numero, stato')
        .eq('stato', 'da_incassare')
        .or('fattura_numero.not.is.null,proforma_numero.not.is.null')
        .limit(LIMITE);
      for (const o of ord ?? []) {
        esito.controllati++;
        const q = o.fattura_numero
          ? await saldato(String(o.fattura_numero), 'fattura')
          : await saldato(String(o.proforma_numero), 'proforma');
        if (!q.pagata) continue;
        if (!nomiCompatibili(o.cliente, q.intestatario)) {
          esito.da_guardare.push(
            `ordine di «${o.cliente}»: il documento ${o.fattura_numero ?? o.proforma_numero} risulta saldato ma è intestato a «${q.intestatario ?? 'sconosciuto'}»`,
          );
          continue;
        }
        if (!copreLaRiga(o.valore, q.totale)) {
          esito.da_guardare.push(
            `ordine di «${o.cliente}»: il documento ${o.fattura_numero ?? o.proforma_numero} è saldato ma copre ${q.totale ?? '?'} € su ${o.valore} € — sembra un acconto`,
          );
          continue;
        }
        // ⚠️ Anche la DATA dell'incasso: un ordine incassato senza il giorno
        // non si distingue da uno segnato a mano male, e nei riepiloghi per
        // periodo sparisce.
        const { error } = await admin
          .from('ordini')
          .update({ stato: 'incassato', incassato_il: (q.quando ?? new Date().toISOString()).slice(0, 10) })
          .eq('id', o.id);
        if (error) esito.errori.push(`ordine ${o.id}: ${error.message}`);
        else {
          esito.aggiornati++;
          esito.ordini++;
        }
      }

      return json({ ok: true, ...esito });
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
