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
export function perimetroProdottiPartner(user: Pick<JwtUser, 'partnerId'>, idsInDotazione: string[] = []) {
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
      /**
       * ⭐⭐ 11/09/2026 (regola utente): «i prodotti di servizio assegnati ai partner li deve vedere
       * anche nella sua scheda prodotti». Se una boutique ha cento biglietti in cassetto, quei
       * biglietti sono roba sua: deve poterli trovare dove cerca tutto il resto, non solo in Merce in
       * sede. Entrano SOLO se gliene è stato assegnato qualcosa — il flag da solo non basta, se no
       * ogni partner vedrebbe il materiale di tutti.
       *
       * ⚠️⚠️ SI PASSANO GLI ID, NON SI SCRIVE LA RELAZIONE. La prima versione filtrava con
       * `{ servizio: true, giacenzePartner: { some: … } }`, ed è andata in errore 500 in produzione
       * (12/09, pagina Prodotti di un partner): il client Prisma pubblicato era stato generato prima
       * della tabella nuova e rifiutava sia la relazione sia il campo. Qui passa una lista di id, che
       * qualunque versione del client capisce; chi chiama la ricava con una query grezza. La regola non
       * cambia, cambia da dove arriva — e questo perimetro non dipende più dal client del giorno.
       *
       * ⚠️ Li vede e basta: non li modifica, non li archivia, non ci chiede una consegna. Il perimetro
       * apre la LETTURA; il divieto di scrittura sta in `ProductsService`, perché questo stesso
       * perimetro governa anche le righe di consegna.
       */
      ...(idsInDotazione.length ? [{ id: { in: idsInDotazione } }] : []),
    ],
  };
}

/**
 * Gli id dei prodotti di servizio assegnati a un partner, letti con SQL grezzo.
 *
 * ⚠️ Grezzo di proposito: questa lettura deve funzionare anche quando il client Prisma pubblicato è
 * più vecchio dello schema — è esattamente il caso che ha rotto la pagina Prodotti dei partner.
 */
export async function idsMerceDiServizio(
  prisma: { $queryRawUnsafe: (sql: string, ...p: unknown[]) => Promise<unknown> },
  partnerId: string | null | undefined,
): Promise<string[]> {
  if (!partnerId) return [];
  try {
    const righe = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "productId" FROM platform."PartnerProductStock" WHERE "partnerId" = $1 AND "quantity" > 0`,
      partnerId,
    )) as { productId: string }[];
    return righe.map((r) => r.productId);
  } catch {
    // La tabella potrebbe non esserci ancora (ambiente non migrato): meglio un prodotto in meno che
    // una pagina in errore. Il partner non perde niente di suo — solo il materiale di servizio.
    return [];
  }
}

/**
 * Gli id di TUTTI i prodotti col flag servizio.
 *
 * ⚠️ Serve a tenerli fuori dalle righe di consegna: un prodotto di servizio può appartenere al partner
 * (i biglietti di una boutique sono suoi), quindi il perimetro da solo non lo esclude. Grezzo per la
 * stessa ragione dell altra lettura: non deve dipendere da quanto è aggiornato il client Prisma.
 */
export async function idsProdottiDiServizio(
  prisma: { $queryRawUnsafe: (sql: string, ...p: unknown[]) => Promise<unknown> },
): Promise<string[]> {
  try {
    const righe = (await prisma.$queryRawUnsafe(
      `SELECT "id" FROM platform."Product" WHERE "servizio" = true`,
    )) as { id: string }[];
    return righe.map((r) => r.id);
  } catch {
    return [];
  }
}
