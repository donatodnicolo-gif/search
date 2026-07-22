import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/invito?e=<eventoId>&t=<token>&chi=<email>&r=si|no
// Il link Accetta/Rifiuta nella mail d'invito: PUBBLICO (chi riceve l'invito
// non ha un account qui), protetto dal token dell'evento. Registra la risposta
// e mostra una paginetta di conferma.
export const dynamic = 'force-dynamic'

function pagina(titolo: string, testo: string, colore = '#111'): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titolo}</title></head>
<body style="margin:0;background:#f5f5f7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e5e5ea;border-radius:18px;padding:36px 40px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)">
<div style="font-size:34px;margin-bottom:10px">${colore === '#b00' ? '✕' : '✓'}</div>
<h1 style="font-size:19px;margin:0 0 8px;color:${colore}">${titolo}</h1>
<p style="font-size:14.5px;color:#555;margin:0;line-height:1.5">${testo}</p>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const eventoId = p.get('e') ?? ''
  const token = p.get('t') ?? ''
  const chi = (p.get('chi') ?? '').trim().toLowerCase()
  const r = p.get('r') === 'si' ? 'si' : p.get('r') === 'no' ? 'no' : null

  if (!eventoId || !token || !chi || !r) {
    return pagina('Link non valido', 'Il link è incompleto. Riapri la mail d’invito e riprova.', '#b00')
  }

  const evento = await db.evento.findFirst({
    where: { id: eventoId, tokenInvito: token },
    select: { id: true, titolo: true, invitati: true, risposteInvito: true, tokenInvito: true },
  })
  if (!evento || !evento.tokenInvito) {
    return pagina('Invito non trovato', 'L’invito non esiste più o il link non è valido.', '#b00')
  }

  // Solo chi è stato invitato può rispondere.
  const invitati = evento.invitati.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (!invitati.includes(chi)) {
    return pagina('Indirizzo non invitato', 'Questo indirizzo non risulta fra gli invitati.', '#b00')
  }

  // Registra (o aggiorna) la risposta di questo invitato.
  let risposte: Record<string, string> = {}
  try {
    risposte = evento.risposteInvito ? (JSON.parse(evento.risposteInvito) as Record<string, string>) : {}
  } catch {
    risposte = {}
  }
  risposte[chi] = r
  await db.evento.update({
    where: { id: evento.id },
    data: { risposteInvito: JSON.stringify(risposte) },
  })

  return r === 'si'
    ? pagina('Parteciperai ✓', `Hai accettato l’invito «${evento.titolo}». L’organizzatore vede la tua risposta.`)
    : pagina('Non parteciperai', `Hai rifiutato l’invito «${evento.titolo}». L’organizzatore vede la tua risposta.`, '#b00')
}
