import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { casellaPerId, inviaEmail } from '@/lib/email'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Scrivere per primi a un cliente, dall'inbox.
//
// Prima si poteva solo RISPONDERE: per scrivere a un cliente che non aveva mai
// scritto bisognava uscire dall'app. Qui si scegle la casella da cui parte, si
// può agganciare un ordine, e la mail parte con la firma di quella casella.
//
// ⚠️ La conversazione si crea (o si riusa) ANCHE per un messaggio in uscita: se
// il nostro messaggio non lasciasse traccia, la risposta del cliente arriverebbe
// in un thread che comincia a metà — senza sapere che gli avevamo scritto noi, né
// cosa. La chiave è la stessa delle mail in arrivo: canale + indirizzo.
export async function POST(req: NextRequest) {
  const { casellaId, a, oggetto, testo, ordineNumero } = (await req.json().catch(() => ({}))) as {
    casellaId?: string
    a?: string
    oggetto?: string
    testo?: string
    ordineNumero?: string
  }

  const destinatario = (a ?? '').trim().toLowerCase()
  const corpo = (testo ?? '').trim()
  // La forma dell'indirizzo si controlla qui: SMTP accetterebbe «pippo» e
  // fallirebbe dopo, con un errore che parla di relay e non di refuso.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destinatario)) {
    return NextResponse.json({ errore: 'Indirizzo del destinatario non valido.' }, { status: 400 })
  }
  if (!corpo) return NextResponse.json({ errore: 'Il messaggio è vuoto.' }, { status: 400 })

  const casella = await casellaPerId((casellaId ?? '').trim())
  if (!casella) {
    return NextResponse.json(
      { errore: 'Nessuna casella di posta utilizzabile: controlla password e stato in Caselle.' },
      { status: 400 }
    )
  }

  const numero = (ordineNumero ?? '').trim()
  // Se l'ordine c'è, il marchio della conversazione è quello dell'ordine: la
  // stessa regola delle mail in arrivo, così il thread finisce nella colonna
  // giusta invece che in quella della casella.
  const ordine = numero
    ? await db.ordine.findFirst({
        where: { OR: [{ numero }, { numero: `#${numero.replace(/\D/g, '')}` }] },
        select: { numero: true, negozioId: true },
      })
    : null

  const chiScrive = await utenteCorrente()
  const oggettoVero = (oggetto ?? '').trim() || (ordine ? `Ordine ${ordine.numero}` : 'Deluxy')

  let idMessaggio = ''
  try {
    idMessaggio = await inviaEmail(casella, destinatario, oggettoVero, corpo)
  } catch (e) {
    return NextResponse.json(
      { errore: `Invio non riuscito: ${(e as Error).message}` },
      { status: 502 }
    )
  }

  const conversazione = await db.conversazione.upsert({
    where: {
      canale_idEsterno_numeroId: { canale: 'email', idEsterno: destinatario, numeroId: '' },
    },
    update: {
      casellaId: casella.id,
      ultimoTesto: oggettoVero,
      ultimoMessaggioIl: new Date(),
      archiviata: false,
      eliminataIl: null,
      ...(ordine?.negozioId ? { negozioId: ordine.negozioId } : {}),
      ...(ordine?.numero ? { ordineNumero: ordine.numero } : {}),
    },
    create: {
      canale: 'email',
      idEsterno: destinatario,
      nome: destinatario,
      casellaId: casella.id,
      ultimoTesto: oggettoVero,
      ultimoMessaggioIl: new Date(),
      negozioId: ordine?.negozioId ?? null,
      ordineNumero: ordine?.numero ?? '',
      // Un messaggio scritto da noi non è «da leggere»: i non letti sono il
      // debito verso i clienti, non le nostre uscite.
      nonLetti: 0,
    },
  })

  const messaggio = await db.messaggio.create({
    data: {
      conversazioneId: conversazione.id,
      direzione: 'out',
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
      oggetto: oggettoVero,
      testo: corpo,
      idEsterno: idMessaggio,
      stato: 'inviato',
    },
  })

  return NextResponse.json({ conversazioneId: conversazione.id, messaggioId: messaggio.id })
}
