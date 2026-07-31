import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { googleAccessToken, nomeContatto } from '@/lib/contatti'
import { aggiornaContatto, cercaContattoPerTelefono, creaContatto } from '@/lib/google'
import { prefissoDaNegozio } from '@/lib/negozi'
import { ricostruisciCliente } from '@/lib/clienti-uniti'

export const dynamic = 'force-dynamic'

// Porta in rubrica Google un cliente UNITO: un contatto solo, con dentro tutti
// i suoi numeri e tutte le sue email.
//
// ⚠️ GOOGLE NON HA UN'API PER «UNIRE» DUE CONTATTI. La People API sa creare,
// aggiornare e cancellare, ma la fusione dei doppioni esiste solo nel sito di
// Google Contacts («Unisci e correggi»). Quindi qui si fa la metà che si può
// fare bene: il contatto principale diventa completo. I doppioni rimasti in
// rubrica si segnalano — con quanti sono e come si chiamano — e li si lascia
// all'utente.
//
// ⚠️ E NON SI CANCELLA NIENTE. Cancellare un contatto in rubrica è irreversibile
// e tocca dati che non sono nati in questa app: un contatto può avere note,
// foto, appartenenze a gruppi che noi non vediamo. Un doppione in più è un
// fastidio, un contatto cancellato per sbaglio è una perdita.

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { chiave?: string }
  const chiave = (body.chiave ?? '').trim()
  if (!chiave) return NextResponse.json({ errore: 'Chiave mancante' }, { status: 400 })

  const token = await googleAccessToken().catch(() => null)
  if (!token) {
    return NextResponse.json(
      { errore: 'Google Contacts non è collegato (Impostazioni → Google Contacts).' },
      { status: 400 }
    )
  }

  const cliente = await ricostruisciCliente(chiave)
  if (!cliente) return NextResponse.json({ errore: 'Cliente non trovato' }, { status: 404 })

  const negozio = await db.negozioShopify.findUnique({ where: { id: cliente.negozioId } })
  const sigla = negozio ? prefissoDaNegozio(negozio.nome, negozio.dominio, negozio.prefisso) : ''
  const nome = nomeContatto(sigla, cliente.nome, cliente.ultimoNumero)

  const dati = {
    nome,
    telefono: cliente.telefono,
    email: cliente.email,
    indirizzo: cliente.indirizzo,
    note: `ordine ${cliente.ultimoNumero}`,
    altriTelefoni: cliente.telefoni.slice(1),
    altreEmail: cliente.indirizziEmail.slice(1),
  }

  const principale = cliente.telefono
    ? await cercaContattoPerTelefono(token, cliente.telefono)
    : null

  // I contatti PERSONALI dell'utente non si toccano mai: se il numero è già in
  // rubrica sotto un contatto che non abbiamo creato noi, quello resta com'è.
  if (principale && !principale.nostro) {
    return NextResponse.json({
      esito: `«${principale.nome}» è un tuo contatto, non creato da qui: non l'ho modificato.`,
      doppioni: [],
    })
  }

  let esito: string
  if (principale) {
    await aggiornaContatto(token, principale.resourceName, dati)
    esito = `Aggiornato «${nome}» con ${cliente.telefoni.length} numeri e ${cliente.indirizziEmail.length} email.`
  } else {
    await creaContatto(token, dati)
    esito = `Aggiunto «${nome}» con ${cliente.telefoni.length} numeri e ${cliente.indirizziEmail.length} email.`
  }

  // Gli altri numeri della stessa persona hanno quasi sempre un contatto loro:
  // si dice quali sono, perché è l'elenco che serve per finire il lavoro dentro
  // Google Contacts.
  const doppioni: string[] = []
  for (const telefono of cliente.telefoni.slice(1)) {
    const altro = await cercaContattoPerTelefono(token, telefono)
    if (altro && altro.resourceName !== principale?.resourceName) {
      doppioni.push(`${altro.nome} (${telefono})`)
    }
  }

  return NextResponse.json({ esito, doppioni })
}
