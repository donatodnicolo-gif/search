import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { casellaPerId, inviaEmail } from '@/lib/email'
import { scaricaImmagineProdotto } from '@/lib/immagine-prodotto'

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
// Chi ha mandato la mail: resta scritto accanto al messaggio.
export async function POST(req: NextRequest) {
  const chiScrive = await utenteCorrente()
  // ⚠️ Il cookie è `userId.HMAC(userId)` e vive trenta giorni: il middleware
  // ne verifica solo la FIRMA, e cancellare un utente non lo invalida. Senza
  // questa riga l'azione partiva lo stesso, con autore vuoto in archivio.
  if (!chiScrive) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    a?: string
    oggetto?: string
    testo?: string
    casellaId?: string
    // Solo per la traccia in inbox: di che ordine si sta parlando e a chi.
    clienteNome?: string
    ordineNumero?: string
    /**
     * La foto del prodotto da allegare (URL del CDN Shopify).
     *
     * ⚠️ Si scarica QUI, dal server, con la **stessa lista bianca** di
     * `/api/immagine`: accettare un URL qualsiasi e andarlo a prendere vuol dire
     * offrire un proxy verso la rete interna (169.254.169.254, localhost) a
     * chiunque sappia chiamare questa rotta.
     */
    allegatoUrl?: string
    allegatoNome?: string
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

  // La foto del prodotto, se chi scrive l'ha lasciata attaccata.
  //
  // ⚠️ Se non si riesce a prenderla la mail parte LO STESSO, senza: una
  // richiesta che non arriva perché il CDN era lento è un danno più grande di
  // una richiesta senza foto. Nel corpo si dice se è allegata o no, così chi
  // legge non promette al fornitore un'immagine che non c'è.
  const allegato = c.allegatoUrl
    ? await scaricaImmagineProdotto(c.allegatoUrl, c.allegatoNome || 'prodotto')
    : null

  let messageId = ''
  try {
    messageId = await inviaEmail(casella, a, oggetto, testo, allegato ? [allegato] : undefined)
  } catch (e) {
    // L'errore SMTP si riporta COM'È: "535 authentication rejected" dice cosa
    // fare, "invio non riuscito" no.
    return NextResponse.json({ errore: `Invio non riuscito: ${(e as Error).message}` }, { status: 502 })
  }

  // Se la foto era chiesta e non è partita, chi ha scritto deve saperlo: la
  // risposta lo dice, e il pop-up lo mostra.
  const notaAllegato = c.allegatoUrl && !allegato ? 'La foto non è stata allegata.' : ''

  // La mail inviata finisce in inbox come le altre: una mail che parte e non
  // lascia traccia è una conversazione che il collega dopo non trova più.
  // Stesse convenzioni del sync: canale 'email', idEsterno = indirizzo.
  try {
    const anteprima = testo.length > 200 ? testo.slice(0, 200) + '…' : testo
    const conversazione = await db.conversazione.upsert({
      where: { canale_idEsterno_numeroId: { canale: 'email', idEsterno: a, numeroId: '' } },
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
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
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

  return NextResponse.json({ ok: true, messageId, nota: notaAllegato })
}
