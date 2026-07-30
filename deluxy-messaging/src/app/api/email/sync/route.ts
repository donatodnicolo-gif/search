import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { caselleAttive, scaricaEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Lo scarico IMAP può richiedere qualche decina di secondi (più caselle).
export const maxDuration = 60

// Scarica le mail recenti da TUTTE le caselle attive e le porta in inbox:
// una conversazione per mittente, con l'esito riportato per casella.
export async function POST() {
  const caselle = await caselleAttive()
  if (caselle.length === 0) {
    return NextResponse.json(
      { errore: 'Nessuna casella configurata: aggiungine una in Caselle.' },
      { status: 400 }
    )
  }

  const risultati: { casella: string; ok: boolean; nuove: number; errore: string }[] = []

  for (const casella of caselle) {
    try {
      const mail = await scaricaEmail(casella)
      let nuove = 0
      // dalla più vecchia alla più recente, così l'ultima resta in cima
      for (const m of [...mail].reverse()) {
        if (m.idEsterno) {
          const gia = await db.messaggio.findFirst({ where: { idEsterno: m.idEsterno } })
          if (gia) continue
        }

        const conversazione = await db.conversazione.upsert({
          where: { canale_idEsterno_numeroId: { canale: 'email', idEsterno: m.da, numeroId: '' } },
          update: {
            nome: m.nome,
            casellaId: casella.id,
            ultimoTesto: m.oggetto || m.testo.slice(0, 120),
            ultimoMessaggioIl: m.data,
            nonLetti: { increment: 1 },
            archiviata: false,
            eliminataIl: null,
          },
          create: {
            canale: 'email',
            idEsterno: m.da,
            nome: m.nome,
            casellaId: casella.id,
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
      risultati.push({ casella: casella.indirizzo, ok: true, nuove, errore: '' })
    } catch (e) {
      risultati.push({
        casella: casella.indirizzo,
        ok: false,
        nuove: 0,
        errore: (e as Error).message,
      })
    }
  }

  const nuove = risultati.reduce((s, r) => s + r.nuove, 0)
  return NextResponse.json({ nuove, risultati })
}
