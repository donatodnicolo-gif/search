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

// Cerca l'anagrafica per nome: match esatto (case-insensitive) se c'è,
// altrimenti l'unico risultato della ricerca, altrimenti null.
export async function cercaAnagrafica(nome: string): Promise<Anagrafica | null> {
  const risposta = (await chiamata(
    `/api/v1/partners?q=${encodeURIComponent(nome)}&perPage=10`,
  )) as { dati?: Anagrafica[] } | null;
  const dati = risposta?.dati ?? [];
  const esatta = dati.find((a) => a.nome.toLowerCase() === nome.toLowerCase());
  if (esatta) return esatta;
  return dati.length === 1 ? dati[0] : null;
}
