import { chiaveApp } from "./chiavi-app";

// L'invio passa da AI Mail (POST /api/v1/invia): il canale SMTP appartiene a
// quell'app (standard §5.3), e passando da lì la copia finisce negli
// «Inviati» della casella vera — una mail del CRM resta consultabile dove si
// consulta tutta la posta. Il CRM tiene solo il proprio registro (MailInviata).

const BASE_DEFAULT = "https://deluxy-mail.vercel.app";

export type EsitoInvio = { ok: true } | { ok: false; errore: string };

export async function configurazioneMail(): Promise<{ pronta: boolean; utente: string | null; manca: string[] }> {
  const [token, utente] = await Promise.all([chiaveApp("MAIL_API_KEY"), chiaveApp("MAIL_UTENTE")]);
  const manca: string[] = [];
  if (!token) manca.push("MAIL_API_KEY");
  if (!utente) manca.push("MAIL_UTENTE");
  return { pronta: manca.length === 0, utente, manca };
}

export async function inviaMail(dati: {
  a: string;
  oggetto: string;
  corpo: string;
  cc?: string;
}): Promise<EsitoInvio> {
  const base = ((await chiaveApp("MAIL_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
  const config = await configurazioneMail();
  if (!config.pronta) {
    return {
      ok: false,
      errore:
        `Invio non configurato: manca ${config.manca.join(" e ")}. ` +
        `Il token si genera da AI Mail → Impostazioni App → «Token API di AI Mail».`,
    };
  }
  const token = (await chiaveApp("MAIL_API_KEY"))!;

  try {
    const res = await fetch(`${base}/api/v1/invia`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        "x-utente": config.utente!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ a: dati.a, cc: dati.cc, oggetto: dati.oggetto, corpo: dati.corpo }),
      signal: AbortSignal.timeout(45_000), // l'SMTP vero può metterci qualche secondo
    });
    const corpo = (await res.json().catch(() => null)) as { ok?: boolean; messaggio?: string } | null;
    if (!res.ok || !corpo?.ok) {
      return { ok: false, errore: corpo?.messaggio ?? `AI Mail risponde ${res.status}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, errore: "AI Mail non risponde: la mail non è partita." };
  }
}

// AI Mail raggiungibile e col token giusto? Per la pagina Impostazioni.
// /api/v1/caselle chiede la sola x-api-key: è la prova più leggera che esista.
export async function statoMail(): Promise<{ raggiungibile: boolean; autenticato: boolean }> {
  const base = ((await chiaveApp("MAIL_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
  const token = await chiaveApp("MAIL_API_KEY");
  try {
    // Anche un 401 dimostra che l'app c'è: la raggiungibilità non richiede il token.
    const res = await fetch(`${base}/api/v1/caselle`, {
      headers: token ? { "x-api-key": token } : {},
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return { raggiungibile: true, autenticato: Boolean(token) && res.ok };
  } catch {
    return { raggiungibile: false, autenticato: false };
  }
}
