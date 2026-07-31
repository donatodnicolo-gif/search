import { prisma } from "./db";
import { urlAnagrafiche, type Anagrafica } from "./anagrafiche";
import { registra } from "./registro";

// I partner che nel registro Anagrafiche sono diventati CLIENTI entrano da soli
// in FINANCE.
//
// ⚠️ Nel registro il valore salvato è `attivo` ma l'etichetta è **«Cliente»**
// (rinominata il 31/07/2026): «attivo» diceva due cose in una parola sola. È
// la risposta alla domanda «con questa azienda ci lavoriamo davvero» — le si
// fattura, si incassa, la si paga — e quindi deve avere una scheda anche qui.
// Finché il passaggio si faceva a mano, un'azienda dichiarata cliente dal
// commerciale esisteva nel registro ma non qui: le sue vendite si registravano
// su una scheda che bisognava prima ricordarsi di creare.
//
// Questa è la **rete di sicurezza**: il registro chiama già FINANCE al momento
// del passaggio (`POST /api/v1/partners`), ma quel richiamo scatta solo sul
// cambio di stato — chi era cliente da prima, o chi è passato mentre l'app era
// irraggiungibile, lo recupera solo un ripasso periodico dell'elenco.
//
// Verso: **pull**, non push. È FINANCE a chiedere al registro chi è attivo, come
// per ogni altro dato anagrafico. Il registro non ha (e non deve avere) una
// chiave per scrivere qui dentro.
//
// ⚠️ Non si cancella e non si disattiva niente al contrario: se un'anagrafica
// torna «prospect», la scheda in FINANCE resta — ci sono attaccati vendite,
// fatture e saldi, e sparire non è una cosa che un dato contabile può fare.

const ENV_KEY = () => process.env.ANAGRAFICHE_API_KEY || process.env.ANAGRAFICHE_READ_KEY || "";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
}

// Il nome della scheda in FINANCE: insegna + città.
//
// ⚠️ Due motivi, ed è costato un errore in faccia all'utente. (1) In FINANCE
// `nome` è @unique, e fra i clienti del registro **«MONCLER» compare due
// volte** — Forte dei Marmi e Firenze: creandone due con lo stesso nome la
// seconda fa fallire tutto l'import. (2) Il richiamo diretto del registro
// (`POST /api/v1/partners`) usa **esattamente questa forma**: se il pull ne
// usasse un'altra, le due strade creerebbero due schede per la stessa azienda.
function nomeFinance(a: { nome: string; citta?: string | null }): string {
  return [a.nome, a.citta].filter(Boolean).join(" ").trim();
}

// «FIORISTA» → «Fiorista»: in FINANCE la categoria si legge nelle tabelle, e
// le maiuscole urlate del registro renderebbero illeggibile ogni elenco.
function categoriaLeggibile(c: string | null | undefined): string | null {
  if (!c) return null;
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

export type AnagraficaAttiva = Pick<
  Anagrafica,
  "id" | "nome" | "ragioneSociale" | "categoria" | "citta" | "email" | "telefono" | "datiFinanziari"
>;

/** Le anagrafiche in stato «attivo» sul registro. Lista vuota se il registro
 *  non è configurato o non risponde: l'import è un servizio, non deve far
 *  fallire chi lo chiama. */
export async function anagraficheAttive(): Promise<AnagraficaAttiva[]> {
  const key = ENV_KEY();
  if (!key) return [];
  const out: AnagraficaAttiva[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `${urlAnagrafiche()}/api/v1/partners?stato=attivo&page=${page}&perPage=200`,
        { headers: { "x-api-key": key }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) break;
      const j = (await res.json()) as { dati?: AnagraficaAttiva[]; totale?: number };
      out.push(...(j.dati ?? []));
      if (!j.dati?.length || out.length >= (j.totale ?? 0)) break;
    }
  } catch {
    return out;
  }
  // il registro può restituire lo stesso record su più pagine se qualcuno
  // scrive mentre si scorre: si tiene l'id una volta sola
  return [...new Map(out.map((a) => [a.id, a])).values()];
}

