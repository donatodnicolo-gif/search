// Il registro avvisa DELUXY SCOUT (l'app commerciale) quando un'azienda nasce
// o cambia stato.
//
// Il verso opposto esisteva già: Scout, creando un negozio, chiama la nostra
// azione `upsert_partner`. Mancava questa metà — e senza, un'azienda creata qui
// dentro in Scout non compariva mai: bisognava importarla da terminale o
// rifarla a mano (segnalato il 29/07/2026, caso «Flowers and More»).
//
// ⚠️ **BEST-EFFORT, sempre.** Se Scout è irraggiungibile, la chiave manca o la
// risposta è un errore, qui non succede niente: il partner è già salvato e il
// salvataggio non deve fallire per colpa di un'altra app. Il prezzo è che una
// notifica persa resta persa, quindi Scout non può contare solo su questa —
// il legame vero è `places.anagrafiche_id`, e una risincronizzazione può sempre
// ripassare da capo (la funzione di là è idempotente).
//
// ⚠️ **Nessun ciclo.** Scout, ricevendo questa chiamata, non ci richiama: la
// sua `partner` scrive e basta. Se un giorno lo facesse, servirebbe un segnale
// di provenienza — perché due app che si avvisano a vicenda a ogni scrittura si
// rimbalzano all'infinito.

const URL_COMMERCIALE = (
  process.env.COMMERCIALE_URL || "https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1"
).replace(/\/$/, "");

export type PartnerDaNotificare = {
  id: string;
  nome: string;
  stato?: string | null;
  citta?: string | null;
  provincia?: string | null;
  indirizzo?: string | null;
  categoria?: string | null;
  account?: string | null;
  interessi?: string[] | null;
};

/** Configurata = c'è la chiave con cui Scout ci riconosce. */
export function commercialeCollegato(): boolean {
  return Boolean(process.env.COMMERCIALE_API_KEY);
}

/**
 * Dice a Scout che questo partner esiste. Torna sempre, non lancia mai.
 *
 * `creato: false` nella risposta significa che di là c'era già — ed è il caso
 * normale quando si salva la seconda volta, non un problema.
 */
export async function notificaCommerciale(
  p: PartnerDaNotificare,
): Promise<{ ok: boolean; motivo?: string }> {
  const chiave = process.env.COMMERCIALE_API_KEY;
  if (!chiave) return { ok: false, motivo: "COMMERCIALE_API_KEY non configurata" };

  try {
    const res = await fetch(`${URL_COMMERCIALE}/partner`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chiave },
      body: JSON.stringify({
        anagraficheId: p.id,
        nome: p.nome,
        stato: p.stato ?? null,
        citta: p.citta ?? null,
        provincia: p.provincia ?? null,
        indirizzo: p.indirizzo ?? null,
        categoria: p.categoria ?? null,
        account: p.account ?? null,
        interessi: p.interessi ?? null,
      }),
      cache: "no-store",
      // Il salvataggio dell'utente non aspetta un'altra app più di così.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, motivo: `HTTP ${res.status} ${t.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "non raggiungibile" };
  }
}
