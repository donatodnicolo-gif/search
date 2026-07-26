import { OrdiniLista } from '@/components/OrdiniLista'

export const dynamic = 'force-dynamic'

// ORDINI GLOBALI — l'archivio, non la lista di lavoro.
//
// È la stessa tabella di «Ordini aperti», con due differenze volute:
//  · non nasconde niente — ci sono anche i gestiti e quelli con un rimborso
//    aperto, che dalla lista di lavoro spariscono apposta;
//  · parte dalla vista a tabella, perché qui si cerca (numero, cliente,
//    telefono, email, indirizzo) invece di lavorare la giornata.
export default function PaginaOrdiniGlobali() {
  return <OrdiniLista modalita="globali" />
}
