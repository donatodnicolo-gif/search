// Il ponte verso Budgets: quando qui si PUBBLICA una persona, la si propone
// anche al roster di pianificazione (deciso dall'utente il 24/08: «quando
// pubblico qui una persona portala anche dentro budget»).
//
// Regole del ponte:
// - Budgets resta il proprietario del suo roster: noi PROPONIAMO (POST), mai
//   aggiorniamo o cancelliamo; se la persona là c'è già, non si tocca.
// - Il ponte non deve MAI bloccare la creazione locale: timeout corto, ogni
//   errore diventa un messaggio a schermo, la persona qui nasce comunque.
// - Serve BUDGETS_WRITE_KEY (chiave emessa da Budgets con scope scrittura);
//   senza, si crea solo qui e lo si dice.

import { credenziale } from "./credenziali";

const BUDGETS_URL_PREDEFINITO = "https://deluxy-budgets.vercel.app";

export type EsitoBudgets = { ok: boolean; messaggio: string };

export async function proponiPersonaABudgets(persona: {
  nome: string;
  ruolo?: string;
  team?: string | null;
}): Promise<EsitoBudgets> {
  // La chiave si cerca prima nell'ambiente, poi nella cassaforte del Hub.
  const esito = await credenziale("BUDGETS_WRITE_KEY");
  if (esito.stato !== "trovata") {
    return {
      ok: false,
      messaggio:
        esito.stato === "cassaforte-irraggiungibile"
          ? `La persona esiste solo qui: ${esito.motivo}`
          : "La chiave di scrittura di Budgets non è impostata: la persona esiste solo qui.",
    };
  }
  const chiave = esito.valore;
  const base = process.env.BUDGETS_URL || BUDGETS_URL_PREDEFINITO;

  try {
    const risposta = await fetch(`${base}/api/v1/persone`, {
      method: "POST",
      headers: { "x-api-key": chiave, "content-type": "application/json" },
      body: JSON.stringify({
        nome: persona.nome,
        ruolo: persona.ruolo || undefined,
        team: persona.team || undefined,
      }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const dati = (await risposta.json().catch(() => ({}))) as {
      creata?: boolean;
      motivo?: string;
      anno?: number;
      avvisi?: string[];
      completati?: string[];
      errore?: string;
    };

    if (risposta.ok && dati.creata) {
      const avvisi = dati.avvisi?.length ? ` (${dati.avvisi.join(" ")})` : "";
      return {
        ok: true,
        messaggio: `Proposta anche al roster ${dati.anno ?? ""} di Budgets: là restano da completare tipo, importo e contributi.${avvisi}`,
      };
    }
    if (risposta.ok && dati.motivo === "gia_presente") {
      // Ricongiunta lato Budgets: la riga esistente non si sovrascrive, ma i
      // suoi campi VUOTI si completano con la proposta (e si dice quali).
      return {
        ok: true,
        messaggio:
          dati.completati && dati.completati.length > 0
            ? `In Budgets c'era già (roster ${dati.anno ?? ""}): ricongiunta — completati i campi vuoti (${dati.completati.join(", ")}), il resto non si tocca.`
            : `In Budgets c'è già una persona con questo nome (roster ${dati.anno ?? ""}): aveva già tutto, non è stata toccata.`,
      };
    }
    return {
      ok: false,
      messaggio: `Budgets ha rifiutato la proposta (${risposta.status}${dati.errore ? `: ${dati.errore}` : ""}).`,
    };
  } catch {
    return { ok: false, messaggio: "Budgets non ha risposto entro 4 secondi." };
  }
}
