import type { Account } from '@prisma/client'
import { db } from './db'
import { spedisci } from './invio'

// ASSENZA (out of office): la risposta automatica a chi ti scrive mentre sei
// via, e l'inoltro della posta a un indirizzo che hai indicato.
//
// ⚠️⚠️ Questo è l'unico punto dell'app in cui una mail parte SENZA che nessuno
// prema invio. Tutto il resto del file è scritto attorno a quel fatto: chi
// scrive «rispondi da solo» si aspetta una cortesia, non un automatismo che
// litiga con l'automatismo di qualcun altro per tremila giri.

/** Le impostazioni di assenza di un utente (i campi di `Utente`). */
export type ImpostazioniAssenza = {
  assenzaAttiva: boolean
  assenzaDal: Date | null
  assenzaAl: Date | null
  assenzaMessaggio: string
  assenzaInoltra: boolean
  assenzaInoltraA: string
}

/** Il minimo che serve sapere di una mail appena arrivata. */
export type MailArrivata = {
  id: string
  messageId: string | null
  mittente: string
  mittenteNome: string | null
  oggetto: string
  data: Date
  corpoTesto: string
  corpoHtml: string | null
  allegati: number
}

/**
 * L'assenza è in corso ADESSO?
 *
 * ⚠️ Le due date sono facoltative e vogliono dire cose diverse: `dal` è la
 * barriera contro l'arretrato (non si risponde a posta più vecchia
 * dell'assenza), `al` è la fine. Senza `al`, l'assenza dura finché non la
 * spegni — è il caso di chi non sa quando torna.
 */
export function assenzaInCorso(u: ImpostazioniAssenza, ora: Date = new Date()): boolean {
  if (!u.assenzaAttiva) return false
  if (u.assenzaDal && ora < u.assenzaDal) return false
  if (u.assenzaAl && ora > u.assenzaAl) return false
  return true
}

/**
 * Le parti iniziali di indirizzo che denunciano un mittente NON umano.
 *
 * ⚠️ Serve perché qui non abbiamo le intestazioni della mail: il modo pulito
 * di riconoscere un messaggio automatico sarebbe leggere `Auto-Submitted`,
 * `Precedence: bulk` o `List-Id`, ma lo scaricatore tiene solo i campi che
 * servono a mostrare la posta. Questo elenco è un ripiego dichiarato, non una
 * difesa completa: prende i casi che contano (le notifiche e i «non
 * rispondere»), e quello che gli sfugge lo ferma comunque la regola del
 * «una risposta sola per mittente».
 */
const AUTOMATICI = [
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'bounce',
  'bounces',
  'notification',
  'notifications',
  'newsletter',
  'alert',
  'alerts',
  'automated',
  'nepasrepondre',
]

/** Un indirizzo a cui NON ha senso rispondere: è una macchina. */
export function mittenteAutomatico(email: string): boolean {
  const locale = (email.toLowerCase().split('@')[0] || '').trim()
  if (!locale) return true
  // ⚠️ Anche la parte PRIMA del «+»: i rimbalzi viaggiano quasi sempre in
  // forma VERP, cioè con l'indirizzo di ritorno codificato dopo un più —
  // `bounces+123-abc@sendgrid.net`. Confrontando solo la stringa intera,
  // quello passava per un mittente umano e si sarebbe risposto a un rimbalzo.
  const teste = [locale, locale.split('+')[0]]
  return teste.some((t) =>
    AUTOMATICI.some((p) => t === p || t.startsWith(`${p}.`) || t.startsWith(`${p}-`) || t.startsWith(`${p}_`))
  )
}

/** Il primo indirizzo scritto in un campo che può contenerne più d'uno. */
function soloEmail(v: string): string {
  const dentro = v.match(/<([^<>]+)>/)
  return (dentro ? dentro[1] : v).trim().toLowerCase()
}

