import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { formeNumero, normalizzaNumero, numeroInTesta } from '@/lib/diario'

export const dynamic = 'force-dynamic'

// Il diario di lavoro.
//   ?stato=aperte (di suo) | fatte | tutte
//   ?ordine=1741   solo le righe di quell'ordine
//   ?q=            cerca nel testo
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const stato = (p.get('stato') ?? 'aperte').trim()
  const ordine = (p.get('ordine') ?? '').trim()
  const conversazione = (p.get('conversazione') ?? '').trim()
  const q = (p.get('q') ?? '').trim()

  const dove: Record<string, unknown> = {}
  if (stato === 'aperte') dove.fatta = false
  else if (stato === 'fatte') dove.fatta = true
  // ⚠️ Si cerca in tutte e due le forme del numero: in tabella stanno col
  // cancelletto, a mano si scrivono senza. Senza questo la nota c'è ma
  // sull'ordine non compare, e nessuna delle due schermate dà errore.
  if (ordine) dove.ordineNumero = { in: formeNumero(ordine) }
  if (conversazione) dove.conversazioneId = conversazione
  if (q) dove.testo = { contains: q, mode: 'insensitive' }

  const ordinamento = stato === 'fatte' ? { fattaIl: 'desc' as const } : { creatoIl: 'desc' as const }
  const corrispondono = await db.notaDiario.findMany({ where: dove, orderBy: ordinamento, take: 300 })

  // ── LE CAPOFILA, E I LORO SEGUITI ──
  //
  // ⚠️⚠️ Un seguito non si mostra da solo: senza la riga che cita è una frase
  // che non si capisce («richiamato, vuole il biglietto riscritto» — quale
  // cliente?). Quindi da ogni riga che corrisponde al filtro si risale alla
  // capofila, e la si mostra con tutto il filo sotto.
  //
  // ⚠️⚠️ E il contrario: una capofila GIÀ FATTA con un seguito ancora aperto
  // deve comparire fra le aperte. Altrimenti spuntando la prima riga di un filo
  // si farebbero sparire dalla vista di lavoro le cose che restano da fare —
  // in silenzio, che è il modo peggiore.
  const idCapo = [...new Set(corrispondono.map((n) => n.rispostaA || n.id))]
  const [capofila, seguiti] = await Promise.all([
    db.notaDiario.findMany({ where: { id: { in: idCapo } }, orderBy: ordinamento }),
    // I seguiti si leggono TUTTI, anche quelli che non corrispondono al filtro:
    // un filo mostrato a metà racconta una storia diversa da quella vera.
    db.notaDiario.findMany({
      where: { rispostaA: { in: idCapo } },
      orderBy: { creatoIl: 'asc' },
    }),
  ])

  const aperte = await db.notaDiario.count({ where: { fatta: false } })
  return NextResponse.json({ note: capofila, seguiti, aperte })
}

// Una riga nuova. Il numero d'ordine si stacca da solo dalla testa del testo.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const { testo, ordineNumero, conversazioneId, conversazioneChi, rispostaA } = (await req
    .json()
    .catch(() => ({}))) as {
    testo?: string
    ordineNumero?: string
    conversazioneId?: string
    conversazioneChi?: string
    rispostaA?: string
  }
  const grezzo = (testo ?? '').trim()
  if (!grezzo) return NextResponse.json({ errore: 'La riga è vuota.' }, { status: 400 })

  // ⚠️ Se il numero arriva dal contesto (si scrive DALL'ordine) vince quello:
  // là la riga la si scrive senza ripetere il numero, ed è giusto così.
  const dallaTesta = numeroInTesta(grezzo)
  const numero = ordineNumero?.trim()
    ? normalizzaNumero(ordineNumero)
    : dallaTesta.numero
  const corpo = ordineNumero?.trim() ? grezzo : dallaTesta.resto || grezzo

  // ── IL SEGUITO DI UN'ALTRA NOTA ──
  //
  // ⚠️ La capofila si CONTROLLA: un id arrivato dal browser non è una prova, e
  // un seguito agganciato a una nota che non esiste sparirebbe dalla vista di
  // tutti — non è in nessun filo e non è una riga a sé.
  //
  // ⚠️ Un solo livello: se si risponde a un seguito, ci si aggancia alla sua
  // capofila. Un albero profondo dentro una lista di cose da fare non si legge.
  //
  // ⚠️⚠️ E il seguito EREDITA l'ordine e la conversazione della capofila quando
  // non gli vengono dati: è il senso di «citare» quella nota. Senza, il filo
  // parlerebbe di un ordine che il seguito non nomina, e cercando quel numero
  // si troverebbe metà della storia.
  let citata = ''
  let ereditaOrdine = ''
  let ereditaConvId = ''
  let ereditaConvChi = ''
  const chiesta = (rispostaA ?? '').trim()
  if (chiesta) {
    const madre = await db.notaDiario.findUnique({ where: { id: chiesta } })
    if (madre) {
      citata = madre.rispostaA || madre.id
      const capo =
        madre.rispostaA && madre.rispostaA !== madre.id
          ? await db.notaDiario.findUnique({ where: { id: madre.rispostaA } })
          : madre
      ereditaOrdine = capo?.ordineNumero ?? ''
      ereditaConvId = capo?.conversazioneId ?? ''
      ereditaConvChi = capo?.conversazioneChi ?? ''
    }
  }

  const nota = await db.notaDiario.create({
    data: {
      rispostaA: citata,
      ordineNumero: numero || ereditaOrdine,
      conversazioneId: (conversazioneId ?? '').trim() || ereditaConvId,
      conversazioneChi: ((conversazioneChi ?? '').trim() || ereditaConvChi).slice(0, 80),
      testo: corpo,
      autoreId: io.id,
      autoreNome: io.nome,
    },
  })
  return NextResponse.json({ nota })
}
