// CHI PREPARA L'ORDINE, dato un pagamento.
//
// ⚠️⚠️ Fino al 07/09/2026 su una richiesta di pagamento c'era UN nome solo,
// `intestatario`, e faceva due mestieri: il beneficiario del bonifico e il
// fornitore che ha preparato l'ordine. Sono quasi sempre la stessa azienda, ma
// NON per forza (regola dell'utente: «l'intestatario conto di un fornitore può
// essere diverso da ragione sociale»): una ditta individuale incassa a nome
// della persona, una società incassa per il negozio. Con un nome solo, chi
// scriveva sul conto il nome giusto per la banca vedeva il modulo dimenticare
// il fornitore scelto e il server rifiutare la richiesta («risulta preparato
// da X, ma stai chiedendo di pagare Y»).
//
// Da allora i nomi sono due: `intestatario` è il nome SUL CONTO (va a
// Transactions come beneficiario), `fornitore` è chi prepara (va sull'ordine e
// nel registro). Le righe vecchie hanno `fornitore` vuoto: per loro vale
// l'intestatario, ed è per questo che questa funzione esiste — ogni punto che
// vuole «il fornitore» passa da qui, invece di ricordarsi il ripiego da solo.
//
// ⚠️ Questo file NON importa `db`: lo usa anche la pagina, che è un componente
// client.

export function chiPrepara(r: { fornitore?: string | null; intestatario: string }): string {
  return (r.fornitore ?? '').trim() || (r.intestatario ?? '').trim()
}
