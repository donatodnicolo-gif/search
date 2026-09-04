import { riepilogoPartner, type SaldoRecord } from "./queries";
import { nomeMese } from "./calc";
import { euro } from "./format";
import { richiestaRifacibile } from "./transactions";

// Partite aperte dell'anno di un partner IN COMPENSAZIONE.
//
// Con la compensazione crediti e debiti si annullano fra loro: la scheda del
// partner lo dice nel totale dell'anno («Da bonificare 48,30 € (netto)»), e la
// richiesta di pagamento deve dire la STESSA cifra. Prima del 04/09/2026 il
// bottone «Paga» di un mese mandava a Transactions il lordo di quel mese
// (ANTOFLOWERS: 185,22 € di agosto invece dei 48,30 € netti dell'anno, perché
// aprile e maggio erano a debito del partner per 405,30 €): due numeri diversi
// per lo stesso dovuto, e il più alto era quello che stava per essere pagato.
//
// `delta` di un mese = daBonificare − daIncassare: positivo quando Deluxy deve
// al partner, negativo quando il partner deve a Deluxy. Il netto è la somma.

export type PartitaMese = {
  mese: number;
  delta: number;
  saldo: SaldoRecord | null;
};

export type PartiteAperte = {
  partite: PartitaMese[];
  /** Somma dei delta, arrotondata al centesimo. > 0: Deluxy deve al partner. */
  netto: number;
};

const cent = (v: number) => Math.round(v * 100) / 100;

export async function partiteAperte(partnerId: string, anno: number): Promise<PartiteAperte> {
  const { mesi } = await riepilogoPartner(partnerId, anno);
  const partite = mesi
    .map((m) => ({
      mese: m.mese,
      delta: cent(m.riepilogo.daBonificare - m.riepilogo.daIncassare),
      saldo: m.saldo,
    }))
    .filter((p) => Math.abs(p.delta) >= 0.005);
  return { partite, netto: cent(partite.reduce((a, p) => a + p.delta, 0)) };
}

type RichiestaDelMese = {
  richiestaRif: string | null;
  richiestaStato: string | null;
  richiestaIl: Date | null;
} | null;

/** I mesi che entrano nel netto quando si preme «Paga» su `meseCorrente`: il
 *  mese premuto e tutti quelli SENZA una richiesta in corso. Un mese la cui
 *  cifra è già in coda su Transactions non si conta di nuovo (verificato il
 *  04/09/2026 su 5 partner con luglio in attesa e agosto nuovo). Usata sia dal
 *  server che decide l'importo, sia dalle pagine che lo scrivono sul bottone:
 *  due formule direbbero due cifre. */
export function partiteDaChiedere<T extends { mese: number; saldo: RichiestaDelMese }>(partite: T[], meseCorrente: number): T[] {
  return partite.filter(
    (p) => p.mese === meseCorrente || !p.saldo?.richiestaRif || richiestaRifacibile(p.saldo.richiestaStato, p.saldo.richiestaIl)
  );
}

/** Il netto che «Paga» chiederebbe da `meseCorrente` (può essere ≤ 0: allora
 *  non c'è niente da chiedere). */
export function nettoDaChiedere(partite: Array<{ mese: number; delta: number; saldo: RichiestaDelMese }>, meseCorrente: number): number {
  return cent(partiteDaChiedere(partite, meseCorrente).reduce((a, p) => a + p.delta, 0));
}

/** «giugno +196,56 · luglio +71,82 · aprile −71,52»: la riga che spiega da dove
 *  viene il netto, per la nota della richiesta e per il registro. */
export function descriviPartite(partite: PartitaMese[]): string {
  return partite
    .map((p) => `${nomeMese(p.mese).toLowerCase()} ${p.delta > 0 ? "+" : "−"}${euro(Math.abs(p.delta))}`)
    .join(" · ");
}
