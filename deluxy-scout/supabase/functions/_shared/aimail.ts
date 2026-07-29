// Invio di una mail PASSANDO DA AI MAIL, invece che dall'SMTP di Scout.
//
// Perché esiste: mandando in SMTP diretto la mail parte davvero, ma **di quella
// mail non resta traccia nella casella di chi l'ha scritta** — SMTP consegna e
// basta, mettere la copia in «Inviata» è un'operazione IMAP separata. Risultato:
// il venditore scriveva da Scout e in Outlook/AI Mail non trovava niente.
//
// AI Mail quella casella ce l'ha collegata in IMAP: il suo `POST /api/v1/invia`
// spedisce **e** deposita la copia nella cartella «Inviata» del server, oltre a
// registrarla fra le sue mail. Quindi si manda da lì, e l'SMTP di Scout resta
// come ripiego per chi in AI Mail non ha una casella.
//
// Chiave: secret `MAIL_API_TOKEN` (o cassaforte Hub), la stessa che usa già la
// Edge Function `mail` per leggere la posta. L'header `x-utente` è l'email
// dell'utente Scout loggato: è la casella su cui si opera.
import { chiaveHub } from './chiavi.ts';

const BASE = Deno.env.get('MAIL_URL') ?? 'https://deluxy-mail.vercel.app';

let chiaveInMemoria: string | null | undefined;

/** La chiave API di AI Mail, cercata una volta sola per invocazione. */
export async function chiaveAiMail(): Promise<string | null> {
  if (chiaveInMemoria !== undefined) return chiaveInMemoria;
  const k = Deno.env.get('MAIL_API_TOKEN') ?? (await chiaveHub('MAIL_API_TOKEN').catch(() => null));
  chiaveInMemoria = k && k.trim() ? k.trim() : null;
  return chiaveInMemoria;
}

export interface EsitoAiMail {
  ok: boolean;
  /** Perché non è partita, in parole: finisce nell'esito per destinatario. */
  errore?: string;
  /** true = AI Mail non può servire QUESTA casella (nessun account collegato).
   *  Chi chiama deve smettere di riprovare per gli altri destinatari e passare
   *  all'SMTP: insistere sarebbe una chiamata di rete buttata per ognuno. */
  cassettaAssente?: boolean;
}

/**
 * Manda una mail dalla casella `casella` (email dell'utente) a UN destinatario.
 *
 * ⚠️ Si mandano **tutt'e due le versioni**, HTML e testo, e non è ridondanza:
 * `corpoHtml` lo capisce solo AI Mail aggiornata. Mandando il solo HTML, una
 * AI Mail non ancora deployata lo infilerebbe nel testo semplice e al cliente
 * arriverebbe «<p>Gentile…». Così, qualunque versione risponda, la mail è
 * leggibile: la peggiore delle ipotesi è che perda la formattazione.
 */
export async function inviaViaAiMail(
  chiave: string,
  casella: string,
  m: { a: string; oggetto: string; html: string; testo: string },
): Promise<EsitoAiMail> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/invia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': chiave, 'x-utente': casella },
      body: JSON.stringify({ a: m.a, oggetto: m.oggetto, corpo: m.testo, corpoHtml: m.html }),
    });
  } catch (e) {
    return { ok: false, errore: `AI Mail non raggiungibile: ${String((e as Error)?.message ?? e)}` };
  }
  const dati = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (res.ok && (dati as { ok?: boolean }).ok) return { ok: true };

  const messaggio = String(
    (dati as { errore?: string; messaggio?: string }).errore ??
      (dati as { messaggio?: string }).messaggio ??
      `HTTP ${res.status}`,
  );
  // 404 = l'utente non esiste in AI Mail; il messaggio esplicito = c'è ma non
  // ha una casella collegata. In entrambi i casi non è un guasto passeggero.
  const cassettaAssente = res.status === 404 || /nessuna casella|utente/i.test(messaggio);
  return { ok: false, errore: messaggio, cassettaAssente };
}
