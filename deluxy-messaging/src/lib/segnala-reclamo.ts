import { db } from './db'
import { listaEscluse } from './dettaglio-ordine'
import { marchioDdt } from './manda-in-app'
import { consegnePerDdt, segnalaReclamoInPiattaforma } from './piattaforma'

// ── «GUARDA CHE C'È UN RECLAMO» ──────────────────────────────────────────────
//
// ⚠️⚠️ Chiesto dall'utente l'11/09/2026: «se all'ordine è associato una
// consegna su app delivery invia una segnalazione all'app delivery di vedere il
// reclamo».
//
// Il caso vero: il cliente si lamenta di un ordine che, dall'altra parte, è una
// consegna con un valet, un partner e una data. Fino a ieri quel reclamo restava
// tutto qui: chi ha portato i fiori non sapeva che qualcuno si fosse lamentato,
// e lo scopriva settimane dopo dal giudizio a fine mese — quando ormai nessuno
// si ricordava più di quel giro.
//
// Le regole di questo pezzo, tutte per lo stesso motivo (è una scrittura in casa
// d'altri, e finisce nella bacheca di persone che lavorano):
//   · si manda SOLO se la consegna di là esiste davvero — il ponte è il numero
//     d'ordine PIÙ il marchio, perché «#1834» esiste su più negozi;
//   · una volta sola per reclamo (`segnalatoIl` fa da guardia): risalvare un
//     reclamo non deve riempire la loro bacheca di doppioni;
//   · non si manda né la colpa né il giudizio: quelli si decidono qui, e
//     scriverli di là prima che qualcuno abbia deciso sarebbe una condanna
//     senza processo. Si manda quello che dice il cliente;
//   · best-effort: se non parte, il reclamo si salva lo stesso e il perché
//     resta scritto in `segnalazioneEsito`. Un reclamo perso perché un'altra
//     app non rispondeva sarebbe un danno molto peggiore del non avvisarla.

export type EsitoSegnalazione = {
  /** È partita davvero. */
  mandata: boolean
  /** Cosa è successo, in italiano: finisce nel campo `segnalazioneEsito`. */
  esito: string
}

/** Gli stati in cui la consegna è annullata: avvisare chi non consegna più non serve. */
const STATI_MORTI = ['cancelled', 'annullata', 'not_accepted', 'non_accettata']

/**
 * Manda alla piattaforma consegne la segnalazione di un reclamo, se quell'ordine
 * di là è una consegna.
 *
 * ⚠️ Non lancia MAI: torna che cos'è successo. Chi chiama la usa dopo aver già
 * salvato il reclamo.
 */
export async function segnalaReclamoAllaPiattaforma(
  reclamoId: string,
  chiLoApre = ''
): Promise<EsitoSegnalazione> {
  try {
    const r = await db.reclamo.findUnique({ where: { id: reclamoId } })
    if (!r) return { mandata: false, esito: '' }
    // La guardia: una volta sola.
    if (r.segnalatoIl) return { mandata: false, esito: r.segnalazioneEsito }
    if (!r.ordineNumero.trim()) {
      return segna(reclamoId, false, 'Reclamo senza numero d’ordine: niente da collegare in piattaforma.')
    }

    // Le consegne scollegate a mano dalla scheda dell'ordine non contano: se
    // qualcuno ha detto «questa consegna non è di quest'ordine», non si va a
    // scrivergli sopra una segnalazione.
    const ordine = r.ordineId
      ? await db.ordine.findUnique({
          where: { id: r.ordineId },
          select: { appConsegneEscluse: true, negozioNome: true },
        })
      : null

    const trovate = await consegnePerDdt(
      r.ordineNumero,
      marchioDdt(ordine?.negozioNome || r.negozioNome || ''),
      listaEscluse(ordine?.appConsegneEscluse)
    )
    if (trovate.stato === 'non-configurato') {
      return segna(reclamoId, false, 'Piattaforma consegne non collegata: segnalazione non mandata.')
    }
    if (trovate.stato === 'errore') {
      return segna(reclamoId, false, `Segnalazione non mandata: ${trovate.messaggio}`)
    }
    const consegne = trovate.stato === 'ok' ? trovate.dati.consegne : []
    // ⚠️ Le annullate si scartano: una segnalazione su una consegna morta
    // arriva a chi non ha più niente da guardare.
    const viva = consegne.find((c) => !STATI_MORTI.includes((c.stato || '').toLowerCase()))
    if (!viva) {
      return segna(
        reclamoId,
        false,
        consegne.length
          ? 'La consegna collegata è annullata: segnalazione non mandata.'
          : 'Quest’ordine non ha una consegna in piattaforma: niente da segnalare.'
      )
    }

    const numero = viva.numero ? ` n. ${viva.numero}` : ''
    const mandata = await segnalaReclamoInPiattaforma({
      deliveryId: viva.id,
      oggetto: `Reclamo sull’ordine ${r.ordineNumero}${r.negozioNome ? ` (${r.negozioNome})` : ''}`,
      // ⚠️ Il testo è per una persona che apre la bacheca, non per un
      // programma: dice di che ordine si parla, che cosa lamenta il cliente e
      // che si risponde qui. La colpa NON c'è: non è ancora decisa.
      testo: [
        `Il servizio clienti ha aperto un reclamo sull’ordine ${r.ordineNumero}${
          r.clienteNome ? ` di ${r.clienteNome}` : ''
        }.`,
        r.casistica ? `Casistica: ${r.casistica}.` : '',
        r.descrizione ? `Il cliente dice: ${r.descrizione}` : '',
        `Consegna collegata${numero}. Guardate com’è andata: il reclamo si lavora dal Customer Service.`,
      ]
        .filter(Boolean)
        .join('\n'),
      riferimento: `reclamo:${r.id}`,
      apertaDaNome: chiLoApre,
    })

    if (mandata.stato === 'ok') {
      return segna(
        reclamoId,
        true,
        `Segnalata alla piattaforma consegne il ${new Date().toLocaleString('it-IT')} sulla consegna${numero}.`
      )
    }
    if (mandata.stato === 'non-trovato') {
      // ⚠️ La rotta non c'è ancora di là: si dice com'è, senza far finta che
      // sia partita. Chi legge deve sapere che quella consegna NON è stata
      // avvisata, e poterlo fare a voce.
      return segna(
        reclamoId,
        false,
        'La piattaforma consegne non ha (ancora) la rotta delle segnalazioni: avvisa a voce.'
      )
    }
    return segna(
      reclamoId,
      false,
      `Segnalazione non mandata: ${mandata.stato === 'errore' ? mandata.messaggio : mandata.stato}`
    )
  } catch (e) {
    // ⚠️ Qualunque cosa vada storta, il reclamo è già salvato: qui si annota e
    // basta. Nessuna eccezione esce da questa funzione.
    return { mandata: false, esito: `Segnalazione non mandata: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

/**
 * Scrive com'è andata sul reclamo.
 *
 * ⚠️ `segnalatoIl` si mette SOLO quando è partita davvero: se non è partita, il
 * prossimo tentativo deve poterci riprovare. Il motivo invece si scrive sempre.
 */
async function segna(id: string, mandata: boolean, esito: string): Promise<EsitoSegnalazione> {
  await db.reclamo
    .update({
      where: { id },
      data: { segnalazioneEsito: esito, ...(mandata ? { segnalatoIl: new Date() } : {}) },
    })
    .catch(() => null)
  return { mandata, esito }
}