// Parole che non identificano nessuno: forme societarie, articoli, città.
// Tutto il resto — mestiere compreso — vale come indizio di somiglianza,
// perché qui l'obiettivo non è ABBINARE ma CHIEDERE.
const NON_IDENTIFICA = new Set([
  "srl", "srls", "snc", "sas", "spa", "sapa", "coop", "societa", "ditta", "impresa",
  "della", "delle", "degli", "dei", "del", "san", "santa", "italia", "italy",
]);

function tokenSomiglianza(nome: string): string[] {
  return [...new Set(norm(nome).split(" "))].filter((t) => t.length >= 4 && !NON_IDENTIFICA.has(t));
}

/** A quali schede di FINANCE somiglia questo nome. Criterio **largo** apposta:
 *  un token in comune basta. Serve a fermarsi e chiedere, non ad abbinare —
 *  «Amir Roma. Cioccolato e Pasticceria» e «AMIR (LA BOTTEGA DI CIOCCOLATO
 *  SRLS)» sono la stessa azienda scritta in due modi, e crearne una seconda
 *  scheda è esattamente il danno da evitare. */
function somiglianti<T extends { nome: string }>(nome: string, partners: T[]): T[] {
  const tok = new Set(tokenSomiglianza(nome));
  if (tok.size === 0) return [];
  // ordinati per quante parole hanno in comune: il primo della lista è quello
  // che la tendina propone, e dev'essere il candidato più probabile
  return partners
    .map((p) => ({ p, n: tokenSomiglianza(p.nome).filter((t) => tok.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.p);
}

export type DubbioImport = { anagrafica: AnagraficaAttiva; simili: { id: string; nome: string }[] };
export type DaImportare = { nuovi: AnagraficaAttiva[]; dubbi: DubbioImport[] };

/** Chi manca in FINANCE, diviso in due: quelli che si possono creare a occhi
 *  chiusi e quelli che **assomigliano a una scheda già presente**, dove decide
 *  una persona. L'aggancio certo è per `anagraficaId` e per nome identico. */
export async function attiviDaImportare(): Promise<DaImportare> {
  const attive = await anagraficheAttive();
  if (attive.length === 0) return { nuovi: [], dubbi: [] };
  const partners = await prisma.partner.findMany({ select: { id: true, nome: true, anagraficaId: true } });
  const perId = new Set(partners.map((p) => p.anagraficaId).filter(Boolean));
  const perNome = new Set(partners.map((p) => norm(p.nome)));

  const nuovi: AnagraficaAttiva[] = [];
  const dubbi: DubbioImport[] = [];
  // i nomi già "prenotati" in questa passata: fra i clienti del registro
  // «MONCLER» compare due volte (Forte dei Marmi e Firenze) e in FINANCE il
  // nome è unico — senza questo la seconda creazione farebbe fallire tutto
  const prenotati = new Set<string>();

  for (const a of attive) {
    if (perId.has(a.id)) continue;
    const nome = nomeFinance(a);
    if (perNome.has(norm(nome)) || perNome.has(norm(a.nome)) || prenotati.has(norm(nome))) continue;
    const simili = somiglianti(a.nome, partners);
    if (simili.length > 0) {
      dubbi.push({ anagrafica: a, simili: simili.map((s) => ({ id: s.id, nome: s.nome })) });
    } else {
      nuovi.push(a);
      prenotati.add(norm(nome));
    }
  }
  return { nuovi, dubbi };
}

/** Crea in FINANCE la scheda di un'anagrafica del registro. Non decide se
 *  farlo: quello lo stabilisce chi la chiama (l'import per i casi certi, la
 *  persona per i dubbi). Non lancia mai: un record storto non deve portare giù
 *  gli altri quarantacinque. */
export async function creaDaAnagrafica(
  a: AnagraficaAttiva
): Promise<{ ok: boolean; nome: string; errore?: string }> {
  const nome = nomeFinance(a);
  const fin = a.datiFinanziari;
  try {
    await prisma.partner.create({
      data: {
        nome,
        ragioneSociale: a.ragioneSociale ?? null,
        categoria: categoriaLeggibile(a.categoria),
        citta: a.citta ?? null,
        email: a.email ?? null,
        telefono: a.telefono ?? null,
        iban: fin?.iban ?? null,
        intestatarioConto: fin?.intestatarioConto ?? null,
        ammNome: fin?.amministrazioneNome ?? null,
        ammEmail: fin?.amministrazioneEmail ?? null,
        ammTelefono: fin?.amministrazioneTelefono ?? null,
        anagraficaId: a.id,
        attivo: true,
        // fee, giorni di pagamento e compensazione restano ai default: sono
        // patti commerciali, non dati anagrafici, e nessuno li sa al posto di
        // chi tratta col partner
      },
    });
    return { ok: true, nome };
  } catch (e) {
    const m = (e as Error).message;
    return {
      ok: false,
      nome,
      errore: /Unique constraint/i.test(m)
        ? "esiste già una scheda con questo nome"
        : m.split("\n").pop()?.slice(0, 120) ?? "errore",
    };
  }
}

export type EsitoImport = {
  creati: string[];
  collegati: string[];
  /** lasciati fuori perché somigliano a una scheda già presente */
  dubbi: number;
  errori: string[];
  errore?: string;
};

/** Crea in FINANCE **solo i casi certi**: chi somiglia a una scheda già qui
 *  resta fuori e lo decide una persona.
 *
 *  ⚠️ Il 31/07/2026 questa funzione ha creato 17 schede doppie e poi è
 *  esplosa: creava per nome esatto e nient'altro, così «Amir Roma. Cioccolato
 *  e Pasticceria» è diventato un secondo AMIR, e il secondo «MONCLER» del
 *  registro ha fatto fallire tutto sul vincolo di unicità del nome. Da qui le
 *  tre regole di adesso: i somiglianti si mettono da parte, i nomi si
 *  prenotano dentro la passata, e un record che va storto non porta giù gli
 *  altri. */
export async function importaAttivi(origine: string): Promise<EsitoImport> {
  const vuoto = { creati: [], collegati: [], dubbi: 0, errori: [] };
  const key = ENV_KEY();
  if (!key) return { ...vuoto, errore: "Manca ANAGRAFICHE_API_KEY: il registro non è leggibile." };

  const { nuovi, dubbi } = await attiviDaImportare();
  const attive = await anagraficheAttive();
  if (attive.length === 0) {
    return { ...vuoto, errore: "Il registro non ha risposto (o non ha anagrafiche attive)." };
  }

  const partners = await prisma.partner.findMany({ select: { id: true, nome: true, anagraficaId: true } });
  const perId = new Set(partners.map((p) => p.anagraficaId).filter(Boolean));
  const perNome = new Map(partners.map((p) => [norm(p.nome), p]));

  const creati: string[] = [];
  const collegati: string[] = [];
  const errori: string[] = [];

  // 1) chi ha lo stesso identico nome: si collega, non si duplica
  for (const a of attive) {
    if (perId.has(a.id)) continue;
    const esistente = perNome.get(norm(nomeFinance(a))) ?? perNome.get(norm(a.nome));
    if (esistente && !esistente.anagraficaId) {
      await prisma.partner.update({ where: { id: esistente.id }, data: { anagraficaId: a.id } });
      collegati.push(esistente.nome);
    }
  }

  // 2) i casi certi si creano; un errore su uno non ferma gli altri
  for (const a of nuovi) {
    const esito = await creaDaAnagrafica(a);
    if (esito.ok) creati.push(esito.nome);
    else errori.push(`${esito.nome}: ${esito.errore}`);
  }

  if (creati.length || collegati.length) {
    await registra({
      categoria: "partner",
      entita: "partner",
      entitaId: "import-anagrafiche",
      azione:
        `Import da Anagrafiche (${origine}): ${creati.length} schede create` +
        (collegati.length ? `, ${collegati.length} collegate a schede esistenti` : "") +
        (dubbi.length ? `, ${dubbi.length} lasciate da decidere` : ""),
      dettaglio: [...creati, ...collegati.map((c) => `${c} (collegata)`)].join(", ").slice(0, 900),
    });
  }
  return { creati, collegati, dubbi: dubbi.length, errori };
}
