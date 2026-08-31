import { JwtUser } from './decorators';

/**
 * Il perimetro dei prodotti che un PARTNER vede e può usare (regola
 * dell'utente, 31/08/2026): i SUOI, quelli del catalogo comune (senza
 * partner), quelli marcati «visibile ad altri partner», e quelli dove compare
 * come venditore aggiuntivo (partnerLinks).
 *
 * ⚠️ UNA casa sola per la regola: prima la lista e il dettaglio prodotti
 * usavano due OR diversi (la lista senza i senza-partner, il dettaglio senza
 * i «visibili»), e la scrittura delle consegne non filtrava affatto — il
 * partner poteva mettere in consegna il prodotto di un altro passando l'id.
 * Vale per la lettura (prodotti) E per la scrittura (righe di consegna).
 */
export function perimetroProdottiPartner(user: Pick<JwtUser, 'partnerId'>) {
  return {
    OR: [
      { partnerId: null },
      { partnerId: user.partnerId ?? '-' },
      { visibleToOtherPartners: true },
      { partnerLinks: { some: { partnerId: user.partnerId ?? '-' } } },
    ],
  };
}
