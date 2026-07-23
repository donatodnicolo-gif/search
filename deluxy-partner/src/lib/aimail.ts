// Client di AI Mail (deluxy-mail) per vedere, dalla scheda partner, la posta di
// quel cliente. L'associazione mail↔cliente NON si rifà qui: è quella di AI Mail
// (indice di Anagrafiche, email esatte + domini non generici), che qui si
// interroga con `?cliente=<nome>` su /api/v1/messaggi.
//
// Config nel .env / su Vercel:
//   MAIL_URL       (default https://deluxy-mail.vercel.app)
//   MAIL_API_KEY   token API di AI Mail (Impostazioni App → API)
//   MAIL_UTENTE    email di login dell'utente AI Mail su cui leggere la casella
//
// Best-effort come il client Anagrafiche: se non è configurato o AI Mail non
// risponde, la scheda partner continua a funzionare.

export type MailCliente = {
  id: string;
  da: string;
  email: string;
  oggetto: string;
  data: string;
  direzione: string;
  anteprima: string;
  letto: boolean;
  allegati: number;
};

export type EsitoMail =
  | { stato: "ok"; cliente: { id: string; nome: string } | null; messaggi: MailCliente[] }
  | { stato: "non-configurato" }
  | { stato: "non-cliente" }
  | { stato: "errore"; messaggio: string };

export function urlAiMail(): string {
  return (process.env.MAIL_URL || "https://deluxy-mail.vercel.app").replace(/\/$/, "");
}

export function aiMailConfigurata(): boolean {
  return Boolean(process.env.MAIL_API_KEY && process.env.MAIL_UTENTE);
}

/** Link alla singola mail dentro AI Mail. */
export function linkMessaggio(id: string): string {
  return `${urlAiMail()}/messaggio/${id}`;
}

/** Come chiamare il cliente parlando con AI Mail: se il partner è collegato al
 *  registro si usa l'id (join sicuro); altrimenti il nome, ripulito dalla
 *  ragione sociale fra parentesi ("AMIR (LA BOTTEGA … SRLS)" → "AMIR"), che qui
 *  è una convenzione di FINANCE e nel registro non esiste. */
export function riferimentoCliente(nome: string, anagraficaId?: string | null): string {
  if (anagraficaId) return anagraficaId;
  return nome.replace(/\s*\(.*$/, "").trim() || nome;
}

/** La posta del cliente (ultimi 12 mesi), eventualmente filtrata per testo. */
export async function mailDelCliente(
  riferimento: string,
  opzioni: { q?: string; limite?: number } = {},
): Promise<EsitoMail> {
  if (!aiMailConfigurata()) return { stato: "non-configurato" };

  const p = new URLSearchParams({
    cliente: riferimento,
    limite: String(opzioni.limite ?? 15),
    direzione: "tutte",
  });
  if (opzioni.q) p.set("q", opzioni.q);

  try {
    const res = await fetch(`${urlAiMail()}/api/v1/messaggi?${p}`, {
      headers: {
        "x-api-key": process.env.MAIL_API_KEY as string,
        "x-utente": process.env.MAIL_UTENTE as string,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { stato: "non-cliente" };
    if (!res.ok) return { stato: "errore", messaggio: `AI Mail ha risposto ${res.status}.` };
    const dati = (await res.json()) as {
      cliente: { id: string; nome: string } | null;
      messaggi: MailCliente[];
    };
    return { stato: "ok", cliente: dati.cliente, messaggi: dati.messaggi ?? [] };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { stato: "errore", messaggio: m.slice(0, 120) };
  }
}
