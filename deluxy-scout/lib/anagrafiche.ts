// Lettura LIVE dal registro Deluxy Anagrafiche (fonte di verità), tramite la
// Edge Function proxy `anagrafiche` che custodisce la chiave server-side.
// Regola d'oro del registro: leggere da qui, non duplicare.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface ContattoRegistro {
  ruolo: string | null;
  nome: string | null;
  telefono: string | null;
  email: string | null;
}

/**
 * L'indirizzo della scheda di un'azienda nel registro Anagrafiche.
 *
 * ⚠️ In un posto solo: l'indirizzo di un'altra app scritto in tre schermate è
 * un indirizzo che al primo cambio ne resta giusto uno. E torna `null` quando
 * il negozio nel registro non c'è: un link che porta a una pagina vuota è
 * peggio di nessun link, perché fa credere che il dato ci sia.
 */
export function urlSchedaRegistro(anagraficheId: string | null | undefined): string | null {
  const id = (anagraficheId ?? '').trim();
  if (!id) return null;
  return `https://deluxy-anagrafiche.vercel.app/partner/${id}`;
}

export interface PartnerRegistro {
  id: string;
  nome: string;
  categoria: string | null;
  stato: string | null;
  interessi: string[];
  citta: string | null;
  provincia: string | null;
  indirizzo: string | null;
  email: string | null;
  telefono: string | null;
  account: string | null;
  ultimaVisita: string | null;
  note: string | null;
  contatti: ContattoRegistro[];
  /** Quale app l ha scritto nel registro: serve a dire da dove arriva. */
  fonte?: string;
  /** Quando è entrato nel registro (ISO): per le segnalazioni è LA data della
   *  segnalazione. Il registro lo manda già (`creatoIl`), qui si dichiara. */
  creatoIl?: string | null;
  /** Il rapporto di fornitura: da_provare | abituale | da_evitare.
   *  Vuoto = non è un nostro fornitore. Lo scrive la riconciliazione del
   *  Customer Service quando un fornitore viene pagato. */
  statoFornitore?: string | null;
}

