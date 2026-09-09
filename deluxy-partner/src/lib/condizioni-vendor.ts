import { prisma } from "./db";
import { risolviAnagrafica, type CondizioniVendor } from "./anagrafiche";

// LE CONDIZIONI VENDOR LE DECIDE LA PIATTAFORMA CONSEGNE, NON FINANCE.
//
// Decisione dell'utente (08/09/2026): «il possessore del dato è solo app
// delivery». Là si sceglie se un partner compensa e con quali tempi; la
// piattaforma lo sincronizza sul registro Anagrafiche a ogni salvataggio, e
// Finance lo LEGGE da lì — la stessa strada dell'IBAN (`dati-bancari.ts`),
// senza inventare un'integrazione diretta fra le due app.
//
// Il caso che l'ha resa necessaria: BOTTEGA LUNGARNO. Sulla piattaforma erano
// stati scelti «no compensazione», 60 giorni sulle vendite e fatturazione a
// fine mese; Finance, che teneva la sua copia, continuava a dire «compensazione
// mai decisa» e «pagamento a vista». Due verità sullo stesso partner.
//
// ⚠️ TRE RISPOSTE, non due. Su ogni campo:
//   valore  → la piattaforma ha deciso
//   null    → la piattaforma NON ha ancora deciso («da valorizzare»)
// e in più il blocco intero può mancare:
//   `disponibile: false` → il registro non risponde, o la chiave non ha
//                          l'ambito, o il partner non è agganciato.
// «Non l'hanno deciso» e «non riesco a leggerlo» portano ad azioni diverse:
// nella prima si va a decidere, nella seconda si guarda perché il registro
// tace. Confonderle è l'errore che l'IBAN ci ha già fatto pagare il 05/09.
//
// ⚠️ NON si riscrive la copia locale di Finance: una copia che si aggiorna da
// sola è una copia che diverge in silenzio (Standard §7 — riferimento, non
// copia). La colonna `Partner.compensazione` resta quello che è, e serve solo
// come ripiego finché il registro non porta il dato.

export type EsitoCondizioni = {
  /** Le condizioni lette dal registro; `null` se non si sono potute leggere. */
  condizioni: CondizioniVendor | null;
  /** false = registro muto, chiave senza ambito, o partner non agganciato. */
  disponibile: boolean;
  /**
   * ⭐ 09/09/2026 — PERCHÉ UN «NON DECISO» PUÒ NON ESSERE UN NON DECISO.
   *
   * La scheda del registro porta le condizioni solo se è **collegata** a un
   * partner della piattaforma (`platformId`). Senza aggancio i quattro campi
   * sono `null` — identici a «la piattaforma non ha ancora scelto» — e la
   * scheda diceva «da valorizzare» mentre sulla piattaforma la risposta c'era
   * eccome (ADOLFO STEFANELLI, 09/09: compensazione sì, 60 gg, fine mese).
   * Sono due guai con due rimedi opposti: nel primo si va a decidere, nel
   * secondo si collega la scheda. Confonderli manda a cercare nel posto
   * sbagliato — è successo a me, due volte in un giorno.
   */
  agganciata: boolean;
  /**
   * La scheda è ARCHIVIATA: la perdente di un'unione fatta nel registro.
   * Finance non dovrebbe leggerla — le condizioni le riceve quella viva.
   * Successo su DIPTYQUE (OLFATTORIO) e, per colpa mia, su STEFANELLI.
   */
  archiviata: boolean;
};

export async function condizioniVendorPartner(partnerId: string): Promise<EsitoCondizioni> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, anagraficaId: true },
  });
  const vuoto = { condizioni: null, disponibile: false, agganciata: false, archiviata: false };
  if (!p) return vuoto;
  try {
    const a = await risolviAnagrafica(p.nome, p.anagraficaId);
    if (!a) return vuoto;
    const agganciata = Boolean(a.platformId);
    const archiviata = a.attivo === false;
    // Il blocco a `null` vuol dire che la chiave non ha l'ambito «Dati
    // finanziari»: è un problema di permessi, non un dato mancante.
    if (!a.condizioniVendor) return { ...vuoto, agganciata, archiviata };
    return { condizioni: a.condizioniVendor, disponibile: true, agganciata, archiviata };
  } catch {
    // Il registro che non risponde non deve rompere la scheda: si dice che non
    // si sa, e la pagina mostra il ripiego locale dichiarandolo.
    return vuoto;
  }
}
