import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/invito?e=<eventoId>&t=<token>&chi=<email>&r=si|no
// Il link Accetta/Rifiuta nella mail d'invito: PUBBLICO (chi riceve l'invito
// non ha un account qui), protetto dal token dell'evento. Registra la risposta
// e mostra una paginetta di conferma.
export const dynamic = 'force-dynamic'

// ⚠️ Il titolo dell'evento nasce da una mail (dato NON fidato) e finisce in
// questa pagina PUBBLICA: senza escape, un titolo come «</title><script>…»
// eseguirebbe nel browser di chi apre il link. (Revisione 14/08/2026.)
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pagina(titolo: string, testo: string, colore = '#111'): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titolo)}</title></head>
<body style="margin:0;background:#f5f5f7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e5e5ea;border-radius:18px;padding:36px 40px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)">
<div style="font-size:34px;margin-bottom:10px">${colore === '#b00' ? '✕' : '✓'}</div>
<h1 style="font-size:19px;margin:0 0 8px;color:${colore}">${esc(titolo)}</h1>
<p style="font-size:14.5px;color:#555;margin:0;line-height:1.5">${esc(testo)}</p>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

/** La paginetta che CHIEDE conferma prima di registrare la risposta. */
function chiediConferma(titolo: string, r: string, campi: Record<string, string>): NextResponse {
  const nascosti = Object.entries(campi)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('')
  const verbo = r === 'si' ? 'Confermo che parteciperò' : 'Confermo che non parteciperò'
  return new NextResponse(
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titolo)}</title></head>
<body style="margin:0;background:#f5f5f7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e5e5ea;border-radius:18px;padding:36px 40px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)">
<h1 style="font-size:19px;margin:0 0 8px">${esc(titolo)}</h1>
<p style="font-size:14.5px;color:#555;margin:0 0 18px;line-height:1.5">Premi il bottone per registrare la tua risposta.</p>
<form method="POST">${nascosti}
<button type="submit" style="background:#111;color:#fff;border:0;border-radius:999px;padding:11px 20px;font-size:14.5px;cursor:pointer">${esc(verbo)}</button>
</form></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

// ⚠️⚠️ Il GET non SCRIVE più. I due link stanno nella stessa mail, e gli
// scanner di posta (Safe Links di Outlook, gli antivirus, le anteprime)
// **aprono i link da soli** per controllarli: aprivano «accetta», poi
// «rifiuta», e in calendario compariva una risposta che nessuno aveva dato —
// l'organizzatore spostava l'appuntamento su un dato falso. Ora il link
// mostra una pagina con un bottone, e la risposta si registra solo col POST
// che parte da quel bottone: un programma che segue i link non lo preme.
export async function GET(request: Request) {
  return await rispondi(request, false)
}

/** Il POST del bottone: qui la risposta si registra davvero. */
export async function POST(request: Request) {
  return await rispondi(request, true)
}

async function rispondi(request: Request, scrivi: boolean) {
  // Col POST i campi arrivano dal form (sono gli stessi, nascosti).
  const p = scrivi
    ? new URLSearchParams(Object.fromEntries((await request.formData()).entries()) as Record<string, string>)
    : new URL(request.url).searchParams
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

  // Il GET si ferma qui: mostra il bottone e non tocca niente.
  if (!scrivi) {
    return chiediConferma(
      r === 'si' ? `Partecipi a «${evento.titolo}»?` : `Non partecipi a «${evento.titolo}»?`,
      r,
      { e: eventoId, t: token, chi, r }
    )
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