async function chiama<T>(body: unknown): Promise<T> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/anagrafiche`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // «Registro anagrafiche 401» non dice niente a chi lo legge, e il numero da
    // solo manda a cercare nel posto sbagliato: il 401 non è la TUA sessione, è
    // il registro che rifiuta la chiave di Scout (l'errore viene inoltrato con
    // lo stesso codice). Succede quando quella chiave viene rigenerata dentro
    // Anagrafiche: la vecchia muore all'istante.
    const dettaglio = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error(
        'Il registro Anagrafiche rifiuta la chiave di Scout. Di solito vuol dire che è stata rigenerata di là: ' +
          'incolla quella nuova in Profilo → Impostazioni → App collegate → Anagrafiche.',
      );
    }
    if (res.status === 500 && /non configurata/i.test(dettaglio)) {
      throw new Error(
        'Manca la chiave del registro Anagrafiche: mettila in Profilo → Impostazioni → App collegate.',
      );
    }
    throw new Error(`Registro anagrafiche ${res.status}${dettaglio ? ` — ${dettaglio.slice(0, 160)}` : ''}`);
  }
  return (await res.json()) as T;
}

function normalizza(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').trim();
}

/**
 * Comunica ad Anagrafiche l'archiviazione (o il ripristino) di un REFERENTE.
 * Best-effort: identifica il partner col riferimento esterno di Scout (place_id)
 * e il referente per email/telefono/nome; il registro segna il referente come
 * archiviato. Inerte finché Anagrafiche non espone l'endpoint + chiave scrittura
 * (la Edge Function risponde { ok:false, reason:'non_configurato' } senza errori).
 */
export async function notificaArchiviazioneReferente(dati: {
  placeId: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  negozio: string | null;
  citta: string | null;
  archiviato: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await chiama<{ ok: boolean; reason?: string }>({ action: 'archivia_referente', ...dati });
  } catch {
    // Non blocca l'archiviazione locale: si potrà risincronizzare più avanti.
    return { ok: false, reason: 'non_raggiungibile' };
  }
}

/**
 * Sincronizza un NEGOZIO Scout verso il registro come partner (crea o aggiorna
 * stato/interessi, upsert-merge per riferimento esterno scout+placeId). Best-effort:
 * inerte finché Anagrafiche non abilita la scrittura partner per Scout (secret
 * ANAGRAFICHE_PARTNER_KEY): la funzione risponde { ok:false } senza far fallire nulla.
 */
export async function sincronizzaNegozioRegistro(dati: {
  placeId: string;
  nome: string;
  citta: string | null;
  indirizzo: string | null;
  categoria: string | null;
  stato: string | null; // StatoPlace: da_visitare/visitato/cliente/perso
  statoRegistro?: string | null; // StatoAffiliazione (8 stati) — se presente ha priorità
  account?: string | null; // venditore che segue il cliente (campo account del registro)
  linee: string[];
  /** Referenti da portare nel registro (fusi di là per email/telefono/nome). */
  contatti?: { nome?: string | null; email?: string | null; telefono?: string | null; ruolo?: string | null }[];
}): Promise<EsitoRegistro> {
  try {
    return await chiama<EsitoRegistro>({ action: 'upsert_partner', ...dati });
  } catch {
    return { ok: false, reason: 'non_raggiungibile' };
  }
}

/**
 * Cosa ha fatto il registro con la nostra scrittura.
 *
 * `esito` è la risposta di Anagrafiche: `creato` = l'anagrafica **non c'era e
 * l'abbiamo creata adesso**; `merged` = c'era già (agganciata per riferimento
 * esterno, P.IVA o nome+città) e le nostre informazioni ci sono state fuse
 * dentro. `id` è l'id nel registro: serve a Scout per agganciare il negozio
 * alla scheda subito, senza aspettare l'import della notte.
 *
 * ⚠️ `ok:false` non è un errore da mostrare come guasto dell'utente: la
 * scrittura verso il registro è best-effort e non deve far perdere il lavoro
 * fatto in Scout. Ma **va detto**, perché «non l'ha scritto» e «l'ha scritto»
 * sono due mondi diversi per chi domani cerca quel negozio in Anagrafiche.
 */
export interface EsitoRegistro {
  ok: boolean;
  reason?: string;
  /**
   * `creato` / `merged` li dice il registro. `gia_presente` lo dice Scout: il
   * negozio era già agganciato a una scheda, quindi non c'era niente da
   * scrivere e **non si è scritto niente** — dirlo `merged` sarebbe raccontare
   * una fusione che non è avvenuta.
   */
  esito?: 'creato' | 'merged' | 'gia_presente' | null;
  id?: string | null;
  nome?: string | null;
}

/**
 * I partner **segnalati da un'altra app** e non ancora lavorati da Scout.
 *
 * Il caso vero: l'app fornitori (`deluxy-suppliers`) trova fioristi e
 * pasticcerie in giro per l'Italia e li scrive nel registro come `prospect`
 * con interesse Affiliazioni. Erano già lì da giorni, ma in Scout non li
 * vedeva nessuno: si leggeva il registro solo per cercare la corrispondenza di
 * un negozio che si aveva già.
 *
 * ⚠️⚠️ **Le fonti sono più d'una, dal 25/08/2026.** La schermata si chiama
 * «Segnalazioni CS» e il Customer Service non ci compariva: quando si paga un
 * fornitore, quel fioraio entra nel registro con `fonte: customer-service`, e
 * qui si chiedeva solo `deluxy-suppliers`. Sono i contatti più caldi che
 * abbiamo — gli abbiamo già dato lavoro e li abbiamo già pagati — ed erano gli
 * unici a non arrivare a chi va a visitarli.
 *
 * ⚠️ Si chiede **una fonte per volta** e si uniscono qui: la Edge Function
 * passa un `fonte` solo, e cambiarla vorrebbe dire rideployarla.
 *
 * ⚠️ Richiede la Edge Function `anagrafiche` aggiornata (parametro `fonte`).
 * Finché non è deployata, il registro ignora il filtro e tornerebbero partner
 * di tutte le fonti: per questo si ricontrolla anche qui.
 */
export async function fetchSegnalatiDaApp(fonti: string | string[]): Promise<{
  partner: PartnerRegistro[];
  /** true = l'elenco può essere incompleto (vedi il ripiego qui sotto). */
  parziale: boolean;
  /** Quanti ne esistono in tutto, quando si riesce a saperlo. */
  totali: number | null;
}> {
  const elenco = Array.isArray(fonti) ? fonti : [fonti];
  const risposte = await Promise.all(elenco.map((f) => segnalatiDiUnaFonte(f)));
  // ⚠️ Deduplica per id: la stessa azienda può essere stata scritta da due app
  // (l'app fornitori la trova, il Customer Service la paga) e mostrarla due
  // volte farebbe credere a due negozi.
  const visti = new Set<string>();
  const partner: PartnerRegistro[] = [];
  for (const r of risposte) {
    for (const p of r.partner) {
      if (visti.has(p.id)) continue;
      visti.add(p.id);
      partner.push(p);
    }
  }
  partner.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const totali = risposte.every((r) => r.totali !== null)
    ? risposte.reduce((s, r) => s + (r.totali ?? 0), 0)
    : null;
  return { partner, parziale: risposte.some((r) => r.parziale), totali };
}

async function segnalatiDiUnaFonte(fonte: string): Promise<{
  partner: PartnerRegistro[];
  parziale: boolean;
  totali: number | null;
}> {
  type Riga = PartnerRegistro & { fonte?: string };
  const cerca = (extra: Record<string, unknown>) =>
    chiama<{ dati?: Riga[]; totale?: number }>({ action: 'cerca', perPage: 50, ...extra });

  // Strada buona: il registro filtra per fonte e torna solo quelli giusti.
  //
  // ⚠️ UNA FONTE CHE SBAGLIA NON DEVE SPEGNERE LE ALTRE (27/08/2026). `chiama`
  // lancia su 401/500, e questa riga era nuda dentro un `Promise.all`: bastava
  // che il registro rifiutasse la chiave su UNA fonte perché la schermata
  // mostrasse solo la banda rossa e zero righe — buttando via anche le decine
  // di partner dell'altra fonte, che avevano risposto benissimo. La funzione
  // gemella `fetchFornitori` faceva già la cosa giusta.
  let r: { dati?: Riga[]; totale?: number };
  try {
    r = await cerca({ fonte });
  } catch {
    return { partner: [], parziale: true, totali: null };
  }
  const dati = r.dati ?? [];
  const miei = dati.filter((p) => p.fonte === fonte);
  // ⚠️ ZERO RIGHE È UNA RISPOSTA, non un guasto (27/08/2026). Prima la guardia
  // chiedeva `dati.length &&`, quindi una fonte che semplicemente non ha
  // ancora nessun partner cadeva nel ripiego e tornava `parziale: true`: la
  // schermata annunciava «il registro sta rispondendo senza il filtro per
  // fonte… si risolve rilanciando il deploy», una diagnosi falsa su un filtro
  // che aveva funzionato. E siccome «parziale» è un OR fra le fonti, bastava
  // quella vuota per marcare incompleto tutto l'elenco.
  if (!dati.length || miei.length === dati.length) {
    return { partner: miei, parziale: false, totali: r.totale ?? miei.length };
  }
  // Se tornano anche partner di ALTRE fonti, il filtro è stato ignorato: la
  // Edge Function è quella vecchia (il parametro `fonte` è arrivato dopo), e
  // quello che ha risposto non vuol dire niente. Si passa al ripiego.

  // Ripiego, finché la funzione non è rideployata: si chiede per categoria —
  // uno dei pochi filtri che la versione vecchia passa — e si scarta il resto
  // qui. ⚠️ Il registro ordina per nome e ne dà 50 per volta: se una categoria
  // ne ha di più, quelli in fondo NON si vedono. Per questo torna
  // `parziale: true`: un elenco incompleto che si spaccia per completo è
  // peggio di un elenco vuoto.
  //
  // ⚠️⚠️ Per il Customer Service questo ripiego **non può funzionare affatto**:
  // i fornitori che entrano pagando nascono con categoria `ALTRO` (dal nome di
  // un intestatario di conto non si deduce un mestiere, e inventarlo sarebbe
  // peggio). Quindi non si finge: elenco vuoto e `parziale: true`, che dice
  // «non lo so», invece di zero che dice «non ce ne sono».
  const CATEGORIE = ['FIORISTA', 'PASTICCERIA'];
  const perCategoria = await Promise.all(
    CATEGORIE.map((categoria) => cerca({ categoria, stato: 'prospect' }).catch(() => ({ dati: [], totale: 0 }))),
  );
  const trovati: Riga[] = [];
  let parziale = false;
  for (const risposta of perCategoria) {
    const righe = risposta.dati ?? [];
    if ((risposta.totale ?? 0) > righe.length) parziale = true;
    trovati.push(...righe.filter((p) => p.fonte === fonte));
  }
  return { partner: trovati, parziale: true, totali: null };
}

/** Gli stati di fornitura del registro, nell'ordine in cui ha senso leggerli. */
export const STATI_FORNITORE = ['abituale', 'da_provare', 'da_evitare'] as const;

/**
 * I NOSTRI FORNITORI, letti live dal registro: i partner con uno
 * `statoFornitore` (da_provare | abituale | da_evitare). Lo stato lo scrive la
 * riconciliazione del Customer Service quando un fornitore prepara un ordine e
 * viene pagato — sono rapporti già in piedi, non prospezione.
 *
 * ⚠️ Il registro filtra per UN valore alla volta (`statoFornitore=`), quindi si
 * chiede tre volte e si unisce qui — lo stesso giro delle fonti in
 * `fetchSegnalatiDaApp`. E come là, se la Edge Function deployata è più vecchia
 * del parametro il registro lo ignora e torna partner qualsiasi: si verifica
 * che TUTTE le righe abbiano lo stato chiesto, altrimenti `parziale: true` —
 * meglio dire «non lo so» che spacciare l'elenco sbagliato per quello vero.
 */
export async function fetchFornitori(): Promise<{
  partner: PartnerRegistro[];
  parziale: boolean;
}> {
  const risposte = await Promise.all(
    STATI_FORNITORE.map(async (stato) => {
      try {
        const r = await chiama<{ dati?: PartnerRegistro[]; totale?: number }>({
          action: 'cerca',
          statoFornitore: stato,
          perPage: 50,
        });
        const dati = r.dati ?? [];
        const miei = dati.filter((p) => p.statoFornitore === stato);
        // Filtro applicato davvero solo se sono TUTTI dello stato chiesto.
        if (dati.length && miei.length !== dati.length) return { partner: [], parziale: true };
        // Oltre le 50 righe servirebbero le pagine: finché non serve, si dice.
        return { partner: miei, parziale: (r.totale ?? miei.length) > miei.length };
      } catch {
        return { partner: [], parziale: true };
      }
    }),
  );
  const visti = new Set<string>();
  const partner: PartnerRegistro[] = [];
  for (const r of risposte) {
    for (const p of r.partner) {
      if (visti.has(p.id)) continue;
      visti.add(p.id);
      partner.push(p);
    }
  }
  partner.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  return { partner, parziale: risposte.some((r) => r.parziale) };
}

/**
 * Tutti i partner del registro, a pagine. Serve alla vista Province, che deve
 * contare quanti ne abbiamo in ognuna delle 107 province: chiederli una
 * provincia alla volta sarebbe 107 chiamate.
 *
 * ⚠️ Richiede la Edge Function `anagrafiche` aggiornata (parametro `page`).
 * Senza, il registro rimanda sempre la prima pagina: il ciclo se ne accorge —
 * la pagina 2 è identica alla 1 — e si ferma invece di girare a vuoto o, peggio,
 * contare dieci volte gli stessi partner (è già successo mentre verificavo i
 * numeri: totali tutti multipli tondi di 10).
 */
export async function fetchTuttiPartner(max = 1200): Promise<{ partner: PartnerRegistro[]; completo: boolean }> {
  const PER_PAGINA = 50;
  const tutti: PartnerRegistro[] = [];
  const visti = new Set<string>();
  let completo = true;
  for (let page = 1; tutti.length < max; page++) {
    const r = await chiama<{ dati?: PartnerRegistro[]; totale?: number }>({
      action: 'cerca',
      perPage: PER_PAGINA,
      page,
    });
    const righe = r.dati ?? [];
    if (!righe.length) break;
    const nuovi = righe.filter((p) => !visti.has(p.id));
    // Nessun id nuovo = la paginazione non sta funzionando: fermarsi e dirlo.
    if (!nuovi.length) {
      if (page > 1) completo = false;
      break;
    }
    for (const p of nuovi) visti.add(p.id);
    tutti.push(...nuovi);
    if (righe.length < PER_PAGINA) break;
    if (r.totale && tutti.length >= r.totale) break;
  }
  return { partner: tutti, completo };
}

/**
 * Cerca nel registro il partner corrispondente a un negozio (per nome, con la
 * città come contesto). Ritorna la corrispondenza per nome normalizzato, o la
 * prima se non c'è un match esatto (con confidenza bassa lato UI).
 */
export async function cercaAnagrafica(
  nome: string,
  citta?: string | null,
): Promise<{ partner: PartnerRegistro | null; esatto: boolean }> {
  if (!nome.trim()) return { partner: null, esatto: false };
  const risposta = await chiama<{ dati?: PartnerRegistro[] }>({
    action: 'cerca',
    q: nome,
    citta: citta ?? undefined,
    perPage: 10,
  });
  const dati = risposta.dati ?? [];
  if (!dati.length) return { partner: null, esatto: false };
  const target = normalizza(nome);
  const esatto = dati.find((p) => normalizza(p.nome) === target);
  return { partner: esatto ?? dati[0], esatto: Boolean(esatto) };
}

/** I campi che l'AI riesce a leggere in una richiesta (null = non c'è scritto). */
export interface DatiEstratti {
  ragioneSociale: string | null;
  citta: string | null;
  indirizzo: string | null;
  categoria: string | null;
  referente: { nome: string | null; email: string | null; telefono: string | null; ruolo: string | null };
  richiesta: string | null;
  /** Cosa NON è stato trovato: si mostra, non si nasconde. */
  mancanti: string[];
}

/**
 * Legge una richiesta e ne tira fuori i campi dell'anagrafica (26/08/2026,
 * richiesta dell'utente: «usa l'ai per capire esattamente come compilare tutti
 * i campi»).
 *
 * ⚠️ **Non deduce**: il modello riempie un campo solo se il dato è scritto nel
 * testo, altrimenti torna null — e l'app mostra comunque i campi a chi
 * qualifica, prima di scriverli nel registro. Un indirizzo inventato nel
 * registro delle anagrafiche B2B ci resta.
 *
 * ⚠️ `fonte` dice COME sono stati letti: `ai` col modello, `regole` col ripiego
 * (le etichette del modulo Shopify) quando la chiave AI non c'è o non risponde.
 * Non è un dettaglio tecnico: cambia quanto ci si può fidare.
 */
export async function estraiAnagrafica(
  testo: string,
  mittente?: string | null,
  oggetto?: string | null,
): Promise<{ dati: DatiEstratti; fonte: 'ai' | 'regole'; avviso?: string }> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/estrai-anagrafica`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ testo, mittente: mittente ?? null, oggetto: oggetto ?? null }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.errore ?? 'Lettura della richiesta non riuscita.');
  }
  return { dati: payload.dati as DatiEstratti, fonte: payload.fonte ?? 'regole', avviso: payload.avviso };
}

