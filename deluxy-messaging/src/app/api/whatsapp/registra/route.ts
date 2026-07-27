import { NextRequest, NextResponse } from 'next/server'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'

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

export async function POST(req: NextRequest) {
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
      error?: { message?: string; error_subcode?: number; error_user_msg?: string }
    }

    if (!res.ok) {
      // L'errore di Meta si riporta com'è: «PIN sbagliato» e «numero già
      // registrato» si risolvono in modi opposti, e appiattirli in «non
      // riuscito» rimanda a indovinare.
      const m = corpo.error?.error_user_msg || corpo.error?.message || `errore ${res.status}`
      return NextResponse.json({ errore: `Meta risponde: ${m}` }, { status: 502 })
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
