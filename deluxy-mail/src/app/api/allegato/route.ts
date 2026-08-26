import { utenteCorrente } from '@/lib/sessione'
import { db } from '@/lib/db'
import { leggiAllegato, scaricaParteStream } from '@/lib/imap'
import { cartellaDiMessaggio } from '@/lib/cartelleServer'

// GET /api/allegato?messaggio=<id>&i=<indice>
// Scarica ON-DEMAND un allegato dal server e lo serve. Autenticato dal cookie:
// il messaggio dev'essere dell'utente loggato.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  // ⚠️⚠️ `utenteCorrente()` e NON `verificaSessione()`: la firma del cookie dice
  // solo «questo biglietto l'abbiamo emesso noi», non rilegge l'utente, quindi
  // non si accorge che è stato DISATTIVATO. Il cookie dura 30 giorni e queste
  // rotte fanno cose vere (allegati, riletture IMAP, una svuota il cestino PER
  // SEMPRE): chi lascia l'azienda continuerebbe a usarle per un mese. Le
  // pagine il controllo lo fanno già — è la trappola «auth riscritta dentro la
  // rotta», qui moltiplicata per nove.
  const userId = (await utenteCorrente())?.id ?? null
  if (!userId) return new Response('Sessione scaduta', { status: 401 })

  const url = new URL(req.url)
  const messaggioId = url.searchParams.get('messaggio') || ''
  const indice = Number(url.searchParams.get('i') || '0')
  if (!messaggioId || Number.isNaN(indice)) return new Response('Parametri mancanti', { status: 400 })

  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId: userId },
    // La sezione serve a sapere dove sta la mail sulla casella: una nello SPAM
    // è nella Posta indesiderata, non in INBOX (vedi cartelleServer.ts).
    include: { account: true, sezione: { select: { nome: true } } },
  })
  if (!m || m.uid <= 0) return new Response('Allegato non disponibile', { status: 404 })

  const cartella = cartellaDiMessaggio(m, m.account)

  // Se il client passa la PARTE (l'indirizzo IMAP del pezzo, che l'elenco
  // fornisce), si scarica solo quella: su una mail da decine di MB tirarsi
  // dietro tutto il messaggio per un allegato è quello che la faceva scadere.
  const parte = url.searchParams.get('parte') || ''
  const nomeAtteso = url.searchParams.get('nome') || ''
  const tipoAtteso = url.searchParams.get('tipo') || ''

  const intestazioni = (nome: string, tipo: string) => {
    // Nome file "sicuro" nell'header (niente a-capo/virgolette) + versione UTF-8.
    const nomeAscii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    return {
      'Content-Type': tipo || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'no-store',
    }
  }

  // Con la PARTE si TRASMETTE a flusso: un allegato grande (un catalogo) supera
  // il tetto ~4,5 MB di una risposta bufferizzata su Vercel, e «Scarica» non
  // faceva nulla. A flusso quel limite non si applica.
  if (parte) {
    try {
      const s = await scaricaParteStream(m.account, m.uid, parte, cartella)
      if (s) {
        const web = new ReadableStream<Uint8Array>({
          start(controller) {
            s.stream.on('data', (c: Buffer) => controller.enqueue(new Uint8Array(c)))
            s.stream.on('end', () => {
              controller.close()
              void s.chiudi()
            })
            s.stream.on('error', (err) => {
              controller.error(err)
              void s.chiudi()
            })
          },
          cancel() {
            void s.chiudi() // il browser ha annullato: chiudi la connessione
          },
        })
        return new Response(web, {
          headers: intestazioni(nomeAtteso || `allegato-${indice + 1}`, tipoAtteso),
        })
      }
    } catch {
      return new Response('Errore nel recupero dal server', { status: 502 })
    }
  }

  // Senza parte (o se non è arrivata): strada vecchia, per indice (bufferizzata).
  let allegato: { nome: string; tipo: string; contenuto: Buffer } | null = null
  try {
    allegato = await leggiAllegato(m.account, m.uid, indice, cartella)
  } catch {
    return new Response('Errore nel recupero dal server', { status: 502 })
  }
  if (!allegato) return new Response('Allegato non trovato', { status: 404 })

  return new Response(new Uint8Array(allegato.contenuto), {
    headers: intestazioni(allegato.nome, allegato.tipo),
  })
}
