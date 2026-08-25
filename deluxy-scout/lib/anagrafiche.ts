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
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await chiama<{ ok: boolean; reason?: string }>({ action: 'upsert_partner', ...dati });
  } catch {
    return { ok: false, reason: 'non_raggiungibile' };
  }
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
  const r = await cerca({ fonte });
  const dati = r.dati ?? [];
  const miei = dati.filter((p) => p.fonte === fonte);
  // Se sono TUTTI della fonte chiesta, il filtro è stato applicato davvero.
  // Se tornano anche partner di altre fonti, la Edge Function è quella vecchia
  // (il parametro `fonte` è arrivato dopo) e ha semplicemente ignorato il
  // filtro: quello che ha risposto non vuol dire niente.
  if (dati.length && miei.length === dati.length) {
    return { partner: miei, parziale: false, totali: r.totale ?? miei.length };
  }

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
