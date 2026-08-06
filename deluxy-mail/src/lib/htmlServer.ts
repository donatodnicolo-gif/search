import type { Account } from '@prisma/client'
import { db } from './db'
import { strutturaMessaggio, scaricaParte } from './imap'
import { cartellaDiMessaggio } from './cartelleServer'

// Il CORPO HTML delle mail, preso dal server QUANDO SERVE invece che tenuto per
// sempre nel database.
//
// ⚠️ PERCHÉ. Il database di AI Mail è arrivato a 1,5 GB, e il 99% era UNA
// tabella: `Messaggio`. Dentro, il grosso erano i corpi HTML — pesano 5-10
// volte il testo e servono a una cosa sola: rimostrare la mail impaginata
// quando la si apre. Tutto il resto dell'app (ricerca, raggruppamenti, AI,
// attività, anteprime) lavora sul TESTO, che resta nel database.
//
// La casella IMAP è comunque la fonte di verità: l'HTML sta già là, per intero,
// e l'app sa già andarselo a prendere al volo — lo fa per gli allegati e per
// gli inviti di calendario. Qui si applica lo stesso principio al corpo:
//
//  - le mail RECENTI (ultimi GIORNI_HTML_CALDO giorni) tengono l'HTML nel
//    database: sono quelle che si aprono di continuo, e aprirle resta
//    istantaneo;
//  - le mail più VECCHIE lo perdono (pulizia graduale dal cron) e lo
//    RIPRENDONO dal server all'apertura, in un attimo, senza risalvarlo;
//  - le mail che sul server non ci sono più (uid perso) mostrano il testo:
//    per quelle l'impaginato non esiste più da nessuna parte.
//
// Così il database resta piccolo PER SEMPRE — non è una pulizia una tantum, è
// un tetto — e nessuna funzione sparisce: cambia solo dove abita l'HTML.

/** Per quanti giorni l'HTML resta nel database (la posta "calda"). */
export const GIORNI_HTML_CALDO = 30

/** True se la mail è abbastanza recente da tenere l'HTML in casa. */
export function htmlCaldo(data: Date): boolean {
  return Date.now() - data.getTime() < GIORNI_HTML_CALDO * 24 * 60 * 60 * 1000
}

/** Decodifica i byte di una parte testuale rispettando il charset dichiarato. */
function decodifica(dati: Buffer, charset: string): string {
  // I nomi vanno normalizzati: i server scrivono "ISO-8859-1", "iso8859-1"…
  const nome = (charset || 'utf-8').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'utf-8'
  try {
    return new TextDecoder(nome, { fatal: false }).decode(dati)
  } catch {
    // Charset sconosciuto a TextDecoder: utf-8 è il ripiego meno dannoso.
    return new TextDecoder('utf-8', { fatal: false }).decode(dati)
  }
}

/**
 * Scarica dal server SOLO la parte `text/html` di un messaggio (non gli
 * allegati, non tutta la mail). null se il messaggio non ha una versione HTML
 * o non è più sul server.
 */
export async function htmlDalServer(
  account: Account,
  uid: number,
  cartella?: string
): Promise<string | null> {
  if (uid <= 0) return null
  const foglie = await strutturaMessaggio(account, uid, cartella)
  // La versione HTML del corpo: text/html SENZA nome di file (con un nome è un
  // allegato .html, che è un'altra cosa e resta nell'elenco allegati).
  const parte = foglie.find((f) => f.tipo === 'text/html' && !f.nome)
  if (!parte) return null
  const dati = await scaricaParte(account, uid, parte.parte, cartella)
  if (!dati) return null
  return decodifica(dati, parte.charset)
}

type ConCorpoEAccount = {
  corpoHtml: string | null
  uid: number
  direzione: string
  // Una mail cestinata sta nel Cestino DELLA CASELLA, non più in INBOX: senza
  // questo, aprendola dal Cestino l'impaginato non si troverebbe più.
  cestinato?: boolean
  // Idem per lo SPAM: sta nella Posta indesiderata della casella.
  sezione?: { nome: string } | null
  account: Account
}

/**
 * L'HTML di un messaggio, da dove sta: il database se c'è, altrimenti il
 * server. NON lo risalva — risalvarlo rigonfierebbe il database che si è
 * appena alleggerito. Best-effort: se il server non risponde si torna null e
 * chi chiama ripiega sul testo.
 */
export async function htmlDiMessaggio(m: ConCorpoEAccount): Promise<string | null> {
  if (m.corpoHtml) return m.corpoHtml
  if (m.uid <= 0) return null
  const cartella = cartellaDiMessaggio(
    { direzione: m.direzione, cestinato: m.cestinato ?? false, sezione: m.sezione },
    m.account
  )
  try {
    return await htmlDalServer(m.account, m.uid, cartella)
  } catch {
    return null
  }
}

/**
 * PULIZIA GRADUALE: toglie l'HTML alle mail più vecchie della finestra calda,
 * un lotto per giro di cron. Graduale apposta: un UPDATE unico su decine di
 * migliaia di righe TEXT terrebbe il database occupato per minuti — mille alla
 * volta, ogni cinque minuti, il pregresso si smaltisce in poche ore senza che
 * nessuno se ne accorga.
 *
 * Si toglie SOLO dove `uid > 0`, cioè dove la mail sul server c'è ancora e
 * l'HTML si può riprendere. Le copie solo-locali (uid ≤ 0) lo tengono: per
 * loro il database È l'unico posto dove l'impaginato esiste.
 *
 * ⚠️ Lo spazio liberato torna riusabile (il database smette di crescere) dopo
 * l'autovacuum; il NUMERO riportato da Supabase scende solo con un
 * VACUUM FULL, da lanciare una tantum a pulizia finita (libera-spazio.sql).
 */
export async function pulisciHtmlVecchio(lotto = 1000): Promise<number> {
  try {
    const limite = new Date(Date.now() - GIORNI_HTML_CALDO * 24 * 60 * 60 * 1000)
    const righe = await db.messaggio.findMany({
      where: { corpoHtml: { not: null }, uid: { gt: 0 }, data: { lt: limite } },
      select: { id: true },
      take: lotto,
    })
    if (righe.length === 0) return 0
    const r = await db.messaggio.updateMany({
      where: { id: { in: righe.map((x) => x.id) } },
      data: { corpoHtml: null },
    })
    return r.count
  } catch {
    return 0 // database occupato o in sola lettura: si riprova al giro dopo
  }
}
