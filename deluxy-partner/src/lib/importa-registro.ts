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

/** Quali attivi non hanno ancora una scheda in FINANCE. L'aggancio è per
 *  `anagraficaId` e, per le schede nate prima del registro, per nome
 *  normalizzato: senza il secondo controllo si creerebbe un doppione di ogni
 *  partner storico. */
export async function attiviDaImportare(): Promise<AnagraficaAttiva[]> {
  const attive = await anagraficheAttive();
  if (attive.length === 0) return [];
  const partners = await prisma.partner.findMany({ select: { nome: true, anagraficaId: true } });
  const perId = new Set(partners.map((p) => p.anagraficaId).filter(Boolean));
  const perNome = new Set(partners.map((p) => norm(p.nome)));
  return attive.filter((a) => !perId.has(a.id) && !perNome.has(norm(a.nome)));
}

export type EsitoImport = { creati: string[]; collegati: string[]; errore?: string };

/** Crea in FINANCE le schede mancanti. Idempotente: quello che c'è già viene
 *  saltato, e chi combacia per nome ma non ha l'`anagraficaId` viene collegato
 *  invece che duplicato. */
export async function importaAttivi(origine: string): Promise<EsitoImport> {
  const key = ENV_KEY();
  if (!key) return { creati: [], collegati: [], errore: "Manca ANAGRAFICHE_API_KEY: il registro non è leggibile." };

  const attive = await anagraficheAttive();
  if (attive.length === 0) {
    return { creati: [], collegati: [], errore: "Il registro non ha risposto (o non ha anagrafiche attive)." };
  }

  const partners = await prisma.partner.findMany({ select: { id: true, nome: true, anagraficaId: true } });
  const perId = new Set(partners.map((p) => p.anagraficaId).filter(Boolean));
  const perNome = new Map(partners.map((p) => [norm(p.nome), p]));

  const creati: string[] = [];
  const collegati: string[] = [];

  for (const a of attive) {
    if (perId.has(a.id)) continue;
    const esistente = perNome.get(norm(a.nome));
    if (esistente) {
      // stessa azienda, scheda nata prima del registro: si aggancia
      if (!esistente.anagraficaId) {
        await prisma.partner.update({ where: { id: esistente.id }, data: { anagraficaId: a.id } });
        collegati.push(esistente.nome);
      }
      continue;
    }
    const fin = a.datiFinanziari;
    await prisma.partner.create({
      data: {
        nome: a.nome,
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
    creati.push(a.nome);
  }

  if (creati.length || collegati.length) {
    await registra({
      categoria: "partner",
      entita: "partner",
      entitaId: "import-anagrafiche",
      azione:
        `Import da Anagrafiche (${origine}): ${creati.length} schede create` +
        (collegati.length ? `, ${collegati.length} collegate a schede esistenti` : ""),
      dettaglio: [...creati, ...collegati.map((c) => `${c} (collegata)`)].join(", ").slice(0, 900),
    });
  }
  return { creati, collegati };
}
