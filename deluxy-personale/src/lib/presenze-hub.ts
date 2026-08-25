// Il cartellino vive nel Hub (timbrature, assenze: è lui la porta d'ingresso
// dove si timbra). Qui si LEGGE via GET /api/presenze — che restituisce anche
// il rapporto già impaginato dal Hub stesso: i numeri che il commercialista
// riceve sono ESATTAMENTE quelli della schermata del Cartellino, perché
// escono dalla stessa funzione là dentro.

const HUB_URL_PREDEFINITO = "https://deluxy-hub.vercel.app";

export type GiornataHub = {
  giorno: string; // "YYYY-MM-DD"
  minuti: number;
  aperto: boolean;
  conManuali: boolean;
};

export type AssenzaHub = {
  tipo: string;
  stato: string;
  dal: string;
  al: string;
  giorniNelMese: number;
  motivo: string;
};

export type RigaPresenzeHub = {
  nome: string;
  email: string;
  minuti: number;
  giornate: GiornataHub[];
  assenze: AssenzaHub[];
  giorniAssenza: number;
};

export type PresenzeMese = {
  riepilogo: {
    mese: string;
    etichettaMese: string;
    righe: RigaPresenzeHub[];
    totaleMinuti: number;
    generatoIl: string;
  };
  rapporto: { oggetto: string; testo: string; html: string };
};

export type EsitoPresenze =
  | { ok: true; dati: PresenzeMese }
  | { ok: false; messaggio: string };

export function hubConfigurato(): boolean {
  return Boolean(process.env.HUB_KEYS_TOKEN);
}

export async function presenzeDalHub(mese: string, nota?: string): Promise<EsitoPresenze> {
  const token = process.env.HUB_KEYS_TOKEN;
  if (!token) {
    return {
      ok: false,
      messaggio:
        "HUB_KEYS_TOKEN non impostato: serve un token di servizio del Hub (si emette da /chiavi → Token di servizio, con lo scope «personale»).",
    };
  }
  const base = (process.env.HUB_URL || HUB_URL_PREDEFINITO).replace(/\/$/, "");
  const parametri = new URLSearchParams({ mese });
  if (nota) parametri.set("nota", nota);

  try {
    const risposta = await fetch(`${base}/api/presenze?${parametri.toString()}`, {
      headers: { "x-api-key": token },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!risposta.ok) {
      const corpo = (await risposta.json().catch(() => ({}))) as { errore?: string };
      return { ok: false, messaggio: `Il Hub risponde ${risposta.status}${corpo.errore ? `: ${corpo.errore}` : ""}.` };
    }
    return { ok: true, dati: (await risposta.json()) as PresenzeMese };
  } catch {
    return { ok: false, messaggio: "Il Hub non ha risposto entro 8 secondi." };
  }
}
