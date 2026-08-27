// LA PRO-FORMA DI UN ORDINE, in un posto solo (27/08/2026).
//
// Richiesta dell'utente: «quando finisce in ordini crea automaticamente la
// pro-forma». Le strade che portano a un ordine sono TRE, e prima due la
// emettevano e una no:
//   1. «Trasforma in ordine» da una richiesta cliente — la emetteva;
//   2. «Trasforma in ordine» da una trattativa — la emetteva;
//   3. chiudere la trattativa come VINTA dal suo form — NON la emetteva, e
//      l'errore era pure ingoiato (`.catch(() => {})`). È da lì che nascono gli
//      ordini senza documento che si vedono in elenco.
// Tre copie della stessa regola divergono: qui la regola è una.
//
// ⚠️ NON LANCIA MAI. L'ordine a quel punto è già nato, e un registro che non
// risponde non deve farlo perdere: si torna un esito che dice cosa è successo,
// e chi chiama lo scrive a schermo. Un documento che non si è potuto emettere
// va detto — non è la stessa cosa di un ordine non creato, e mandare a cercare
// nel posto sbagliato costa più del guasto.
import { collegaDocumentoAOrdine } from '@/lib/db';
import { creaProformaDaRichiesta } from '@/lib/partner';

export interface EsitoProforma {
  emessa: boolean;
  riferimento: string | null;
  url: string | null;
  /** Perché non è stata emessa: si mostra, non si nasconde. */
  perche: string | null;
}

/**
 * Emette la pro-forma di un ordine e gliela aggancia.
 *
 * @param brand  con quale intestazione emetterla (FINANCE ha un template per
 *               brand). Senza, di là si usa il predefinito.
 */
export async function emettiProformaPerOrdine(o: {
  ordineId: string;
  cliente: string;
  importo: number | null;
  causale?: string | null;
  scadenza?: string | null;
  brand?: string | null;
}): Promise<EsitoProforma> {
  // ⚠️ Senza importo non si emette: una pro-forma è una richiesta di denaro, e
  // una richiesta di denaro senza cifra non è un documento — è un foglio che il
  // cliente non sa cosa farsene. Meglio dirlo che emettere zero.
  if (o.importo == null || !(o.importo > 0)) {
    return {
      emessa: false,
      riferimento: null,
      url: null,
      perche: "l'ordine non ha ancora un valore: scrivilo e poi si emette il documento",
    };
  }
  try {
    const pf = await creaProformaDaRichiesta({
      cliente: o.cliente,
      importo: o.importo,
      causale: o.causale ?? null,
      scadenza: o.scadenza ?? null,
      brand: o.brand ?? null,
    });
    await collegaDocumentoAOrdine(o.ordineId, { proformaNumero: pf.riferimento, proformaUrl: pf.url });
    return { emessa: true, riferimento: pf.riferimento, url: pf.url, perche: null };
  } catch (e: any) {
    return { emessa: false, riferimento: null, url: null, perche: e?.message ?? 'il servizio non ha risposto' };
  }
}

/** La frase da mostrare dopo aver creato un ordine, esito del documento compreso. */
export function raccontaEsito(esito: EsitoProforma): { titolo: string; testo: string } {
  return esito.emessa
    ? { titolo: 'Ordine creato', testo: `È in Ordini, con la pro-forma ${esito.riferimento} agganciata.` }
    : {
        titolo: 'Ordine creato, pro-forma no',
        testo: `L'ordine è in Ordini. Il documento non è stato emesso: ${esito.perche}.\n\nSi può emettere dopo, dal bottone «Pro-forma» sulla riga dell'ordine.`,
      };
}
