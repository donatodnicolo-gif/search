/**
 * AGGANCIO DI UNA REGOLA CARNET A UNA CONSEGNA (31/08/2026, deciso dall'utente).
 *
 * La fatturazione applica lo sconto/«non fatturare» del carnet SOLO tramite
 * `Delivery.deliveryRuleId`. Le consegne importate dal legacy ce l'hanno; le
 * NUOVE nascevano senza — quindi lo sconto (es. −18 di Chanel) non si applicava
 * e il prezzo non si azzerava. Qui si sceglie la regola giusta per una
 * consegna, con i criteri decisi dall'utente:
 *   · vale per TUTTI i partner elencati nella regola (non uno solo);
 *   · servizio: se la regola ne indica uno, deve combaciare;
 *   · periodo e giorno della settimana devono includere la data;
 *   · ORARIO: basta la SOVRAPPOSIZIONE fra la fascia della consegna e quella
 *     della regola (non serve che sia interamente dentro);
 *   · il carnet non dev'essere esaurito (dailyCount al giorno / totalCount nel
 *     periodo), contando le consegne già agganciate a quella regola.
 */

export type RegolaCarnet = {
  id: string;
  serviceTypeId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  days: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  /** Distanza massima (km) entro cui la regola vale; 0/null = senza limite. */
  kmDistance?: number | null;
  partners: { partnerId: string }[];
};

export type ConsegnaPerRegola = {
  id: string;
  partnerId: string | null;
  serviceTypeId: string | null;
  date: Date | null;
  deliveryTimeFrom: string | null;
  deliveryTimeTo: string | null;
  distanceKm?: number | null;
};

const minuti = (hhmm: string | null): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** `days` è una stringa di 7 cifre. Convenzione del legacy: indice 0 = domenica
 *  (come getUTCDay) — VERIFICATA sui dati (Regola 9 «1000001»: 159 agganciate,
 *  tutte di domenica e sabato). Vuoto/assente = tutti i giorni. */
function giornoIncluso(days: string | null, dow: number): boolean {
  if (!days || days.length !== 7) return true;
  // ⚠️ 03/09 (misurato col check dell'utente): «0000000» nel legacy significa
  // NESSUN vincolo (filtro giorni spento), non «nessun giorno» — 15 regole su
  // 22 sono così, con migliaia di consegne su tutti i giorni (Regola 21: 931).
  // Letta alla lettera, spegneva quelle regole per sempre sulle consegne nuove.
  if (!days.includes('1')) return true;
  return days[dow] === '1';
}

/** Due fasce orarie si sovrappongono se una inizia prima che l'altra finisca. */
function sovrappone(a1: number | null, a2: number | null, b1: number | null, b2: number | null): boolean {
  if (a1 == null || a2 == null || b1 == null || b2 == null) return true; // dato mancante: non si esclude
  return a1 < b2 && b1 < a2;
}

/**
 * Le regole APPLICABILI a una consegna per criteri statici (partner, servizio,
 * periodo, giorno, sovrapposizione oraria) — senza ancora guardare il consumo,
 * che richiede una query e va fatto dal chiamante. In ordine: prima quelle con
 * un servizio specifico (più mirate), poi le generiche.
 */
export function regoleApplicabili(consegna: ConsegnaPerRegola, regole: RegolaCarnet[]): RegolaCarnet[] {
  if (!consegna.partnerId || !consegna.date) return [];
  const dow = consegna.date.getUTCDay();
  const cf = minuti(consegna.deliveryTimeFrom);
  const ct = minuti(consegna.deliveryTimeTo);
  return regole
    .filter((g) => {
      if (!g.partners.some((p) => p.partnerId === consegna.partnerId)) return false;
      if (g.serviceTypeId && g.serviceTypeId !== consegna.serviceTypeId) return false;
      if (g.periodStart && consegna.date! < g.periodStart) return false;
      if (g.periodEnd && consegna.date! > g.periodEnd) return false;
      if (!giornoIncluso(g.days, dow)) return false;
      // orario: si applica il vincolo solo se la regola lo dichiara e non è
      // «tutto il giorno» (00:00–23:59).
      const rf = minuti(g.timeFrom), rt = minuti(g.timeTo);
      if (rf != null && rt != null && !(rf === 0 && rt >= 1439)) {
        if (!sovrappone(cf, ct, rf, rt)) return false;
      }
      // ⚠️ 02/09 (esame Regola 10 con l'utente): la DISTANZA massima era
      // dichiarata dalla regola (kmDistance) ma MAI controllata. Si esclude
      // solo a km MISURATI: senza misura non si inventa un fuori-raggio.
      if ((g.kmDistance ?? 0) > 0 && consegna.distanceKm != null && consegna.distanceKm > g.kmDistance!) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.serviceTypeId ? 0 : 1) - (b.serviceTypeId ? 0 : 1));
}
