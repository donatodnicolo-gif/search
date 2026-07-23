// Client del registro centralizzato Deluxy Anagrafiche (deluxy-anagrafiche, porta 3060).
// Sola lettura: questa app NON scrive anagrafiche (scrive solo la piattaforma consegne).
// Config nel .env: ANAGRAFICHE_URL + ANAGRAFICHE_API_KEY (chiave "deluxy-partner").
//
// Tutte le funzioni sono best-effort: se il registro è spento o non configurato
// tornano null e la scheda partner continua a funzionare con i soli dati locali.

export type ContattoAnagrafica = {
  id: string;
  ruolo: string | null;
  nome: string | null;
  telefono: string | null;
  email: string | null;
};

// Blocco finanziario del registro (dati amministrativi/di pagamento). Il registro
// lo espone come oggetto annidato "datiFinanziari"; qui interessano i campi che
// la riconciliazione può alimentare.
export type DatiFinanziari = {
  pec: string | null;
  codiceSdi: string | null;
  iban: string | null;
  banca: string | null;
  metodoPagamento: string | null;
  condizioniPagamento: string | null;
  amministrazioneNome: string | null;
  amministrazioneTelefono: string | null;
  amministrazioneEmail: string | null;
};

export type Anagrafica = {
  id: string;
  nome: string;
  ragioneSociale: string | null;
  categoria: string;
  stato: string;
  citta: string | null;
  provincia: string | null;
  regione: string | null;
  indirizzo: string | null;
  email: string | null;
  telefono: string | null;
  pIva: string | null;
  codiceFiscale: string | null;
  datiFinanziari: DatiFinanziari | null;
  account: string | null;
  contatti: ContattoAnagrafica[];
  platformId: string | null;
  fonte: string;
};

export function urlAnagrafiche(): string {
  return process.env.ANAGRAFICHE_URL ?? "http://localhost:3060";
}

function configurata(): boolean {
  return Boolean(process.env.ANAGRAFICHE_API_KEY);
}

