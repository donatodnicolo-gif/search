import { NextRequest, NextResponse } from 'next/server'
import {
  etichettaStato,
  fornitoriInZona,
  mestierePerNegozio,
  mestierePerProdotto,
  type Mestiere,
} from '@/lib/fornitori-zona'
import { lavoroPerFornitore } from '@/lib/lavoro-fornitore'
import { nostriFornitori, ordinaPerConsegna } from '@/lib/nostri-fornitori'
import { siglaProvincia } from '@/lib/province'
import { chiaveNome, type LavoroDato } from '@/lib/cerca-fornitore'

export const dynamic = 'force-dynamic'

// I fornitori del registro Anagrafiche che stanno nella provincia di consegna.
//
// Passa di qui e non dal browser perché la chiave del registro non deve mai
// uscire dal server (stessa regola di /api/partner).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const provincia = (p.get('provincia') ?? '').trim()
  /** La città di consegna: serve a mettere in cima chi ha già consegnato lì. */
  const citta = (p.get('citta') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const mestiereChiesto = (p.get('mestiere') ?? '').trim()
  // Il nome del prodotto dell'ordine: serve quando il negozio non dice il
  // mestiere («Deluxy» vende di tutto).
  const prodotto = (p.get('prodotto') ?? '').trim()

  // ── CHI HA GIÀ PREPARATO ORDINI PER NOI ──
  //
  // ⚠️⚠️ Si legge dai NOSTRI ordini e si manda SEMPRE, anche quando l'elenco del
  // registro è vuoto o la provincia non è italiana. Segnalato dall'utente su
  // #2798: «non vedo passiflora fra i fornitori», mentre Passiflora quell'ordine
  // l'aveva preparato. Nel registro non ha né città né categoria — come tutti i
  // fornitori entrati pagandoli — quindi per l'elenco in zona non esiste.
  // Una lista che promette «prima quelli con cui lavoriamo già» e non li mostra
  // è peggio di una lista vuota.
  const nostri = ordinaPerConsegna(await nostriFornitori().catch(() => []), citta, provincia)

  if (!provincia) {
    // Senza provincia non si indovina: un elenco «nazionale» proporrebbe
    // fornitori a 400 km e la lista smetterebbe di voler dire qualcosa.
    return NextResponse.json({
      fornitori: [],
      nostri,
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

  // ⚠️⚠️ La provincia potrebbe non essere italiana. Su #2798 la consegna è a
  // **Mijas (Málaga)** e l'indirizzo dice «MA»: che in Italia non è una
  // provincia. L'elenco per provincia è uno strumento italiano, e dirlo è
  // diverso dal dire «nessun fornitore censito in provincia di MA» — che si
  // legge come «non ne abbiamo», mentre la verità è «qui non so cercare».
  if (!siglaProvincia(provincia)) {
    return NextResponse.json({
      fornitori: [],
      nostri,
      provincia,
      mestiere: mestiere ?? '',
      daDove: '',
      nota: `«${provincia}» non è una provincia italiana: l'elenco per zona vale solo in Italia. Qui sotto ci sono i fornitori che hanno già preparato ordini per noi.`,
    })
  }

  const esito = await fornitoriInZona(provincia, mestiere)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Registro Anagrafiche non collegato: metti URL e chiave in Impostazioni.' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })

  // ── QUANTO LAVORO ABBIAMO GIÀ DATO A OGNUNO ──
  //
  // ⚠️⚠️ È la lista da cui si sceglie a chi telefonare per QUESTO ordine, e
  // fino a oggi diceva soltanto chi esiste in provincia. Ma fra due fiorai a
  // due chilometri l'uno dall'altro non è lo stesso chiamare quello che ha
  // già preparato tre ordini per noi e quello che non ci ha mai visto: cambia
  // chi risponde, cambia il prezzo, cambia se ti fa il favore alle sette di
  // sera. Il dato ce l'avevamo (il costo concordato è sull'ordine) e non lo
  // sommava nessuno.
  //
  // ⚠️ Una query sola per tutta la lista, e un errore non fa fallire la
  // pagina: senza il conto si sceglie lo stesso, senza l'elenco no.
  let lavoro = new Map<string, LavoroDato>()
  try {
    lavoro = await lavoroPerFornitore()
  } catch {
    // si va avanti senza
  }

  return NextResponse.json({
    nostri,
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
      // ⚠️ Si manda anche quando è vuoto: la schermata deve poter dire «mai
      // lavorato con lui», che è un'informazione, invece di lasciare il posto
      // vuoto, che non lo è.
      lavoro: lavoro.get(chiaveNome(f.nome || f.ragioneSociale)) ?? null,
    })),
  })
}
