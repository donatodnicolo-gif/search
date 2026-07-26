import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { configEmail, scaricaEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Lo scarico IMAP può richiedere qualche decina di secondi.
export const maxDuration = 60

// Scarica le mail recenti dalla casella e le porta in inbox: una conversazione
// per indirizzo, come per gli altri canali.
export async function POST() {
  const config = await configEmail()
  if (!config) {
    return NextResponse.json(
      { errore: 'Casella non configurata: indirizzo e password in Impostazioni → Email.' },
      { status: 400 }
    )
  }

  let mail
  try {
    mail = await scaricaEmail(config)
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }

  let nuove = 0
  // dalla più vecchia alla più recente, così l'ultimo messaggio resta in cima
  for (const m of [...mail].reverse()) {
    // già vista? (dedup sul Message-ID)
    if (m.idEsterno) {
      const gia = await db.messaggio.findFirst({ where: { idEsterno: m.idEsterno } })
      if (gia) continue
    }

    const conversazione = await db.conversazione.upsert({
      where: { canale_idEsterno: { canale: 'email', idEsterno: m.da } },
      update: {
        nome: m.nome,
        ultimoTesto: m.oggetto || m.testo.slice(0, 120),
        ultimoMessaggioIl: m.data,
        nonLetti: { increment: 1 },
        archiviata: false,
      },
      create: {
        canale: 'email',
        idEsterno: m.da,
        nome: m.nome,
        ultimoTesto: m.oggetto || m.testo.slice(0, 120),
        ultimoMessaggioIl: m.data,
        nonLetti: 1,
      },
    })

    await db.messaggio.create({
      data: {
        conversazioneId: conversazione.id,
        direzione: 'in',
        oggetto: m.oggetto,
        testo: m.testo,
        idEsterno: m.idEsterno,
        creatoIl: m.data,
      },
    })
    nuove++
  }

  return NextResponse.json({ lette: mail.length, nuove })
}