async function chiamata(percorso: string): Promise<unknown | null> {
  if (!configurata()) return null;
  try {
    const res = await fetch(`${urlAnagrafiche()}${percorso}`, {
      headers: { "x-api-key": process.env.ANAGRAFICHE_API_KEY! },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // registro spento o non raggiungibile: si prosegue senza
  }
}

// Risolve l'anagrafica dall'id del registro (join affidabile una volta
// collegato l'`anagraficaId`). È la "lingua comune di id" tra le app.
export async function anagraficaPerId(id: string): Promise<Anagrafica | null> {
  return (await chiamata(`/api/v1/partners/${encodeURIComponent(id)}`)) as Anagrafica | null;
}

// Cerca l'anagrafica per nome: match esatto (case-insensitive) se c'è,
// altrimenti l'unico risultato della ricerca, altrimenti null. Fallback quando
// il partner non è ancora collegato per id.
export async function cercaAnagrafica(nome: string): Promise<Anagrafica | null> {
  const risposta = (await chiamata(
    `/api/v1/partners?q=${encodeURIComponent(nome)}&perPage=10`,
  )) as { dati?: Anagrafica[] } | null;
  const dati = risposta?.dati ?? [];
  const esatta = dati.find((a) => a.nome.toLowerCase() === nome.toLowerCase());
  if (esatta) return esatta;
  return dati.length === 1 ? dati[0] : null;
}

// Sceglie, fra i contatti del registro, quello amministrativo: prima chi ha un
// ruolo di amministrazione/contabilità, poi il primo con una email (serve per
// mandargli solleciti e pro-forma).
const RUOLO_AMM = /ammin|contab|fattur|account|paghe|segret/i;

export function contattoAmministrativo(a: Anagrafica | null): ContattoAnagrafica | null {
  if (!a) return null;
  const conEmail = a.contatti.filter((c) => c.email);
  return (
    conEmail.find((c) => RUOLO_AMM.test(c.ruolo ?? "")) ??
    a.contatti.find((c) => RUOLO_AMM.test(c.ruolo ?? "")) ??
    conEmail[0] ??
    null
  );
}

// Risolve preferendo il collegamento per id; se assente ripiega sul nome.
export async function risolviAnagrafica(
  nome: string,
  anagraficaId?: string | null,
): Promise<Anagrafica | null> {
  if (anagraficaId) {
    const perId = await anagraficaPerId(anagraficaId);
    if (perId) return perId;
  }
  return cercaAnagrafica(nome);
}

// ————— Scrittura sul registro (riconciliazione confermata dall'operatore) —————
// Il registro è la fonte di verità e accetta scritture multi-sorgente con merge
// per campo (i campi curati dal team restano bloccati). Questa app scrive SOLO
// su conferma esplicita per record, con una chiave DEDICATA di scrittura
// (ANAGRAFICHE_WRITE_KEY, diversa da quella di lettura). Senza chiave la
// scrittura è disattivata e la conferma lo segnala.

// Chiave di scrittura: quella dedicata se c'è, altrimenti la chiave dell'app
// (dal 20/07/2026 `deluxy-partner` è stata ruotata a scrittura piena).
export function chiaveScrittura(): string | undefined {
  return process.env.ANAGRAFICHE_WRITE_KEY || process.env.ANAGRAFICHE_API_KEY;
}

export function scritturaAnagraficheAttiva(): boolean {
  return Boolean(chiaveScrittura());
}

// Campi anagrafici che la riconciliazione FIC può proporre al registro.
// I campi finanziari (pec, codiceSdi, amministrazione*) il registro li accetta
// anche "piatti" e li smista nel blocco datiFinanziari (merge per campo, asOf).
export type CampiAnagrafica = Partial<{
  pIva: string;
  codiceFiscale: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  email: string;
  telefono: string;
  ragioneSociale: string;
  pec: string;
  codiceSdi: string;
  iban: string;
  banca: string;
  amministrazioneNome: string;
  amministrazioneTelefono: string;
  amministrazioneEmail: string;
  // Stato analisi del registro: è FINANCE la sorgente (campo "Cliente per
  // l'anno"). Il registro accetta sia gli slug (pp/nuovo/dismesso) sia le
  // etichette che usiamo qui ("P.P.", "Nuovo", "Dismesso").
  statoAnalisi: string;
}>;

// "Cliente per l'anno" di FINANCE → stato analisi del registro.
// P.P. = pari perimetro (c'era anche l'anno scorso), Nuovo = entrato
// quest'anno, Dismesso = uscito. Vuoto = non analizzato: non si scrive nulla.
export function statoAnalisiDaClienteAnno(clienteAnno: string | null | undefined): string | null {
  const v = (clienteAnno ?? "").trim().toLowerCase().replace(/\./g, "");
  if (v === "pp") return "pp";
  if (v === "nuovo") return "nuovo";
  if (v === "dismesso") return "dismesso";
  return null;
}

// Aggiorna un partner nel registro (PATCH per id) con i campi confermati.
// `asOf` = quando il dato era vero (ora): il merge applica il più fresco.
export async function aggiornaAnagrafica(
  anagraficaId: string,
  campi: CampiAnagrafica
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const key = chiaveScrittura();
  if (!key) {
    return { ok: false, errore: "Scrittura su Anagrafiche non configurata (manca ANAGRAFICHE_WRITE_KEY)." };
  }
  const puliti = Object.fromEntries(
    Object.entries(campi).filter(([, v]) => v != null && String(v).trim() !== "")
  );
  if (Object.keys(puliti).length === 0) {
    return { ok: false, errore: "Nessun campo da aggiornare." };
  }
  try {
    const res = await fetch(`${urlAnagrafiche()}/api/v1/partners/${encodeURIComponent(anagraficaId)}`, {
      method: "PATCH",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...puliti,
        sistema: "deluxy-partner",
        fonte: "deluxy-partner",
        asOf: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, errore: `Registro ha risposto ${res.status}: ${t.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errore: `Registro non raggiungibile: ${(e as Error).message}` };
  }
}

// Crea (o aggancia, se già esiste per nome+città) un partner nel registro con i
// dati osservati, via POST /api/v1/partners (upsert-merge). Ritorna l'id del
// record nel registro, da collegare al partner Deluxy (anagraficaId).
export async function creaAnagrafica(opts: {
  nome: string;
  ragioneSociale?: string | null;
  citta?: string | null;
  provincia?: string | null;
  categoria?: string | null;
  idEsterno: string; // partnerId Deluxy: identità stabile per non duplicare
  campi?: CampiAnagrafica;
}): Promise<{ ok: true; id: string; esito: string } | { ok: false; errore: string }> {
  const key = chiaveScrittura();
  if (!key) return { ok: false, errore: "Scrittura su Anagrafiche non configurata (manca ANAGRAFICHE_WRITE_KEY)." };
  if (!opts.nome?.trim()) return { ok: false, errore: "Nome obbligatorio per creare l'anagrafica." };

  const campi = Object.fromEntries(
    Object.entries(opts.campi ?? {}).filter(([, v]) => v != null && String(v).trim() !== "")
  );
  // segnalazione di provenienza (le note del registro sono additive)
  const oggi = new Date().toLocaleDateString("it-IT");
  const notaProvenienza = `Anagrafica creata da Deluxy Partner — riconciliazione con Fatture in Cloud (${oggi}).`;
  try {
    const res = await fetch(`${urlAnagrafiche()}/api/v1/partners`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: opts.nome.trim(),
        ...(opts.ragioneSociale ? { ragioneSociale: opts.ragioneSociale } : {}),
        ...(opts.citta ? { citta: opts.citta } : {}),
        ...(opts.provincia ? { provincia: opts.provincia } : {}),
        ...(opts.categoria ? { categoria: opts.categoria } : {}),
        ...campi,
        note: notaProvenienza,
        sistema: "deluxy-partner",
        idEsterno: opts.idEsterno,
        fonte: "deluxy-partner",
        asOf: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, errore: `Registro ha risposto ${res.status}: ${t.slice(0, 160)}` };
    }
    const j = await res.json();
    if (!j?.id) return { ok: false, errore: "Il registro non ha restituito l'id del record." };
    return { ok: true, id: j.id, esito: j.esito ?? "ok" };
  } catch (e) {
    return { ok: false, errore: `Registro non raggiungibile: ${(e as Error).message}` };
  }
}
