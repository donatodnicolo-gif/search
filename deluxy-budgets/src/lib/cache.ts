// Quanto a lungo si può riusare la risposta di un'altra app Deluxy.
//
// Prima ogni lettura era `no-store`: aprire il Consuntivo voleva dire rifare da
// capo **tutte** le chiamate a Finance, Orders e Marketing, e rifarle di nuovo
// passando al P&L che guarda gli stessi numeri. Con una finestra breve la
// seconda pagina è quasi istantanea.
//
// Un minuto è la scelta: questi conti si muovono quando arriva un movimento in
// banca o un ordine, non da un secondo all'altro, e nessuna decisione cambia
// perché un totale è vecchio di sessanta secondi. Le **scritture** non passano
// da qui — le rotte che salvano fanno `router.refresh()`, che ricarica la
// pagina server e rilegge quello che serve.
export const RIVALIDA = 60;
