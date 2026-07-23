import { cookies } from 'next/headers'
import JSZip from 'jszip'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { leggiTuttiAllegati } from '@/lib/imap'

// GET /api/allegati-zip?messaggio=<id>
// Scarica TUTTI gli allegati di una mail in un unico file .zip. Come il download
// singolo, il contenuto non è salvato: si prende dal server al momento — ma con
// UNA sola connessione IMAP per tutti i file (vedi leggiTuttiAllegati).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Tetto prudenziale: oltre, si rischia di sfondare memoria e tempo della
// funzione. Chi ha allegati enormi li prende uno per uno.
const MAX_TOTALE = 45 * 1024 * 1024

/** Nome file usabile su tutti i sistemi (niente \ / : * ? " < > |). */
function nomeSicuro(nome: string, indice: number): string {
  const pulito = nome.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim()
  return pulito || `allegato-${indice + 1}`
}

export async function GET(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) return new Response('Sessione scaduta', { status: 401 })

  const url = new URL(req.url)
  const messaggioId = url.searchParams.get('messaggio') || ''
  if (!messaggioId) return new Response('Parametri mancanti', { status: 400 })

  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId: userId },
    include: { account: true },
  })
  if (!m || m.uid <= 0) return new Response('Allegati non disponibili', { status: 404 })

  const cartella = m.direzione === 'uscita' ? m.account.cartellaInviata || undefined : m.account.cartella
  let allegati
  try {
    allegati = await leggiTuttiAllegati(m.account, m.uid, cartella)
  } catch {
    return new Response('Errore nel recupero dal server', { status: 502 })
  }
  if (allegati.length === 0) return new Response('Nessun allegato trovato', { status: 404 })

  const zip = new JSZip()
  const usati = new Map<string, number>()
  let totale = 0
  let saltati = 0
  allegati.forEach((a, i) => {
    totale += a.contenuto.length
    // Superato il tetto si smette di aggiungere: meglio uno zip parziale (con
    // l'avviso dentro) che una funzione che muore a metà scaricamento.
    if (totale > MAX_TOTALE) {
      saltati++
      return
    }
    // Due allegati con lo stesso nome (capita spesso: "image001.png") non
    // devono sovrascriversi dentro lo zip: si numera il secondo in poi.
    const originale = nomeSicuro(a.nome, i)
    const punto = originale.lastIndexOf('.')
    const base = punto > 0 ? originale.slice(0, punto) : originale
    const est = punto > 0 ? originale.slice(punto) : ''
    let nome = originale
    let n = 1
    while (usati.has(nome.toLowerCase())) nome = `${base} (${++n})${est}`
    usati.set(nome.toLowerCase(), 1)
    zip.file(nome, a.contenuto)
  })

  if (saltati > 0) {
    zip.file(
      'ATTENZIONE.txt',
      `Questo archivio è parziale: ${saltati} allegat${saltati === 1 ? 'o supera' : 'i superano'} il limite complessivo di 45 MB.\n` +
        `Scaricali singolarmente dalla pagina del messaggio.\n`
    )
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // Nome dell'archivio: l'oggetto della mail, ripulito.
  const base = nomeSicuro(m.oggetto || 'allegati', 0).slice(0, 60) || 'allegati'
  const nomeZip = `${base}.zip`
  const nomeAscii = nomeZip.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nomeZip)}`,
      'Cache-Control': 'no-store',
    },
  })
}
