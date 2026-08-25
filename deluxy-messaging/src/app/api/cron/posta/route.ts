import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { caselleAttive, scaricaEmail } from '@/lib/email'
import { smistaMailPerSito } from '@/lib/ordine-da-email'
import { daIgnorare, elencoMittentiIgnorati } from '@/lib/mittenti-ignorati'
import { risolutoreMarchio } from '@/lib/marchio-conversazione'
import { linguaDelTesto } from '@/lib/lingua-testo'

// Scarica la posta da sola, ogni 5 minuti.
//
// Prima bisognava premere «Scarica posta» in Inbox: una mail arrivata alle 9:02
// restava invisibile fino a quando qualcuno si ricordava di cliccare. In un
// servizio clienti la velocità di risposta è la leva di fiducia più forte che
// abbiamo, e non può dipendere da un pulsante.
//
// ⚠️ È lo stesso lavoro di `POST /api/email/sync`, ma la rotta del cron sta
// **fuori dal middleware di sessione** (`api/cron` è escluso) e si autentica col
// `CRON_SECRET`: una funzione chiamata da Vercel non ha un cookie di login, e di
// là verrebbe rimandata al login senza fare niente.
export const dynamic = 'force-dynamic'
// IMAP su più caselle: misurate decine di secondi. I 10 di default non bastano.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: scarico automatico disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  const caselle = await caselleAttive()
  if (caselle.length === 0) {
    return NextResponse.json({ ok: true, nuove: 0, nota: 'Nessuna casella configurata.' })
  }

  const ignorati = await elencoMittentiIgnorati()

  const risultati: { casella: string; nuove: number; ripescate: number; errore: string }[] = []

  for (const casella of caselle) {
    try {
      // Finestra corta: il cron passa ogni 5 minuti, e rileggere 7 giorni di
      // posta a ogni giro vuol dire scaricare le stesse mail 288 volte al
      // giorno per trovarne una nuova.
      const mail = await scaricaEmail(casella, 2)
      let nuove = 0
      let ripescate = 0
      for (const m of [...mail].reverse()) {
        if (m.idEsterno) {
          const gia = await db.messaggio.findFirst({ where: { idEsterno: m.idEsterno } })
          if (gia) {
            // Ripesca il corpo delle mail solo-HTML entrate vuote prima del
            // 25/08/2026 (stesso rimedio di `POST /api/email/sync`, spiegato
            // per esteso lì). È QUI che serve davvero: il cron passa da solo,
            // quindi le mail ancora sul server si riparano senza che nessuno
            // debba premere niente. Solo da vuoto a pieno, mai il contrario.
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
        // ⚠️⚠️ Mittente in elenco: la mail entra DIRETTAMENTE NEL CESTINO e non
        // conta fra i non letti. Prima entrava «già archiviata», e l'archivio
        // era diventato il posto dove si accumulava la spazzatura sotto gli
        // occhi di tutti. Chiesto dall'utente il 25/08/2026: «cliccando spam
        // deve essere proprio spam e non apparire mai più».
        //
        // ⚠️⚠️ E NON RISALE DAL CESTINO. Qui sotto `eliminataIl: null` riporta in
        // inbox una conversazione buttata quando arriva una mail nuova — giusto
        // per un cliente, sbagliatissimo per uno spam: sarebbe tornato su a ogni
        // invio, cioè «non apparire mai più» durava fino alla mail dopo.
        //
        // ⚠️ Il cestino si svuota dopo 30 giorni (`/api/cron/cestino`): una
        // regola larga in /caselle adesso può far perdere davvero una mail. È
        // scritto là dove si scrivono le regole.
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
            // Una mail nuova riporta la conversazione in inbox anche se era nel
            // cestino: chi scrive di nuovo non sa che l'avevamo buttata.
            // ⚠️⚠️ Tranne i mittenti ignorati: quelli tornano nel cestino, o lo
            // spam risalirebbe a ogni invio.
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
            // Gratis e senza chiamate: la lingua serve a far rispondere l'AI
            // nella lingua del cliente, e va saputa PRIMA che qualcuno apra.
            lingua: linguaDelTesto(m.testo),
            creatoIl: m.data,
          },
        })
        nuove++
      }
      risultati.push({ casella: casella.indirizzo, nuove, ripescate, errore: '' })
    } catch (e) {
      // Una casella che non risponde non deve fermare le altre.
      risultati.push({
        casella: casella.indirizzo,
        nuove: 0,
        ripescate: 0,
        errore: (e as Error).message,
      })
    }
  }

  const nuove = risultati.reduce((s, r) => s + r.nuove, 0)
  const ripescate = risultati.reduce((s, r) => s + r.ripescate, 0)
  // Serve solo a tenere «caldo» il risolutore dei marchi in cache: se una mail
  // nuova arriva su una casella collegata a un marchio, l'inbox la mostra già
  // nella colonna giusta al primo caricamento.
  if (nuove) await risolutoreMarchio()
  return NextResponse.json({ ok: true, nuove, ripescate, risultati })
}
