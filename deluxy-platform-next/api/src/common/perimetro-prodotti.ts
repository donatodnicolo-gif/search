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
      // Dei prodotti SENZA partner al partner arriva solo il servizio di
      // consegna (deciso dall'utente il 31/08/2026): gli altri 295 orfani
      // sono «extra» e «riconsegne» una tantum del legacy, non un catalogo.
      // ⚠️ Il prodotto VIVO si chiama «Servizio Consegne» (plurale); i
      // «Servizio Consegna» sono archiviati. Si tengono entrambe le grafie:
      // filtrare solo sul singolare avrebbe mostrato zero.
      { partnerId: null, name: { in: ['Servizio Consegna', 'Servizio Consegne'] } },
      { partnerId: user.partnerId ?? '-' },
      // ⚠️ «Visibile ad altri partner» apre SOLO ai partner SELEZIONATI
      // (partnerLinks) — regola utente 01/09: il flag da solo non basta.
      // Prima `visibleToOtherPartners: true` da sola apriva il prodotto a
      // TUTTI i partner (misurato: 1 prodotto su 40 viaggiava così).
      { partnerLinks: { some: { partnerId: user.partnerId ?? '-' } } },
    ],
  };
}
