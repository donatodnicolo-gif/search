// L'invio di posta passa da AI Mail (POST /api/v1/invia), come per il CRM:
// il canale SMTP appartiene a quell'app, e la copia finisce negli «Inviati»
// della casella vera — il rapporto al commercialista resta consultabile dove
// si consulta tutta la posta.
//
// Serve MAIL_API_KEY (il Token API di AI Mail: Impostazioni App → «Token API
// di AI Mail», valore unico per tutte le app) e MAIL_UTENTE (l'email della
// casella da cui si spedisce). Senza, la pagina lo dichiara e non spedisce.

const MAIL_URL_PREDEFINITO = "https://deluxy-mail.vercel.app";

export type EsitoInvio = { ok: true } | { ok: false; errore: string };

export function postaConfigurata(): { pronta: boolean; manca: string[] } {
  const manca: string[] = [];
  if (!process.env.MAIL_API_KEY) manca.push("MAIL_API_KEY");
  if (!process.env.MAIL_UTENTE) manca.push("MAIL_UTENTE");
  return { pronta: manca.length === 0, manca };
}

export async function inviaMail(dati: {
  a: string;
  oggetto: string;
  corpo: string;
  corpoHtml?: string;
}): Promise<EsitoInvio> {
  const config = postaConfigurata();
  if (!config.pronta) {
    return {
      ok: false,
      errore: `Invio non configurato: manca ${config.manca.join(" e ")}. Il token si copia da AI Mail → Impostazioni App → «Token API di AI Mail».`,
    };
  }
  const base = (process.env.MAIL_URL || MAIL_URL_PREDEFINITO).replace(/\/$/, "");

  try {
    const risposta = await fetch(`${base}/api/v1/invia`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.MAIL_API_KEY!,
        "x-utente": process.env.MAIL_UTENTE!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        a: dati.a,
        oggetto: dati.oggetto,
        corpo: dati.corpo,
        corpoHtml: dati.corpoHtml,
      }),
      signal: AbortSignal.timeout(45_000), // l'SMTP vero può metterci qualche secondo
    });
    const corpo = (await risposta.json().catch(() => null)) as { ok?: boolean; errore?: string; messaggio?: string } | null;
    if (!risposta.ok || !corpo?.ok) {
      return { ok: false, errore: corpo?.errore ?? corpo?.messaggio ?? `AI Mail risponde ${risposta.status}.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, errore: "AI Mail non risponde: la mail non è partita." };
  }
}
