import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { caselleAttive, scaricaEmail } from '@/lib/email'
import { smistaMailPerSito } from '@/lib/ordine-da-email'
import { daIgnorare, elencoMittentiIgnorati } from '@/lib/mittenti-ignorati'
import { linguaDelTesto } from '@/lib/lingua-testo'

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

  const ignorati = await elencoMittentiIgnorati()

  const risultati: {
    casella: string
    ok: boolean
    nuove: number
    /** Mail già in archivio a cui questo giro ha ridato il corpo (erano vuote). */
    ripescate: number
    errore: string
  }[] = []

  for (const casella of caselle) {
    try {
      const mail = await scaricaEmail(casella)
      let nuove = 0
      let ripescate = 0
      // dalla più vecchia alla più recente, così l'ultima resta in cima
      for (const m of [...mail].reverse()) {
        if (m.idEsterno) {
          const gia = await db.messaggio.findFirst({ where: { idEsterno: m.idEsterno } })
          if (gia) {
            // ⚠️ CORREGGERE IL CODICE NON BASTA: le mail solo-HTML entrate prima
            // del 25/08/2026 sono già in archivio **col corpo vuoto**, e il
            // dedup qui sopra le salterebbe per sempre — la correzione varrebbe
            // solo per la posta futura, e chi apre un ordine di ieri
            // continuerebbe a vedere un messaggio bianco.
            // Finché la mail è ancora sul server (lo scarico guarda gli ultimi
            // 7 giorni) il corpo si ripesca: si riscrive SOLO se prima era
            // vuoto e adesso c'è qualcosa. Mai sovrascrivere un testo esistente:
            // quello in archivio è ciò che l'operatore ha letto e a cui ha
            // risposto.
            if (!gia.testo.trim() && m.testo.trim()) {
              await db.messaggio.update({
                where: { id: gia.id },
                data: { testo: m.testo, lingua: linguaDelTesto(m.testo) },
              })
              ripescate++
            }
            continue
          }
        }

        // A QUALE SITO appartiene questa mail: dal numero d'ordine citato
        // nell'oggetto o nel corpo, cercato nella tabella ordini. Le notifiche
        // dei tre siti arrivano tutte sulla stessa casella, e senza questo
        // finiscono tutte nella colonna della casella che le ha ricevute.
        const sito = await smistaMailPerSito(m.oggetto, m.testo)
        // ⚠️⚠️ Mittente in elenco: la mail entra DIRETTAMENTE NEL CESTINO (dal
        // 25/08/2026; prima entrava «già archiviata» e l'archivio si riempiva di
        // spazzatura sotto gli occhi di tutti). Non risale nemmeno quando ne
        // arriva una nuova: vedi `eliminataIl` qui sotto, o lo spam tornerebbe
        // su a ogni invio. Si svuota dopo 30 giorni, come il resto del cestino.
        const ignorare = daIgnorare(m.da, ignorati)

        const conversazione = await db.conversazione.upsert({
          where: { canale_idEsterno_numeroId: { canale: 'email', idEsterno: m.da, numeroId: '' } },
          update: {
            nome: m.nome,
            casellaId: casella.id,
            ultimoTesto: m.oggetto || m.testo.slice(0, 120),
            ultimoMessaggioIl: m.data,
            nonLetti: ignorare ? undefined : { increment: 1 },
            archiviata: false,
            // Il marchio si scrive solo se lo sappiamo: un null non deve
            // cancellare quello trovato prima da un altro messaggio.
            ...(sito.negozioId ? { negozioId: sito.negozioId } : {}),
            ...(sito.ordineNumero ? { ordineNumero: sito.ordineNumero } : {}),
            // ⚠️ Una mail nuova ripesca dal cestino chi ci era finito per mano
            // nostra — ma NON un mittente ignorato.
            eliminataIl: ignorare ? new Date() : null,
          },
          create: {
            canale: 'email',
            idEsterno: m.da,
            nome: m.nome,
            casellaId: casella.id,
            ultimoTesto: m.oggetto || m.testo.slice(0, 120),
            ultimoMessaggioIl: m.data,
            negozioId: sito.negozioId,
            ordineNumero: sito.ordineNumero,
            nonLetti: ignorare ? 0 : 1,
            archiviata: false,
            eliminataIl: ignorare ? new Date() : null,
          },
        })

        await db.messaggio.create({
          data: {
            conversazioneId: conversazione.id,
            direzione: 'in',
            oggetto: m.oggetto,
            testo: m.testo,
            idEsterno: m.idEsterno,
            lingua: linguaDelTesto(m.testo),
            creatoIl: m.data,
          },
        })
        nuove++
      }
      risultati.push({ casella: casella.indirizzo, ok: true, nuove, ripescate, errore: '' })
    } catch (e) {
      risultati.push({
        casella: casella.indirizzo,
        ok: false,
        nuove: 0,
        ripescate: 0,
        errore: (e as Error).message,
      })
    }
  }

  const nuove = risultati.reduce((s, r) => s + r.nuove, 0)
  const ripescate = risultati.reduce((s, r) => s + r.ripescate, 0)
  return NextResponse.json({ nuove, ripescate, risultati })
}