/**
 * Quante mail al massimo può far partire l'assenza in UN giro di sincronia.
 *
 * ⚠️ Non è una preferenza: è il freno a mano. Se qualcosa va storto — un
 * arretrato che rientra, un mittente che rimbalza — meglio dieci mail sbagliate
 * che trecento. Quello che avanza NON si recupera al giro dopo, ed è voluto:
 * una risposta d'assenza arrivata due ore tardi va bene, una valanga no.
 *
 * ⚠️⚠️ Il contatore vive in `sincronizzaAccount`, NON dentro `salvaMessaggi`.
 * Sembra un dettaglio e non lo è: `salvaMessaggi` lavora su un BLOCCO di mail
 * e viene richiamata fino a venti volte per giro, quindi un contatore locale a
 * lei si riazzerava a ogni blocco — il tetto vero era 200 per casella, cioè
 * venti volte quello scritto qui. Con quattro caselle e il cron ogni cinque
 * minuti, il freno a mano non frenava.
 */
export const TETTO_PER_GIRO = 10

/** Il contatore condiviso fra i blocchi di un giro di sincronia. */
export type BudgetAssenza = { resto: number }

/** L'intestazione di una mail inoltrata, in testo semplice. */
function intestazione(m: MailArrivata): string {
  const righe = [
    '---------- Messaggio inoltrato ----------',
    `Da: ${m.mittenteNome ? `${m.mittenteNome} <${m.mittente}>` : m.mittente}`,
    `Data: ${m.data.toLocaleString('it-IT')}`,
    `Oggetto: ${m.oggetto || '(senza oggetto)'}`,
  ]
  if (m.allegati > 0) {
    // ⚠️ Detto, non nascosto: gli allegati NON viaggiano con l'inoltro
    // automatico. Vivono sul server IMAP e andrebbero ripescati uno a uno
    // durante la sincronia, che è il momento in cui c'è meno tempo di tutti.
    // Chi riceve deve sapere che manca qualcosa, o si comporterà come se la
    // mail fosse tutta lì.
    righe.push(
      `⚠️ La mail originale ha ${m.allegati} ${m.allegati === 1 ? 'allegato' : 'allegati'}, che NON sono stati inoltrati: restano in AI Mail.`
    )
  }
  righe.push('')
  return righe.join('\n')
}

