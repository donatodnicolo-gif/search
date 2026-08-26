import { db } from '@/lib/db'
import { formeNumero } from '@/lib/diario'

// ── QUANDO L'ORDINE È GESTITO, LE SUE NOTE SI CHIUDONO ──
//
// ⚠️⚠️ Chiesto dall'utente il 26/08/2026: «quando un ordine viene messo come
// gestito chiudi le note associate». Il diario è la lista di quello che resta da
// fare; una riga che parla di un ordine finito **non resta da fare**, ma finora
// restava lì — e chi apriva il diario si trovava davanti cose già chiuse
// mescolate a quelle vere. Due o tre righe così e l'elenco si smette di leggere,
// che è il modo in cui una nota importante passa inosservata.
//
// ⚠️ Sta in un file suo e non in `src/lib/diario.ts`: quello è fatto di funzioni
// pure (riconoscere il numero in testa, normalizzarlo) e deve poter essere
// importato ovunque. Bastava aggiungerci `db` per tirarsi dietro il client
// Prisma in un bundle del browser — con un errore che parla di webpack e non
// nomina mai la causa.

/**
 * Chiude tutte le note ANCORA APERTE legate a quel numero d'ordine.
 *
 * @returns quante ne ha chiuse. Serve a dirlo: righe che spariscono da un
 *          elenco senza lasciare un numero fanno credere di non essere mai
 *          esistite, e nessuno si accorgerebbe se ne stesse chiudendo troppe.
 */
export async function chiudiNoteDellOrdine(numero: string, chiNome: string): Promise<number> {
  // ⚠️ TUTTE E DUE le forme del numero: in tabella stanno col cancelletto, a
  // mano si scrivono senza. Cercandone una sola non si chiuderebbe niente —
  // **senza dare errore**, che è il difetto peggiore da trovare.
  const forme = formeNumero(numero)
  if (!forme.length) return 0
  try {
    const esito = await db.notaDiario.updateMany({
      // ⚠️ `fatta: false` sta nel `where` della SCRITTURA, non solo in una
      // lettura fatta prima: fra le due query lo stato può cambiare, e
      // riscrivere `fattaIl`/`fattaDaNome` su una nota che qualcuno ha appena
      // chiuso vorrebbe dire cancellare il suo nome dal registro.
      where: { ordineNumero: { in: forme }, fatta: false },
      data: {
        fatta: true,
        fattaIl: new Date(),
        // ⚠️ Il nome di chi ha premuto «Gestito», non «sistema»: è quel gesto ad
        // aver chiuso la nota, e fra sei mesi la domanda sarà «chi l'ha
        // chiusa?».
        fattaDaNome: chiNome,
      },
    })
    return esito.count
  } catch {
    // ⚠️ Il diario è un contorno: se questa fallisce, l'ordine resta gestito. Il
    // contrario — perdere il cambio di stato perché una nota non si è chiusa —
    // sarebbe il peggiore dei due errori.
    return 0
  }
}

// ⚠️⚠️ NON ESISTE IL CONTRARIO, ED È VOLUTO. Riaprendo un ordine le note NON si
// riaprono: potrebbero essere state fatte davvero, e riaprirle vorrebbe dire
// rimettere in lista di lavoro cose già finite — cioè disfare con un automatismo
// la spunta di una persona. Se una nota andava tenuta aperta, si riapre a mano
// dal diario, dove c'è il suo bottone.
