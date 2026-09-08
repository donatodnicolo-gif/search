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
};

export async function condizioniVendorPartner(partnerId: string): Promise<EsitoCondizioni> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { nome: true, anagraficaId: true },
  });
  if (!p) return { condizioni: null, disponibile: false };
  try {
    const a = await risolviAnagrafica(p.nome, p.anagraficaId);
    if (!a) return { condizioni: null, disponibile: false };
    // Il blocco a `null` vuol dire che la chiave non ha l'ambito «Dati
    // finanziari»: è un problema di permessi, non un dato mancante.
    if (!a.condizioniVendor) return { condizioni: null, disponibile: false };
    return { condizioni: a.condizioniVendor, disponibile: true };
  } catch {
    // Il registro che non risponde non deve rompere la scheda: si dice che non
    // si sa, e la pagina mostra il ripiego locale dichiarandolo.
    return { condizioni: null, disponibile: false };
  }
}
