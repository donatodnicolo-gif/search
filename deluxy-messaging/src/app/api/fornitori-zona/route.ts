import { NextRequest, NextResponse } from 'next/server'
import {
  etichettaStato,
  fornitoriInZona,
  mestierePerNegozio,
  mestierePerProdotto,
  type Mestiere,
} from '@/lib/fornitori-zona'

export const dynamic = 'force-dynamic'

// I fornitori del registro Anagrafiche che stanno nella provincia di consegna.
//
// Passa di qui e non dal browser perché la chiave del registro non deve mai
// uscire dal server (stessa regola di /api/partner).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const mestiereChiesto = (p.get('mestiere') ?? '').trim()
  // Il nome del prodotto dell'ordine: serve quando il negozio non dice il
  // mestiere («Deluxy» vende di tutto).
  const prodotto = (p.get('prodotto') ?? '').trim()

  if (!provincia) {
    // Senza provincia non si indovina: un elenco «nazionale» proporrebbe
    // fornitori a 400 km e la lista smetterebbe di voler dire qualcosa.
    return NextResponse.json({
      fornitori: [],
      provincia: '',
      nota: 'Provincia di consegna non nota.',
    })
  }

  // ── TRE FONTI, in ordine di quanto ci si può fidare ──
  //
  //  1. quello che ha scelto una persona col menu: vince sempre;
  //  2. il NEGOZIO (Cake → pasticcerie, Flowers → fiorai): è un fatto, non una
  //     lettura di testo libero;
  //  3. il PRODOTTO, quando il negozio non lo dice.
  //
  // ⚠️⚠️ Il terzo esiste perché su «Deluxy», che vende di tutto, l'elenco
  // mostrava **pasticcerie e fiorai insieme** — cioè per metà gente che
  // quell'ordine non lo può fare, e chi telefona se ne accorge alla terza
  // chiamata sbagliata.
  //
  // ⚠️ Il prodotto è testo libero e si legge con prudenza: se cita tutte e due
  // le cose, o nessuna, `mestierePerProdotto` torna `null` e si mostrano tutti.
  // Meglio una lista più lunga che una lista sbagliata.
  const daProdotto = mestierePerProdotto(prodotto)
  const mestiere: Mestiere | null =
    mestiereChiesto === 'pasticceria' || mestiereChiesto === 'fioraio'
      ? mestiereChiesto
      : (mestierePerNegozio(negozio) ?? daProdotto)

  const esito = await fornitoriInZona(provincia, mestiere)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Registro Anagrafiche non collegato: metti URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })

  return NextResponse.json({
    provincia: esito.provincia,
    mestiere: mestiere ?? '',
    // ⚠️ Da DOVE viene il filtro, così la schermata può dirlo: un elenco
    // accorciato senza spiegare perché fa credere che i fornitori non ci siano.
    daDove: mestiereChiesto ? 'scelto' : mestierePerNegozio(negozio) ? 'negozio' : daProdotto ? 'prodotto' : '',
    fornitori: esito.fornitori.map((f) => ({
      id: f.id,
      nome: f.nome || f.ragioneSociale,
      categoria: f.categoria,
      // Con chi si sta parlando: «Partner» è uno con cui lavoriamo, «Prospect»
      // uno che abbiamo censito e mai (o non ancora) usato. Chiamarli allo
      // stesso modo farebbe promettere condizioni che non esistono.
      stato: etichettaStato(f.stato),
      citta: f.citta,
      indirizzo: f.indirizzo,
      telefono: f.telefonoUtile,
      email: f.emailUtile,
      recapitoDa: f.recapitoDa,
    })),
  })
}
