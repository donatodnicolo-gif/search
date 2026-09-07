import type { Account } from '@prisma/client'
import { db } from './db'
import { strutturaMessaggio, scaricaParte, htmlEStrutturaImap } from './imap'
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

/**
 * L'HTML del corpo E l'elenco degli allegati, dal server, in UNA connessione.
 *
 * ⚠️ È il wrapper che decide se l'HTML serve davvero: se è già in casa
 * (`corpoHtml`) si passa `serveHtml: false` e la connessione lista solo gli
 * allegati, senza scaricare il corpo per niente. La decodifica del buffer sta
 * QUI, in un posto solo (come `htmlDalServer`), non nella primitiva IMAP.
 *
 * Best-effort: se il server non risponde, torna html null e allegati vuoti —
 * chi chiama ripiega sul testo, esattamente come prima.
 */
export async function htmlEAllegatiDalServer(
  m: ConCorpoEAccount,
  serveHtml: boolean
): Promise<{ html: string | null; allegati: { nome: string; tipo: string; dimensione: number; parte: string }[] }> {
  if (m.uid <= 0) return { html: null, allegati: [] }
  const cartella = cartellaDiMessaggio(
    { direzione: m.direzione, cestinato: m.cestinato ?? false, sezione: m.sezione },
    m.account
  )
  try {
    const r = await htmlEStrutturaImap(m.account, m.uid, serveHtml, cartella)
    const html = r.htmlGrezzo ? decodifica(r.htmlGrezzo, r.htmlCharset) : null
    return { html, allegati: r.allegati }
  } catch {
    return { html: null, allegati: [] }
  }
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
 *
 * 🔴 **E QUANDO NON C'È PIÙ NIENTE DA PULIRE?** (misurato il 07/09/2026) Questa
 * ricerca non ha un indice che la sostenga: per trovare le mille righe scandisce
 * TUTTA la tabella e scarta 44.514 righe, ~121 MB di buffer, 2,8 secondi in
 * media e fino a 76. Finito il pregresso continuava a farlo **ogni cinque
 * minuti per nulla**: 5.493 chiamate, **15.266.107 ms — quattro ore e un
 * quarto di CPU del database — per 405 righe in tutto**. Era la query più
 * costosa dell'INTERO cluster condiviso da 14 app, davanti a piattaforma e
 * Orders, e il ricambio forzato sui 224 MB di cache comune rallentava tutti,
 * noi per primi ([[trappola-lavoro-periodico-che-non-ha-piu-lavoro]]).
 *
 * Il rimedio NON è un indice (lo schema è condiviso, gli indici si concordano):
 * è **smettere di chiedere**. Quando un giro non trova niente, la pulizia si
 * riaddormenta per `RIPOSO_ORE` e nel frattempo costa **zero query**. Non è un
 * interruttore «finito per sempre»: le mail invecchiano, ogni giorno qualcuna
 * supera la finestra calda — al risveglio, se trova pane, si rimette a
 * smaltirlo un lotto per giro come prima.
 */
const RIPOSO_ORE = 24
const CHIAVE_RIPOSO = 'html.pulizia.dormi_fino_a'

export async function pulisciHtmlVecchio(lotto = 1000): Promise<number> {
  try {
    // Il segnalino costa una lettura per chiave primaria su una tabella di
    // poche righe: è il modo di NON pagare la scansione quando è inutile.
    const dormi = await db.impostazione
      .findUnique({ where: { chiave: CHIAVE_RIPOSO }, select: { valore: true } })
      .catch(() => null)
    if (dormi && Date.now() < Number(dormi.valore)) return 0

    const limite = new Date(Date.now() - GIORNI_HTML_CALDO * 24 * 60 * 60 * 1000)
    const righe = await db.messaggio.findMany({
      where: { corpoHtml: { not: null }, uid: { gt: 0 }, data: { lt: limite } },
      select: { id: true },
      take: lotto,
    })
    if (righe.length === 0) {
      await dormiFinoA(Date.now() + RIPOSO_ORE * 60 * 60 * 1000)
      return 0
    }
    // C'è ancora pregresso: si resta svegli, un lotto per giro come prima.
    if (dormi) await dormiFinoA(0)
    const r = await db.messaggio.updateMany({
      where: { id: { in: righe.map((x) => x.id) } },
      data: { corpoHtml: null },
    })
    return r.count
  } catch {
    return 0 // database occupato o in sola lettura: si riprova al giro dopo
  }
}

/** Scrive (o azzera) il segnalino del riposo. Non fa mai fallire la pulizia:
 *  se il segnalino non si scrive, il giro dopo si torna a scandire — spreco,
 *  non danno. */
async function dormiFinoA(quando: number): Promise<void> {
  try {
    await db.impostazione.upsert({
      where: { chiave: CHIAVE_RIPOSO },
      create: { chiave: CHIAVE_RIPOSO, valore: String(quando) },
      update: { valore: String(quando) },
    })
  } catch {
    /* niente: al massimo si riscandisce */
  }
}
