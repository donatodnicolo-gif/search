import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { casellaPerId, inviaEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
// L'SMTP di register.it può prendersi qualche secondo: meglio del taglio a 15.
export const maxDuration = 60

/** Un indirizzo plausibile. Non si valida un'email con una regex "giusta": si
 *  scarta solo ciò che è palesemente non un indirizzo, il resto lo dice l'SMTP. */
function indirizzoPlausibile(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v.trim())
}

// Manda una mail NUOVA a un cliente (prima si poteva solo rispondere dentro un
// thread). Serve al pop-up di posta: `mailto:` apriva il programma di posta del
// computer — quando c'era — e la mail partiva da lì, fuori da quest'app e senza
// lasciare traccia. Così invece parte dalla casella aziendale e resta scritta.
export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    a?: string
    oggetto?: string
    testo?: string
    casellaId?: string
    // Solo per la traccia in inbox: di che ordine si sta parlando e a chi.
    clienteNome?: string
    ordineNumero?: string
  }

  const a = (c.a ?? '').trim()
  const testo = (c.testo ?? '').trim()
  if (!indirizzoPlausibile(a)) {
    return NextResponse.json({ errore: 'Indirizzo del destinatario non valido.' }, { status: 400 })
  }
  if (!testo) {
    return NextResponse.json({ errore: 'La mail è vuota: scrivi il messaggio.' }, { status: 400 })
  }

  // Da quale casella si scrive.
  //
  // ⚠️ Se l'id è stato indicato ESPLICITAMENTE deve esistere: `casellaPerId()`
  // ripiega da sé sulla predefinita, e qui quel ripiego sarebbe sbagliato —
  // mandare da un indirizzo diverso da quello scelto, senza dirlo, è una mail
  // che parte a nome di qualcun altro. Meglio rifiutare.
  const chiesta = (c.casellaId ?? '').trim()
  const casella = await casellaPerId(chiesta)
  if (!casella) {
    return NextResponse.json(
      { errore: 'Nessuna casella di posta configurata: aggiungila in Caselle.' },
      { status: 400 }
    )
  }
  if (chiesta && casella.id !== chiesta) {
    return NextResponse.json(
      { errore: 'La casella scelta non esiste più: ricarica la pagina e riprova.' },
      { status: 400 }
    )
  }

  const oggetto = (c.oggetto ?? '').trim()

  let messageId = ''
  try {
    messageId = await inviaEmail(casella, a, oggetto, testo)
  } catch (e) {
    // L'errore SMTP si riporta COM'È: "535 authentication rejected" dice cosa
    // fare, "invio non riuscito" no.
    return NextResponse.json({ errore: `Invio non riuscito: ${(e as Error).message}` }, { status: 502 })
  }

  // La mail inviata finisce in inbox come le altre: una mail che parte e non
  // lascia traccia è una conversazione che il collega dopo non trova più.
  // Stesse convenzioni del sync: canale 'email', idEsterno = indirizzo.
  try {
    const anteprima = testo.length > 200 ? testo.slice(0, 200) + '…' : testo
    const conversazione = await db.conversazione.upsert({
      where: { canale_idEsterno: { canale: 'email', idEsterno: a } },
      update: {
        ultimoTesto: anteprima,
        ultimoMessaggioIl: new Date(),
        casellaId: casella.id,
        ...(c.clienteNome?.trim() ? { nome: c.clienteNome.trim() } : {}),
      },
      create: {
        canale: 'email',
        idEsterno: a,
        nome: (c.clienteNome ?? '').trim() || a,
        casellaId: casella.id,
        ultimoTesto: anteprima,
        ultimoMessaggioIl: new Date(),
      },
    })
    await db.messaggio.create({
      data: {
        conversazioneId: conversazione.id,
        direzione: 'out',
        oggetto,
        testo,
        idEsterno: messageId,
        stato: 'inviato',
      },
    })
  } catch (e) {
    // La mail è PARTITA: non si può dire che è fallita. Si dice che è partita e
    // che la traccia non si è salvata, perché sono due cose diverse.
    return NextResponse.json({
      ok: true,
      messageId,
      avviso: `Mail inviata, ma non registrata in inbox: ${(e as Error).message}`,
    })
  }

  return NextResponse.json({ ok: true, messageId, da: casella.indirizzo })
}