function intestazioneHtml(m: MailArrivata): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="border-left:3px solid #ddd;padding-left:12px;color:#666;font-size:13px">${esc(
    intestazione(m)
  ).replace(/\n/g, '<br>')}</div>`
}

/**
 * Cosa deve succedere a una mail arrivata mentre sei via.
 *
 * Restituisce quante mail ha fatto partire (0, 1 o 2), così chi chiama può
 * tenere il conto del tetto per giro.
 *
 * ⚠️⚠️ Non lancia MAI: un guasto qui non deve far fallire lo scarico della
 * posta. Se l'automatismo non parte, la mail è comunque arrivata — che è la
 * cosa che conta.
 */
export async function applicaAssenza(opts: {
  utenteId: string
  utente: ImpostazioniAssenza
  account: Account
  mail: MailArrivata
  /** Tutti gli indirizzi delle TUE caselle, minuscoli. */
  nostreCaselle: string[]
  /**
   * La mail è già stata messa da parte: spam riconosciuto dal filtro, oppure
   * archiviata o smistata da una REGOLA dell'utente.
   *
   * ⚠️⚠️ Non è solo lo spam, e la differenza è misurata: una mail agganciata
   * da una regola con «archivia» (o mandata in una sezione) salta del tutto il
   * filtro anti-spam, quindi arrivava qui con «spam: false» pur essendo posta
   * che l'utente ha già deciso di non voler vedere. In produzione: 53 regole
   * di quel tipo, 170 mail in 30 giorni da 27 mittenti — cioè 27 risposte
   * automatiche a degli spammer e 170 inoltri a un collega.
   */
  giaMessaVia: boolean
}): Promise<number> {
  const { utenteId, utente, account, mail, nostreCaselle, giaMessaVia } = opts
  let partite = 0
  try {
    if (giaMessaVia) return 0
    if (!assenzaInCorso(utente)) return 0

    // ⚠️⚠️ LA BARRIERA CONTRO L'ARRETRATO. Accendendo l'assenza si scrive
    // `assenzaDal`; qui si scarta tutto ciò che è più vecchio. Senza questa
    // riga, il primo giro di sincronia dopo l'accensione avrebbe risposto (e
    // inoltrato) a ogni mail non ancora scaricata — cioè, per una casella
    // rimasta indietro, a settimane di posta in una volta sola.
    if (utente.assenzaDal && mail.data < utente.assenzaDal) return 0

    const mittente = soloEmail(mail.mittente)
    if (!mittente || !mittente.includes('@')) return 0

    // ⚠️ Mai a se stessi: le tue caselle si scrivono fra loro (una mail a due
    // tuoi indirizzi entra due volte), e rispondere sarebbe il primo anello
    // di un giro che non finisce.
    if (nostreCaselle.includes(mittente)) return 0

    // ---------- L'INOLTRO ----------
    const inoltraA = (utente.assenzaInoltraA || '').trim().toLowerCase()
    if (utente.assenzaInoltra && inoltraA.includes('@')) {
      // ⚠️ Due giri da evitare, e valgono anche se l'impostazione è stata
      // salvata prima che il controllo esistesse:
      //  - inoltrare a una TUA casella: la mail rientra, e riparte;
      //  - inoltrare a chi ha appena scritto: ping-pong con lui.
      const pericoloso = nostreCaselle.includes(inoltraA) || inoltraA === mittente
      if (!pericoloso) {
        const corpo = `${intestazione(mail)}${mail.corpoTesto || ''}`
        await spedisci(account, {
          a: inoltraA,
          oggetto: `Fwd: ${mail.oggetto || '(senza oggetto)'}`,
          corpo,
          corpoHtml: mail.corpoHtml ? `${intestazioneHtml(mail)}${mail.corpoHtml}` : undefined,
        })
        partite++
        await registra(utenteId, 'inoltro', inoltraA, mail)
      }
    }

    // ---------- LA RISPOSTA AUTOMATICA ----------
    const testo = (utente.assenzaMessaggio || '').trim()
    if (!testo) return partite
    if (mittenteAutomatico(mittente)) return partite

    // ⚠️⚠️ UNA SOLA per mittente, per tutta l'assenza. È la difesa che conta
    // davvero: se anche dall'altra parte c'è un risponditore automatico, senza
    // questa riga i due si scriverebbero all'infinito. Il conto parte da
    // `assenzaDal`, così una nuova assenza ricomincia da capo (chi ti riscrive
    // fra sei mesi merita di risapere che sei via).
    const gia = await db.assenzaInvio.count({
      where: {
        utenteId,
        tipo: 'risposta',
        email: mittente,
        ...(utente.assenzaDal ? { quando: { gte: utente.assenzaDal } } : {}),
      },
    })
    if (gia > 0) return partite

    // ⚠️⚠️ IL SEGNO PRIMA DELLA MAIL. La regola «una sola risposta per
    // mittente» vive nel registro: se la riga non si scrive, la regola non
    // esiste più — e il `catch` che la ingoiava rendeva la cosa SILENZIOSA.
    // Provato con la scrittura in errore: allo stesso mittente partivano
    // cinque risposte invece di una. Adesso si prenota prima: se il registro
    // non accetta la riga (database in sola lettura, tabella non migrata) non
    // si spedisce affatto. Una risposta di cortesia non mandata è un
    // fastidio; cinque allo stesso mittente sono un guasto che si vede da
    // fuori.
    if (!(await registra(utenteId, 'risposta', mittente, mail))) return partite

    await spedisci(account, {
      a: mittente,
      oggetto: `Re: ${mail.oggetto || '(senza oggetto)'}`,
      corpo: testo,
      inRispostaA: mail.messageId,
    })
    partite++
    return partite
  } catch (e) {
    console.error('[AI Mail] assenza:', e instanceof Error ? e.message : e)
    return partite
  }
}

/**
 * Il registro di cosa è partito: si vede in Impostazioni, e impedisce il bis.
 *
 * Restituisce `false` se la riga non si è potuta scrivere — e chi chiama, per
 * la risposta automatica, in quel caso NON spedisce (vedi sopra).
 */
async function registra(utenteId: string, tipo: string, email: string, mail: MailArrivata): Promise<boolean> {
  try {
    await db.assenzaInvio.create({
      data: { utenteId, tipo, email, oggetto: mail.oggetto.slice(0, 200), messaggioId: mail.id },
    })
    return true
  } catch {
    return false
  }
}
