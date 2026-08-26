// IL NEGOZIO NEL REGISTRO ANAGRAFICHE, dal lato server (26/08/2026).
//
// Serve all'AUTO-qualifica delle richieste web (`_shared/autoqualifica.ts`):
// quando una richiesta diventa trattativa da sola, l'azienda con cui stiamo
// per trattare deve esistere anche nel registro delle anagrafiche B2B — che è
// la sua casa — e non solo dentro Scout.
//
// ⚠️ Duplica IN PICCOLO `assicuraNegozioNelRegistro` di `lib/db.ts` (codice
// dell'app, non importabile da Deno senza portarsi dietro l'alias `@/`):
// stessa regola in tre passi. Se cambia la regola, vanno cambiati tutti e due —
// come già succede per l'estrazione dei dati in `autoqualifica.ts`.
import { chiaveHub } from './chiavi.ts';

const BASE = Deno.env.get('ANAGRAFICHE_URL') ?? 'https://deluxy-anagrafiche.vercel.app';

export type EsitoRegistro = {
  ok: boolean;
  reason?: string;
  /** `creato`/`merged` li dice il registro; `gia_presente` lo dice Scout. */
  esito?: 'creato' | 'merged' | 'gia_presente' | null;
  id?: string | null;
  nome?: string | null;
};

// deno-lint-ignore no-explicit-any
type Admin = any;

function normalizza(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').trim();
}

/**
 * La città della scheda che il registro ha GIÀ per questo nome, se ce n'è una
 * sola e compatibile. Serve a far cadere l'upsert su quella scheda invece di
 * crearne una seconda: il registro aggancia per *nome + città*, e quando la
 * città che gli mandiamo è vuota cerca fra le anagrafiche **senza** città.
 *
 * ⚠️ La città NON si passa come filtro alla ricerca: di là è un confronto
 * esatto, e in Scout la zona è scritta «MILANO» dove il registro ha «Milano».
 * Si filtra qui, normalizzando.
 *
 * ⚠️ Cercare non è affermare: si accetta solo l'omonimo **unico e compatibile**.
 * Due omonimi senza città che li distingua non si decidono — decide il registro
 * col suo upsert.
 */
async function cittaDellaSchedaGiaPresente(
  chiave: string,
  nome: string,
  citta: string | null,
): Promise<string | null | undefined> {
  const p = new URLSearchParams({ q: nome, perPage: '25' });
  const res = await fetch(`${BASE}/api/v1/partners?${p.toString()}`, { headers: { 'x-api-key': chiave } });
  if (!res.ok) return undefined;
  const body = await res.json().catch(() => null);
  const target = normalizza(nome);
  // deno-lint-ignore no-explicit-any
  const omonimi = ((body?.dati ?? []) as any[]).filter((x) => normalizza(x?.nome) === target);
  if (!omonimi.length) return undefined;
  const c = normalizza(citta);
  if (c) {
    const stessa = omonimi.filter((x) => normalizza(x?.citta) === c);
    return stessa.length === 1 ? (stessa[0].citta ?? null) : undefined;
  }
  return omonimi.length === 1 ? (omonimi[0].citta ?? null) : undefined;
}

/**
 * **Il negozio dev'essere nel registro: se non c'è, si crea.** Tre passi, la
 * prima risposta vince:
 *   1. il posto ha già `anagrafiche_id` → c'è, non si scrive niente;
 *   2. il registro ha un'omonima con città compatibile → si scrive su quella;
 *   3. nessuna delle due → si crea, e l'id che torna aggancia il posto.
 *
 * Best-effort per contratto: la trattativa è già stata creata quando si arriva
 * qui, e un registro irraggiungibile non deve farla perdere. L'esito però torna
 * indietro e va **detto** da chi chiama, non ingoiato.
 */
export async function assicuraNegozioNelRegistro(
  admin: Admin,
  placeId: string,
  contatti?: { nome?: string | null; email?: string | null; telefono?: string | null; ruolo?: string | null }[],
): Promise<EsitoRegistro> {
  try {
    const { data: p } = await admin
      .from('places')
      .select('nome, zona, indirizzo, categoria, anagrafiche_id')
      .eq('id', placeId)
      .maybeSingle();
    if (!p) return { ok: false, reason: 'negozio_non_trovato' };
    if (p.anagrafiche_id) return { ok: true, esito: 'gia_presente', id: p.anagrafiche_id, nome: p.nome };

    const chiave = await chiaveHub('ANAGRAFICHE_PARTNER_KEY');
    if (!chiave) return { ok: false, reason: 'non_configurato' };

    let citta: string | null = p.zona ?? null;
    try {
      const daRegistro = await cittaDellaSchedaGiaPresente(chiave, p.nome, p.zona ?? null);
      if (daRegistro !== undefined) citta = daRegistro;
    } catch {
      /* lettura non riuscita: si scrive con la zona di Scout */
    }

    const payload: Record<string, unknown> = {
      sistema: 'scout',
      idEsterno: placeId,
      nome: p.nome,
      citta,
      indirizzo: p.indirizzo ?? null,
      categoria: p.categoria ?? null,
      asOf: new Date().toISOString(),
    };
    const puliti = (contatti ?? [])
      .map((c) => ({ nome: c.nome ?? null, email: c.email ?? null, telefono: c.telefono ?? null, ruolo: c.ruolo ?? null }))
      .filter((c) => c.nome || c.email || c.telefono);
    if (puliti.length) payload.contatti = puliti;

    const res = await fetch(`${BASE}/api/v1/partners`, {
      method: 'POST',
      headers: { 'x-api-key': chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, reason: `registro_${res.status}` };
    const dati = (() => {
      try {
        return JSON.parse(txt);
      } catch {
        return null;
      }
    })();
    const esito: EsitoRegistro = {
      ok: true,
      esito: dati?.esito ?? null,
      id: dati?.id ?? null,
      nome: dati?.nome ?? null,
    };
    // L'aggancio locale, così la prossima volta si risponde al passo 1 senza
    // chiedere niente a nessuno. `anagrafiche_id` ha un indice UNICO: se quella
    // scheda è già di un ALTRO posto di Scout la scrittura viene rifiutata —
    // è un doppione locale da unire, e si dichiara invece di ingoiarlo.
    if (esito.id) {
      const { error } = await admin.from('places').update({ anagrafiche_id: esito.id }).eq('id', placeId);
      if (error) {
        return { ...esito, reason: error.code === '23505' ? 'gia_agganciato_ad_altro_negozio' : `aggancio_${error.code ?? 'fallito'}` };
      }
    }
    return esito;
  } catch (e) {
    return { ok: false, reason: String((e as { message?: string })?.message ?? e).slice(0, 120) };
  }
}
