import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { verificaIban } from '@/lib/iban'
import { avvisaFornitorePagato } from '@/lib/avvisa-pagamento'
import { comunicaStatoAOrders } from '@/lib/orders'
import { riconciliaDaPagamento, type EsitoRiconciliazione } from '@/lib/riconcilia'
import { STATI_DA_SPOSTARE_SE_PAGATO } from '@/lib/riconciliazione'
import {
  segnalaFornitorePagatoAlRegistro,
  type EsitoRegistroFornitore,
} from '@/lib/registro-fornitori'
import {
  cosaManca,
  metodoValido,
  ricevutaAccettabile,
  TETTO_RICEVUTA,
} from '@/lib/metodo-pagamento'

export const dynamic = 'force-dynamic'
// Una ricevuta viaggia dentro il corpo: con una foto e una rete lenta i 10
// secondi di default non bastano.
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// CORREGGERE una richiesta salvata, oppure segnarla PAGATA con la ricevuta.
//
// ⚠️ Non esisteva nessuna delle due cose: una riga sbagliata si poteva solo
// cancellare e rifare — perdendo quando era stata scritta e da dove veniva — e
// «pagata» non si poteva dire affatto. L'app sapeva di aver *chiesto* un
// pagamento, e «chiesto» e «pagato» non sono la stessa cosa: con un fornitore
// che richiama per sapere se è stato pagato non c'era niente da guardare.

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const r = await db.richiestaPagamento.findUnique({ where: { id } })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })

  const c = (await req.json().catch(() => ({}))) as {
    azione?: 'modifica' | 'pagata' | 'nonpagata'
    iban?: string
    intestatario?: string
    importo?: number
    causale?: string
    metodo?: string
    riferimentoPagamento?: string
    ordineNumero?: string
    ricevuta?: { dati: string; nome: string; tipo: string; byte: number } | null
    /** Da dove è uscito il denaro: banca · app · contanti · compensazione · altro. */
    pagatoCon?: string
  }

  // ── SEGNARE CHE È STATA PAGATA ──
  if (c.azione === 'pagata' || c.azione === 'nonpagata') {
    if (c.azione === 'nonpagata') {
      // ⚠️ Si può disfare: capita di spuntare la riga sbagliata, e un segno che
      // non si toglie si smette di mettere. ⚠️ La ricevuta però resta: è un
      // documento, e cancellarla per un clic sbagliato sarebbe peggio.
      const tornata = await db.richiestaPagamento.update({
        where: { id },
        // ⚠️ Si azzera anche l'avviso: se il pagamento non c'è più, «avvisato»
        // sarebbe una bugia — e peggio, farebbe credere che il fornitore sappia
        // una cosa che non è vera.
        data: {
          pagataIl: null,
          pagataDaNome: '',
          pagatoCon: '',
          avvisoIl: null,
          avvisoCanale: '',
          avvisoEsito: '',
        },
      })
      return NextResponse.json({ richiesta: tornata })
    }

    const dati: Record<string, unknown> = {
      pagataIl: new Date(),
      pagataDaNome: io.nome,
      // ⚠️ Solo se ce l'ha detto. Vuoto resta «non indicato»: indovinare il
      // canale di un'uscita di denaro manderebbe qualcuno, fra sei mesi, a
      // cercare quel bonifico dove non è mai passato.
      pagatoCon: (c.pagatoCon ?? '').trim(),
    }
    if (c.ricevuta) {
      const problema = ricevutaAccettabile(c.ricevuta.tipo, c.ricevuta.byte)
      if (problema) return NextResponse.json({ errore: problema }, { status: 400 })
      // ⚠️ Si ricontrolla anche la lunghezza del testo: `byte` lo dice il
      // browser, e quello che arriva davvero è questa stringa.
      if ((c.ricevuta.dati || '').length > TETTO_RICEVUTA * 1.4) {
        return NextResponse.json({ errore: 'La ricevuta è troppo pesante.' }, { status: 400 })
      }
      dati.ricevutaDati = c.ricevuta.dati
      dati.ricevutaNome = (c.ricevuta.nome || '').slice(0, 120)
      dati.ricevutaTipo = c.ricevuta.tipo
    }
    const pagata = await db.richiestaPagamento.update({ where: { id }, data: dati })

    // ── L'ORDINE ESCE DA «IN PAGAMENTO» ──
    //
    // ⚠️ Segnalato dall'utente: un ordine con il pagamento fatto continuava a
    // dire «In pagamento», cioè lo stato di quando lo si stava pagando. Quel
    // passo è finito, e il successivo nel loro flusso è «attesa consegna».
    //
    // ⚠️⚠️ NON SOLO da `in_pagamento`. Chiesto dall'utente il 26/08/2026 — «se è
    // pagato in automatico metti in attesa di consegna» — su un ordine reale,
    // #2799: pagato il 25/08, il giorno dopo diceva ancora «Comunicazione con
    // cliente». Quello stato l'app se lo scrive DA SOLA quando qualcuno preme
    // WhatsApp, Email o Chiama: bastava una telefonata al cliente perché il
    // pagamento non spostasse più niente, e l'ordine restasse in bacheca a
    // chiedere lavoro a un collega su una cosa già chiusa.
    //
    // Gli stati sono in `STATI_DA_SPOSTARE_SE_PAGATO`: da iniziare, ricerca
    // fornitore, in pagamento, comunicazione. Restano fuori `attesa_consegna`
    // (è la destinazione), `gestito` (è la fine: un automatismo non riapre un
    // ordine che una persona ha chiuso) e `in_app` (dice CHI se ne occupa — la
    // piattaforma consegne — non a che punto siamo).
    //
    // ⚠️ Togliendo il segno «pagata» l'ordine NON torna indietro: era già stato
    // spostato a mano da qualcuno, forse, e riportarlo a «in pagamento»
    // cancellerebbe una decisione di una persona per disfare un clic.
    //
    // ⚠️ Il NUMERO com'è scritto e senza cancelletto: le richieste di pagamento
    // lo salvano con il `#`, gli ordini pure — ma un giorno che così non fosse,
    // un confronto esatto smetterebbe di trovare l'ordine SENZA dirlo a nessuno.
    if (pagata.ordineNumero) {
      try {
        const nudo = pagata.ordineNumero.replace('#', '')
        // ⚠️ Si LEGGONO prima: `updateMany` non torna le righe toccate, e senza
        // il numero e il gid non si può dire a Orders che cosa è cambiato.
        const daSpostare = await db.ordine.findMany({
          where: {
            numero: { in: [nudo, `#${nudo}`] },
            gestione: { in: STATI_DA_SPOSTARE_SE_PAGATO },
          },
          select: { id: true, numero: true, shopifyId: true },
        })
        // ⚠️⚠️ SE IL NUMERO NON È UN'IDENTITÀ, NON SI TOCCA NIENTE. La richiesta
        // di pagamento porta solo il NUMERO dell'ordine — non il negozio, non
        // l'id — e lo stesso numero può appartenere a due ordini di due negozi
        // diversi. Spostarli entrambi vorrebbe dire il falso su uno; sceglierne
        // uno vorrebbe dire indovinare quale. Si lascia il lavoro a una persona,
        // che ha il bottone «Allinea lo stato» nella Riconciliazione.
        // Contati il 26/08/2026 su 1.371 ordini e 3 negozi: **zero** numeri
        // ripetuti — ma in Deluxy Orders, che di negozi ne ha quattro, #2799
        // esiste già su più di uno.
        const ordiniPerNumero = await db.ordine.count({ where: { numero: { in: [nudo, `#${nudo}`] } } })
        const quando = new Date()
        if (ordiniPerNumero > 1) {
          // niente: due ordini con lo stesso numero non si distinguono da qui
        } else if (daSpostare.length) {
          await db.ordine.updateMany({
            where: { id: { in: daSpostare.map((o) => o.id) } },
            // ⚠️ Anche CHI: l'etichetta a schermo dice «segnato da …», e
            // lasciarci il nome di chi aveva messo lo stato di prima con la data
            // di adesso racconterebbe una cosa mai successa. L'ha causato chi ha
            // premuto «Pagata».
            data: {
              gestione: 'attesa_consegna',
              gestioneIl: quando,
              gestioneDaId: io.id,
              gestioneDaNome: io.nome,
            },
          })
          // ── E LO SA ANCHE ORDERS ──
          //
          // ⚠️⚠️ Uno stato che cambia SOLO QUI è uno stato che le altre app non
          // vedono: il Customer Service è il decisore dell'evasione (Standard
          // §7.2) e Orders mostra `csGestione` accanto alla sua pipeline. Il
          // cambio a mano glielo diceva già; questo, che avviene da solo, no —
          // e in Orders l'ordine sarebbe rimasto «in pagamento» finché qualcuno
          // non lo toccava a mano. Un automatismo che aggiorna una schermata
          // sola è peggio di nessun automatismo: due app dicono due cose e
          // nessuno sa quale vale.
          //
          // ⚠️ Best-effort, come nel cambio a mano: se Orders non risponde il
          // pagamento resta registrato e lo stato resta cambiato qui.
          for (const o of daSpostare) {
            await comunicaStatoAOrders(o.numero, o.shopifyId, 'attesa_consegna', io.nome, quando)
          }
        }
      } catch {
        // lo stato è un contorno: il pagamento resta registrato
      }
    }

    // ── L'ORDINE IMPARA CHI L'HA PREPARATO, DA SOLO ──
    //
    // ⚠️⚠️ Se il pagamento nasce QUI DENTRO, nel momento in cui si preme
    // «Pagata» sappiamo già tutto: a chi stiamo dando i soldi, quanto, e per
    // quale ordine. Chiedere poi un secondo clic su un'altra pagina vuol dire
    // far rifare a mano una cosa già decisa — ed è esattamente il motivo per
    // cui, misurato il 24/08, c'erano 8 pagamenti fatti e ZERO ordini che
    // sapessero chi li aveva preparati: nessuno fa un lavoro che sembra già
    // fatto.
    //
    // ⚠️⚠️ «Automatico» NON vuol dire «senza controlli». `riconciliaDaPagamento`
    // è la STESSA funzione del bottone a mano, e i suoi rifiuti valgono identici
    // qui: un pagamento che assomiglia a un rimborso al cliente, un fornitore
    // diverso già scritto, un costo che non torna — non si toccano. Quello che
    // non passa resta nella pagina Riconciliazione, che così diventa l'elenco
    // delle **eccezioni** invece della coda di tutto il lavoro.
    //
    // ⚠️ Prima dell'avviso, di proposito: l'avviso legge i recapiti
    // dall'ORDINE, e su un ordine senza fornitore fallirebbe con «non so a chi
    // scrivere» anche quando il fornitore lo conosciamo benissimo.
    let riconciliato: EsitoRiconciliazione | null = null
    try {
      riconciliato = await riconciliaDaPagamento(id, io, 'auto')
    } catch {
      // ⚠️ Non fa fallire il pagamento: il denaro è uscito comunque, e perdere
      // quel fatto per colpa di un contorno sarebbe il peggiore dei due errori.
      riconciliato = null
    }

    // ── L'AVVISO AL FORNITORE, DA SOLO ──
    //
    // ⚠️ Chiesto esplicitamente: «l'avviso del pagamento è automatico». Parte
    // solo perché una persona ha premuto «Pagata» — è la differenza fra
    // «automatico» e «da solo».
    //
    // ⚠️⚠️ Un fallimento qui NON fa fallire la registrazione del pagamento: il
    // denaro è uscito comunque, e perdere quel fatto perché un messaggio non è
    // partito sarebbe il peggiore dei due errori. L'esito si scrive e si mostra.
    let avviso: { canale: string; errore: string } = { canale: '', errore: '' }
    try {
      avviso = await avvisaFornitorePagato(id)
    } catch (e) {
      avviso = { canale: '', errore: e instanceof Error ? e.message : 'errore' }
    }
    const conAvviso = await db.richiestaPagamento.update({
      where: { id },
      data: {
        avvisoIl: new Date(),
        avvisoCanale: avviso.canale,
        avvisoEsito: avviso.errore,
      },
      select: { avvisoIl: true, avvisoCanale: true, avvisoEsito: true },
    })

    // ── IL FORNITORE PAGATO ENTRA NEL REGISTRO, DA SOLO ──
    //
    // ⚠️ Chiesto dall'utente il 24/08/2026: «se viene pagato un fornitore
    // aggiungilo direttamente in anagrafica se non già esistente». Il registro
    // (deluxy-anagrafiche) fa l'upsert-merge e resta il proprietario del dato.
    //
    // ⚠️ NON quando il pagamento è un rimborso al cliente: quel beneficiario
    // non è un fornitore, e il registro dei partner non è il posto suo. È lo
    // stesso verdetto della riconciliazione, non un secondo controllo.
    //
    // ⚠️ Un fallimento qui NON fa fallire il pagamento (stesso contratto
    // dell'avviso): l'esito si restituisce e basta.
    let registro: EsitoRegistroFornitore | null = null
    if (riconciliato?.verdetto === 'rimborso-al-cliente') {
      registro = {
        ok: false,
        esito: 'rimborso',
        messaggio: 'Sembra un rimborso al cliente: non è un fornitore, il registro non si tocca.',
      }
    } else {
      try {
        registro = await segnalaFornitorePagatoAlRegistro(id)
      } catch (e) {
        registro = {
          ok: false,
          esito: 'errore',
          messaggio: e instanceof Error ? e.message : 'errore',
        }
      }
    }

    return NextResponse.json({ richiesta: { ...pagata, ...conAvviso }, avviso, riconciliato, registro })
  }

  // ── CORREGGERE ──
  //
  // ⚠️⚠️ Solo finché NON è stata mandata a chi approva. Dopo, quello che c'è
  // qui e quello che ha in mano l'altra app divergerebbero in silenzio: si
  // leggerebbe un importo e ne verrebbe pagato un altro. Si dice, invece di
  // impedirlo senza spiegare.
  if (r.inviataIl) {
    return NextResponse.json(
      {
        errore:
          'Questa richiesta è già stata mandata a chi approva: correggerla qui la farebbe diverge' +
          'e da quella che hanno loro. Elimina questa e rifalla, oppure correggila da là.',
      },
      { status: 409 }
    )
  }

  const metodo = (c.metodo ?? r.metodo).trim()
  if (!metodoValido(metodo)) {
    return NextResponse.json({ errore: 'Metodo di pagamento non valido.' }, { status: 400 })
  }
  const iban = (c.iban ?? r.iban).trim()
  const intestatario = (c.intestatario ?? r.intestatario).trim()
  const riferimento = (c.riferimentoPagamento ?? r.riferimentoPagamento).trim()

  const manca = cosaManca({ metodo, iban, riferimento, intestatario })
  if (manca) return NextResponse.json({ errore: manca }, { status: 400 })

  // ⚠️ L'IBAN si riverifica a ogni correzione: se non lo si rifacesse, una riga
  // nata valida resterebbe segnata «valido» anche dopo averci scritto dentro
  // un'altra cosa. E su un metodo che non è un bonifico non c'è niente da
  // verificare: `false` qui vuol dire «non applicabile», non «sbagliato».
  const esito = metodo === 'iban' ? verificaIban(iban) : null

  const aggiornata = await db.richiestaPagamento.update({
    where: { id },
    data: {
      metodo,
      iban: metodo === 'iban' ? iban : '',
      riferimentoPagamento: metodo === 'iban' ? '' : riferimento,
      intestatario,
      importo: typeof c.importo === 'number' && c.importo >= 0 ? c.importo : r.importo,
      causale: (c.causale ?? r.causale).trim(),
      ordineNumero: (c.ordineNumero ?? r.ordineNumero).trim(),
      ibanValido: esito ? esito.valido : false,
      ibanPaese: esito ? esito.paese : '',
    },
  })
  return NextResponse.json({ richiesta: aggiornata, motivoIban: esito?.motivo ?? '' })
}
