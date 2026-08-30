// L'invio di posta passa da AI Mail (POST /api/v1/invia), come per il CRM:
// il canale SMTP appartiene a quell'app, e la copia finisce negli «Inviati»
// della casella vera — il rapporto al commercialista resta consultabile dove
// si consulta tutta la posta.
//
// Servono MAIL_API_KEY (il Token API di AI Mail) e MAIL_UTENTE (la casella da
// cui si spedisce). ⭐ Dal 30/08/2026 NON si cercano solo fra le variabili
// d'ambiente: si leggono con `credenziale()`, che guarda prima l'ambiente e poi
// la **cassaforte del Hub** (progetto `personale`). Così la chiave si incolla
// una volta sola, dove la si ruota, invece che in una variabile per ogni app.

import { credenziale, type Origine } from "./credenziali";

const MAIL_URL_PREDEFINITO = "https://deluxy-mail.vercel.app";

export type EsitoInvio = { ok: true } | { ok: false; errore: string };

// Tre stati distinti, non un booleano: «la cassaforte non risponde» non è «la
// chiave non c'è», e mandano l'operatore a fare due cose diverse.
export type StatoPosta =
  | { pronta: true; origine: Origine }
  | { pronta: false; motivo: "assente"; manca: string[] }
  | { pronta: false; motivo: "cassaforte"; dettaglio: string };

export async function postaConfigurata(): Promise<StatoPosta> {
  const [chiave, utente] = await Promise.all([
    credenziale("MAIL_API_KEY"),
    credenziale("MAIL_UTENTE"),
  ]);

  for (const esito of [chiave, utente]) {
    if (esito.stato === "cassaforte-irraggiungibile") {
      return { pronta: false, motivo: "cassaforte", dettaglio: esito.motivo };
    }
  }

  const manca: string[] = [];
  if (chiave.stato !== "trovata") manca.push("il token di AI Mail");
  if (utente.stato !== "trovata") manca.push("la casella da cui spedire");
  if (manca.length > 0) return { pronta: false, motivo: "assente", manca };

  // La fonte risolta si dichiara: serve a smascherare il valore fantasma (una
  // variabile d'ambiente residua che vince su una cassaforte appena aggiornata).
  return { pronta: true, origine: (chiave as { origine: Origine }).origine };
}

export async function inviaMail(dati: {
  a: string;
  oggetto: string;
  corpo: string;
  corpoHtml?: string;
}): Promise<EsitoInvio> {
  const [chiave, utente] = await Promise.all([
    credenziale("MAIL_API_KEY"),
    credenziale("MAIL_UTENTE"),
  ]);
  if (chiave.stato !== "trovata" || utente.stato !== "trovata") {
    const dettaglio =
      chiave.stato === "cassaforte-irraggiungibile"
        ? chiave.motivo
        : "il token di AI Mail non è impostato, né qui né nella cassaforte del Hub.";
    return { ok: false, errore: `La mail non è partita: ${dettaglio}` };
  }

  const base = (process.env.MAIL_URL || MAIL_URL_PREDEFINITO).replace(/\/$/, "");

  try {
    const risposta = await fetch(`${base}/api/v1/invia`, {
      method: "POST",
      headers: {
        "x-api-key": chiave.valore,
        "x-utente": utente.valore,
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
