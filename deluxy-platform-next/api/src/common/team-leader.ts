// ============================================================
// L'AMBITO DEL TEAM LEADER (27/08/2026, segnalato dall'utente)
// ------------------------------------------------------------
// «renny705@gmail.com dovrebbe essere un valet team leader ma non ha le stesse
// funzionalità di ora dei team leader.»
//
// ⚠️ La configurazione c'era e non la leggeva NESSUNO. In archivio ci sono 20
// valet con `isTeamLeader = true` e le loro province di responsabilità scritte
// in `teamLeaderProvinces` — CASSOLI RENATO ne ha 11 — ma:
//   · le CONSEGNE non avevano nessuno scope da team leader: `roleFilter` dava
//     al valet solo le proprie, punto;
//   · le ATTIVITÀ ce l'avevano, ma guardavano `valet.provinces` (le province
//     in cui LUI lavora), non `teamLeaderProvinces` (quelle di cui RISPONDE) —
//     due cose diverse che per alcuni combaciano e per altri no;
//   · `teamLeaderPartners` e `teamLeaderExcludedPartners` non erano letti da
//     nessuna parte.
//
// È la trappola delle regole importate ma mai applicate: «l'ho importata» non
// vuol dire «funziona». Qui la regola si scrive UNA VOLTA e la usano tutti.
// ============================================================

/** Un elenco di id salvato come JSON in una colonna di testo. */
export function idDaJson(testo: string | null | undefined): string[] {
  if (!testo) return [];
  try {
    const v = JSON.parse(testo);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}

export type ValetPerAmbito = {
  id: string;
  isTeamLeader?: boolean | null;
  teamLeaderProvinces?: string | null;
  teamLeaderPartners?: string | null;
  teamLeaderExcludedPartners?: string | null;
  provinces?: { provinceId: string }[];
};

/**
 * Che cosa vede questo valet.
 *
 * - Non è team leader → **solo le proprie**. Nessun cambiamento.
 * - È team leader → le consegne dei valet che lavorano nelle **sue province di
 *   responsabilità** (`teamLeaderProvinces`; se vuoto, ripiego sulle province in
 *   cui lavora lui, che è quello che faceva prima la pagina Attività), più
 *   sempre le proprie.
 *   - Se ha una lista di **partner**, l'ambito si stringe a quelli.
 *   - I partner **esclusi** escono comunque, anche se rientrerebbero.
 *
 * ⚠️ Le proprie ci sono SEMPRE, anche se cadono fuori dall'ambito: un capo che
 * non vede il proprio giro sarebbe un capo che non può lavorare.
 *
 * Torna `null` quando non c'è niente da restringere oltre al solito (cioè: non
 * è team leader), così chi chiama tiene il comportamento di prima.
 */
export async function ambitoTeamLeader(
  valet: ValetPerAmbito | null | undefined,
  cercaValetDelleProvince: (provinceIds: string[]) => Promise<{ id: string }[]>,
): Promise<{
  valetIds: string[];
  /** Le province di cui risponde: servono per le consegne ANCORA SENZA VALET. */
  provinceIds: string[];
  partnerIds: string[] | null;
  partnerEsclusi: string[];
} | null> {
  if (!valet?.isTeamLeader) return null;

  const province = idDaJson(valet.teamLeaderProvinces);
  const ripiego = (valet.provinces ?? []).map((p) => p.provinceId);
  const daUsare = province.length ? province : ripiego;
  // Un team leader senza nessuna provincia non è «tutti»: è «nessuna oltre le
  // sue». Aprirgli tutto sarebbe il contrario della prudenza.
  if (!daUsare.length) {
    return { valetIds: [valet.id], provinceIds: [], partnerIds: null, partnerEsclusi: [] };
  }

  const squadra = await cercaValetDelleProvince(daUsare);
  const valetIds = [...new Set([valet.id, ...squadra.map((v) => v.id)])];
  const partnerIds = idDaJson(valet.teamLeaderPartners);
  return {
    valetIds,
    provinceIds: daUsare,
    partnerIds: partnerIds.length ? partnerIds : null,
    partnerEsclusi: idDaJson(valet.teamLeaderExcludedPartners),
  };
}

/**
 * IL FILTRO DI UN TEAM LEADER, in una forma sola.
 *
 * ⚠️ 28/08/2026 — Segnalato dall'utente: «il team leader Cassoli vede solo
 * Casati e Malia». Misurato sul giorno vero: delle **8 consegne attive** ne
 * vedeva **2**. Le altre **6 erano SENZA VALET** — e `valetId: { in: [...] }`
 * **scarta i NULL**. Cioè gli sparivano proprio quelle **da assegnare**, che
 * sono il suo lavoro: un capo squadra che vede solo il lavoro già distribuito
 * non può distribuirlo.
 *
 * Quindi: le consegne della sua squadra, **più** quelle ancora senza valet
 * nelle sue province di responsabilità.
 *
 * ⚠️ Una consegna senza valet **e senza provincia riconosciuta** resta fuori:
 * non si sa di chi sia. Non si perde — l'ufficio le vede tutte — ma non si
 * attribuisce a un capo a indovinare.
 *
 * ⚠️ Torna un `AND`, non chiavi sciolte: i filtri della richiesta
 * (`?partnerId=`) assegnano le proprie chiavi sullo stesso oggetto, e una
 * chiave sciolta verrebbe **sovrascritta** — un team leader potrebbe chiedere
 * proprio il partner da cui è escluso. Dentro `AND` non si può schiacciare.
 */
export function filtroDaAmbito(ambito: {
  valetIds: string[];
  provinceIds: string[];
  partnerIds: string[] | null;
  partnerEsclusi: string[];
}): Record<string, unknown> {
  const pezzi: Record<string, unknown>[] = [
    {
      OR: [
        { valetId: { in: ambito.valetIds } },
        ...(ambito.provinceIds.length
          ? [{ valetId: null, provinceId: { in: ambito.provinceIds } }]
          : []),
      ],
    },
  ];
  if (ambito.partnerIds) {
    pezzi.push({
      partnerId: { in: ambito.partnerIds.filter((x) => !ambito.partnerEsclusi.includes(x)) },
    });
  } else if (ambito.partnerEsclusi.length) {
    pezzi.push({ partnerId: { notIn: ambito.partnerEsclusi } });
  }
  return { AND: pezzi };
}
