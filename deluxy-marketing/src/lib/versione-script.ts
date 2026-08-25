import { prisma } from "./db";

// **Lo script dice chi è.**
//
// ⚠️⚠️ PERCHÉ ESISTE (25/08/2026). Le copie dello script vivono DENTRO Google
// Ads, incollate a mano una per account: l'app non le vede e non le aggiorna.
// Finché non dicevano la propria versione, «questo conto sa eseguire
// `localita`?» era una domanda senza risposta — e la si poteva rispondere solo
// accodando davvero un'operazione e guardando come andava a finire, cioè
// spendendo una modifica vera su un account vero per fare una prova.
//
// Il caso da cui nasce: `lista_negative`, `localita` ed `estensione` sono in
// `applica()` da settimane e **non sono MAI state messe in coda** (zero righe
// di quei tre tipi, misurato sul database il 25/08). Le copie incollate nei tre
// conti potevano essere di prima o di dopo, e l'unico modo di saperlo era
// fidarsi del ricordo di chi le aveva incollate.
//
// ⚠️ L'ASSENZA È LA RISPOSTA, ed è il motivo per cui questo funziona subito:
// una copia più vecchia di oggi non manda niente, e «questo conto non dichiara
// nulla» vuol dire esattamente «la sua copia è più vecchia del 25/08». Non
// serve che il vecchio script collabori — basta che il nuovo parli.
//
// ⚠️ Sta in `Impostazione`, non in una tabella nuova: il Postgres è condiviso
// fra quattordici app e una tabella in più per tre righe è un ALTER che non
// vale il suo prezzo. Stessa forma del marcatore del censimento negative
// (`negative.censimento.<conto>`), che risolve un problema gemello.
export const CHIAVE_SCRIPT = "script.esegui.";

/**
 * I tipi che la copia di OGGI sa eseguire: è lo specchio di `applica()` in
 * `scripts/google-ads-script.js`, e va tenuto allineato a mano.
 *
 * ⚠️ Serve per dire «lo script dichiara di sapere X ma l'app non glielo manda
 * mai» e soprattutto il contrario. Non decide niente: nessun'operazione viene
 * rifiutata per colpa di questa lista — avvisa, e l'avviso arriva a chi approva.
 */
export const TIPI_ESEGUIBILI_OGGI = [
  "pausa_campagna",
  "attiva_campagna",
  "budget",
  "negativa",
  "pausa_keyword",
  "attiva_keyword",
  "pausa_gruppo",
  "attiva_gruppo",
  "estensione",
  "rimuovi_estensione",
  "localita",
  "lista_negative",
  "nuovo_annuncio",
  "nuova_keyword",
  "nuova_campagna",
  "completa_campagna",
] as const;

export type DichiarazioneScript = {
  conto: string;
  versione: string;
  /** I tipi di operazione che quella copia dichiara di saper eseguire. */
  sa: string[];
  /** L'ultima volta che quella copia è passata a prendere il lavoro. */
  visto: Date;
};

/** Registra quello che una copia dello script ha dichiarato di sé. */
export async function registraDichiarazione(
  conto: string,
  versione: string,
  sa: string[]
): Promise<void> {
  const pulito = conto.trim();
  if (!pulito) return;
  const valore = JSON.stringify({
    versione: versione.trim().slice(0, 40),
    sa: sa.map((t) => t.trim()).filter(Boolean).slice(0, 40),
    visto: new Date().toISOString(),
  });
  await prisma.impostazione.upsert({
    where: { chiave: `${CHIAVE_SCRIPT}${pulito}` },
    update: { valore },
    create: { chiave: `${CHIAVE_SCRIPT}${pulito}`, valore },
  });
}

/**
 * Cosa dichiarano le copie incollate nei conti. Un conto ASSENTE dalla mappa
 * non è un conto senza script: è un conto la cui copia è più vecchia di questa
 * funzione — e va detto con queste parole, non lasciato in bianco.
 */
export async function dichiarazioniScript(): Promise<Map<string, DichiarazioneScript>> {
  const righe = await prisma.impostazione.findMany({
    where: { chiave: { startsWith: CHIAVE_SCRIPT } },
    select: { chiave: true, valore: true },
  });
  const mappa = new Map<string, DichiarazioneScript>();
  for (const r of righe) {
    const conto = r.chiave.slice(CHIAVE_SCRIPT.length);
    try {
      const d = JSON.parse(r.valore) as { versione?: string; sa?: string[]; visto?: string };
      const visto = new Date(d.visto ?? "");
      if (isNaN(visto.getTime())) continue;
      mappa.set(conto, {
        conto,
        versione: String(d.versione ?? "?"),
        sa: Array.isArray(d.sa) ? d.sa : [],
        visto,
      });
    } catch {
      // Una riga illeggibile si salta: vale come «non dichiarato», che è la
      // risposta prudente. Cancellarla toglierebbe l'unica traccia del guasto.
    }
  }
  return mappa;
}

/**
 * L'avviso da attaccare a un'operazione in coda quando la copia dello script
 * di quel conto non dichiara di saperla eseguire. `null` quando non c'è niente
 * da dire — e «non lo so» non è «va male»: si dice cosa manca, non si accusa.
 */
export function avvisoTipoNonDichiarato(
  tipo: string,
  conto: string | null | undefined,
  dichiarazione: DichiarazioneScript | undefined
): string | null {
  if (!conto) return null;
  if (!dichiarazione) {
    return (
      `La copia dello script sul conto ${conto} non dichiara la propria versione: ` +
      `è più vecchia del 25/08/2026, quindi non si sa se sappia eseguire «${tipo}». ` +
      `Se fallisce, l'errore sarà «Tipo di operazione non gestito»: si reincolla lo script e si rimette in coda.`
    );
  }
  if (dichiarazione.sa.length > 0 && !dichiarazione.sa.includes(tipo)) {
    return (
      `La copia dello script sul conto ${conto} (versione ${dichiarazione.versione}) ` +
      `NON sa eseguire «${tipo}»: dichiara ${dichiarazione.sa.join(", ")}. ` +
      `Va reincollata prima che questa operazione possa partire.`
    );
  }
  return null;
}