/**
 * Cerca nel registro per nome, e torna un ELENCO (non una corrispondenza).
 *
 * Serve ai selettori: chi sceglie un fornitore per un preventivo deve vedere i
 * candidati e decidere lui. ⚠️ Non si usa per AFFERMARE un'identità — per
 * quello c'è `trovaAnagraficaGiaPresente`, che accetta solo l'omonimo unico.
 */
export async function cercaNelRegistro(q: string, max = 12): Promise<PartnerRegistro[]> {
  const testo = q.trim();
  if (testo.length < 2) return [];
  const r = await chiama<{ dati?: PartnerRegistro[] }>({ action: 'cerca', q: testo, perPage: Math.min(max, 50) });
  return (r.dati ?? []).slice(0, max);
}

/**
 * «Questo negozio è GIÀ nel registro?» — la domanda che si fa PRIMA di crearlo.
 *
 * Non è `cercaAnagrafica`: quella serve a proporre una corrispondenza a un
 * essere umano, e quando non trova l'esatto ripiega sul primo dell'elenco. Qui
 * si sta per SCRIVERE, e la regola larga di una ricerca, usata per affermare
 * un'identità, scrive il falso. Perciò: solo nome uguale (normalizzato) e
 * città compatibile, altrimenti `null` — e chi chiama crea.
 *
 * ⚠️ **Perché non basta lasciar decidere il registro.** Il suo upsert aggancia
 * per riferimento esterno, P.IVA, o *nome + città*; e quando la città che gli
 * mandiamo è vuota cerca fra le anagrafiche **senza città**. In Scout la zona è
 * vuota su 979 negozi su 1.807 (misurato il 26/08/2026): senza questo giro,
 * qualificare una richiesta su uno di quelli avrebbe creato una **seconda**
 * scheda accanto a quella che c'era già.
 *
 * ⚠️ La città NON si passa come filtro alla ricerca: di là è un confronto
 * esatto (`where.citta = v`), e in Scout le zone sono scritte «MILANO» dove il
 * registro ha «Milano». Si filtra qui, normalizzando.
 *
 * ⚠️ Due negozi con lo stesso nome e nessuna città per distinguerli (capita:
 * «HAVI» sono due) non si decidono: torna `null` con `ambiguo: true`, e la
 * scelta la fa il registro col suo upsert.
 */
export async function trovaAnagraficaGiaPresente(
  nome: string,
  citta: string | null,
): Promise<{ partner: PartnerRegistro | null; ambiguo: boolean }> {
  if (!nome.trim()) return { partner: null, ambiguo: false };
  const risposta = await chiama<{ dati?: PartnerRegistro[] }>({ action: 'cerca', q: nome, perPage: 25 });
  const target = normalizza(nome);
  const omonimi = (risposta.dati ?? []).filter((p) => normalizza(p.nome) === target);
  if (!omonimi.length) return { partner: null, ambiguo: false };
  const c = normalizza(citta);
  if (c) {
    const stessaCitta = omonimi.filter((p) => normalizza(p.citta) === c);
    if (stessaCitta.length === 1) return { partner: stessaCitta[0], ambiguo: false };
    if (stessaCitta.length > 1) return { partner: null, ambiguo: true };
    // Omonimi ma in un'altra città: non è lo stesso negozio.
    return { partner: null, ambiguo: false };
  }
  // Senza città non si può distinguere: si accetta solo l'omonimo unico.
  if (omonimi.length === 1) return { partner: omonimi[0], ambiguo: false };
  return { partner: null, ambiguo: true };
}
