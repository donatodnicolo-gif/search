// IL CORPO DELLA RICHIESTA «Nuovo ordine» → i dati che la lib capisce.
//
// La stessa traduzione serve a due rotte: POST /api/nuovo-ordine (crea la
// bozza) e PUT /api/bozze/[id] (modifica una bozza non ancora pagata). Scritta
// due volte divergerebbe alla prima correzione — un campo aggiunto qui e
// dimenticato là — e l'ordine modificato perderebbe pezzi in silenzio.
//
// ⚠️ Qui non si valida niente di economico: si normalizza. I divieti stanno
// in `creaOrdine` / `aggiornaBozza`, che è dove passano anche gli altri
// chiamanti (riconsegne, preventivi, API v1).

import type { DatiNuovoOrdine } from './nuovo-ordine'

export function datiDaCorpo(
  d: Partial<DatiNuovoOrdine>,
  io: { id: string; nome: string }
): DatiNuovoOrdine {
  return {
    negozioId: d.negozioId ?? '',
    cliente: {
      nome: d.cliente?.nome ?? '',
      cognome: d.cliente?.cognome ?? '',
      email: d.cliente?.email ?? '',
      telefono: d.cliente?.telefono ?? '',
    },
    // Chi riceve, se non è il mittente: si passa com'è, la lib decide se vale.
    destinatario: d.destinatario
      ? {
          nome: d.destinatario.nome ?? '',
          cognome: d.destinatario.cognome ?? '',
          telefono: d.destinatario.telefono ?? '',
        }
      : undefined,
    // ⚠️ Di suo NO: solo se il modulo lo dichiara a vero.
    consensoMarketing: d.consensoMarketing === true,
    consegna: {
      data: d.consegna?.data ?? '',
      fascia: d.consegna?.fascia ?? '',
      indirizzo: d.consegna?.indirizzo ?? '',
      civicoNote: d.consegna?.civicoNote ?? '',
      cap: d.consegna?.cap ?? '',
      citta: d.consegna?.citta ?? '',
      provincia: d.consegna?.provincia ?? '',
      paese: d.consegna?.paese ?? 'IT',
    },
    righe: d.righe ?? [],
    biglietto: d.biglietto ?? '',
    spedizione: { titolo: d.spedizione?.titolo ?? '', prezzo: d.spedizione?.prezzo ?? 0 },
    anonima: Boolean(d.anonima),
    // ⭐ Eccezione agli orari del negozio: il motivo, se l'operatore l'ha scritto.
    eccezioneOrari: String(d.eccezioneOrari ?? ''),
    pagamento: d.pagamento === 'pagato' ? 'pagato' : 'link',
    mezzoPagamento: d.mezzoPagamento ?? '',
    // ⚠️ Di suo l'IVA NON si aggiunge: solo se il modulo la chiede esplicitamente.
    aggiungiIva: d.aggiungiIva === true,
    // Chi sta creando (o modificando) l'ordine: la sessione lo sa, Shopify no.
    operatore: { id: io.id, nome: io.nome },
  }
}
