import { NextRequest, NextResponse } from 'next/server'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// REGISTRAZIONE DI UN NUMERO SULLA CLOUD API.
//
// Un numero può risultare «sulla Cloud API» ed essere ancora NON CONNESSO:
// finché non lo si registra non riceve niente, e ogni altro controllo resta
// verde perché il numero esiste e il token lo vede. La registrazione vuole un
// PIN a 6 cifre — è la verifica in due passaggi di quel numero.
//
// ⚠️ IL PIN NON SI SALVA DA NESSUNA PARTE. Passa da qui e va a Meta, che è chi
// deve conservarlo. Tenerne una copia significherebbe custodire il secondo
// fattore di un numero aziendale dentro un gestionale, senza nessun vantaggio:
// per registrare di nuovo lo si richiede a chi lo ha scelto.
//
// Il token invece è quello già in cassaforte dell'app: chi usa questa funzione
// non deve incollare credenziali da nessuna parte.

const API = 'https://graph.facebook.com/v21.0'

/**
 * Il codice d'errore di Meta tradotto nel PASSO SUCCESSIVO.
 *
 * ⚠️ «(#133006) Phone number re-verification needed» è un messaggio corretto e
 * inutile: dice cos'è andato storto, non cosa fare. Chi lo legge resta fermo
 * davanti a un errore rosso con la sensazione che sia rotto qualcosa, mentre
 * gli mancava un clic sul bottone sopra. Un errore che non indica la mossa
 * seguente è un vicolo cieco, e questa mappa serve a non lasciarcene nessuno.
 */
const SPIEGAZIONI: Record<number, string> = {
  133006:
    'La verifica del numero è scaduta: prima di registrarlo va rifatta. Premi «Fatti chiamare» qui sopra — su un fisso l’SMS non arriva — scrivi il codice che ti dettano al telefono, premi «Conferma codice», e solo dopo torna qui col PIN.',
  133005:
    'Il PIN non corrisponde a quello già impostato su questo numero. Se non lo ricordi, azzeralo da WhatsApp Manager (Impostazioni del numero → Verifica in due passaggi) e poi riprova.',
  133008:
    'Troppi tentativi con PIN sbagliato: Meta ha bloccato il numero per un po’. Aspetta prima di riprovare, e nel frattempo recupera il PIN giusto da WhatsApp Manager.',
  133009: 'Hai riprovato troppo in fretta: aspetta qualche secondo e ripeti.',
  133010: 'Il numero non risulta registrato: rifai la verifica col codice e poi registra.',
  133016:
    'Il numero è stato eliminato di recente da Meta: va aspettato il tempo previsto prima di poterlo registrare di nuovo.',
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { phoneNumberId, pin } = (await req.json().catch(() => ({}))) as {
    phoneNumberId?: string
    pin?: string
  }

  const numero = (phoneNumberId ?? '').replace(/\D/g, '')
  const codice = (pin ?? '').replace(/\D/g, '')
  if (!numero) return NextResponse.json({ errore: 'Manca il numero.' }, { status: 400 })
  if (codice.length !== 6) {
    return NextResponse.json(
      { errore: 'Il PIN dev’essere di 6 cifre: è la verifica in due passaggi del numero.' },
      { status: 400 }
    )
  }

  const token = (await tokenPerNumero(numero)).trim()
  if (!token) {
    return NextResponse.json(
      { errore: 'Nessun token per questo numero: né suo né quello generale (Impostazioni).' },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(`${API}/${numero}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: codice }),
      signal: AbortSignal.timeout(20000),
    })
    const corpo = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }
    }

    if (!res.ok) {
      // L'errore di Meta si riporta com'è — «PIN sbagliato» e «numero già
      // registrato» si risolvono in modi opposti — ma da solo non basta:
      // «(#133006) Phone number re-verification needed» è corretto e non dice
      // che cosa fare. Qui il codice diventa il passo successivo.
      const m = corpo.error?.error_user_msg || corpo.error?.message || `errore ${res.status}`
      const codiceErrore = corpo.error?.code
      const cosaFare = SPIEGAZIONI[codiceErrore ?? 0]
      return NextResponse.json(
        { errore: `Meta risponde: ${m}`, cosaFare },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      messaggio:
        'Numero registrato. Rilancia la diagnosi: «il numero è connesso» deve diventare verde, poi manda un messaggio di prova.',
    })
  } catch (e) {
    return NextResponse.json({ errore: `Registrazione non riuscita: ${(e as Error).message}` }, { status: 502 })
  }
}
