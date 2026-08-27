import crypto from 'node:crypto'
import { db } from './db'
import { decifra } from './crypto'

// L'autenticazione delle API pubbliche di AI Mail (le rotte /api/v1/*, con cui
// altre app Deluxy o script possono richiamare invio e "punto della situazione").
//
// Chiave unica, inviata come header `x-api-key` o `Authorization: Bearer`. Il
// chiamante indica su quale utente/casella agire con l'header `x-utente`
// (l'email di login dell'utente AI Mail).
//
// Il token può essere GENERATO dall'app (Impostazioni App, salvato cifrato nel
// DB) oppure impostato come variabile d'ambiente API_TOKEN. Il DB ha la
// precedenza; l'env resta come alternativa.

export const CHIAVE_TOKEN_API = 'api.token'

/**
 * Confronto a tempo costante fra la chiave ricevuta e quella attesa.
 *
 * ⚠️ Prima era un `!==` secco. Onestamente: per via della rete e della query
 * al database che gira PRIMA del confronto, la differenza di nanosecondi qui
 * non era misurabile da fuori — non era una porta aperta. Ma la rotta gemella
 * (`/api/v1/caselle`) il confronto giusto ce l'aveva già: due modi diversi di
 * fare la stessa cosa nello stesso punto sono un invito a copiare quello
 * sbagliato.
 */
function chiaviUguali(a: string, b: string): boolean {
  const A = Buffer.from(a)
  const B = Buffer.from(b)
  // ⚠️ `timingSafeEqual` LANCIA se le lunghezze non combaciano: il controllo
  // qui sopra non è una svista da «correggere», è obbligatorio.
  return A.length === B.length && crypto.timingSafeEqual(A, B)
}

export type EsitoChiamata = 'ok' | 'chiaveErrata' | 'utenteSconosciuto' | 'nonConfigurata'

/**
 * Scrive nel registro chi ha bussato alle API.
 *
 * ⚠️⚠️ La chiave delle API è UNA SOLA e non ha ambiti: chi ce l'ha sceglie su
 * quale casella agire scrivendo `x-utente`, e può leggere la posta di chiunque
 * o mandare mail a nome di chiunque. Restringerla ad ambiti per app è un
 * lavoro che tocca tutti i chiamanti (piattaforma, Scout, CRM…) e non si fa
 * di nascosto in una revisione di sicurezza. Quello che si poteva fare subito,
 * e che mancava del tutto, è la MEMORIA: senza queste righe, di un uso
 * improprio della chiave non sarebbe rimasta traccia da nessuna parte.
 *
 * ⚠️ Non deve MAI far fallire una chiamata vera: se la tabella non c'è ancora
 * (la migrazione gira al build ed è volutamente non bloccante) o il database
 * fa i capricci, si tace e si va avanti. Un registro che rompe l'app che
 * doveva sorvegliare è peggio di nessun registro.
 */
export async function registraChiamata(
  req: Request,
  esito: EsitoChiamata,
  dati: { utenteChiesto?: string; utenteId?: string }
): Promise<void> {
  try {
    let rotta = ''
    try {
      rotta = new URL(req.url).pathname
    } catch {
      rotta = ''
    }
    await db.chiamataApi.create({
      data: {
        rotta,
        metodo: req.method || '',
        utenteChiesto: (dati.utenteChiesto || '').slice(0, 200),
        utenteId: dati.utenteId ?? null,
        esito,
        // ⚠️ Il primo della lista è il client; gli altri sono i proxy.
        ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60),
        agente: (req.headers.get('user-agent') || '').slice(0, 200),
      },
    })
    // Pulizia saltuaria: il registro serve a guardare indietro qualche mese,
    // non per sempre. Una volta ogni cinquanta chiamate circa, così non si
    // paga una cancellazione a ogni richiesta.
    if (Math.random() < 0.02) {
      const limite = new Date(Date.now() - 1000 * 60 * 60 * 24 * 180)
      await db.chiamataApi.deleteMany({ where: { quando: { lt: limite } } })
    }
  } catch {
    /* il registro non deve mai rompere una chiamata vera */
  }
}

/** Il token API in vigore e da dove viene (per la UI e per l'auth). */
export async function tokenApiConfigurato(): Promise<{ token: string; fonte: 'app' | 'env' | 'nessuno' }> {
  try {
    const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE_TOKEN_API }, select: { valore: true } })
    if (row?.valore) {
      try {
        const t = decifra(row.valore).trim()
        if (t) return { token: t, fonte: 'app' }
      } catch {
        /* token cifrato illeggibile (APP_SECRET cambiato?): si prova l'env */
      }
    }
  } catch {
    /* tabella non raggiungibile: si usa l'env */
  }
  const env = (process.env.API_TOKEN || '').trim()
  return env ? { token: env, fonte: 'env' } : { token: '', fonte: 'nessuno' }
}

export type Autenticato =
  | { ok: true; utenteId: string; email: string; accountEmail?: string }
  | { ok: false; errore: string; status: number }

export async function autenticaApi(req: Request): Promise<Autenticato> {
  const { token: atteso } = await tokenApiConfigurato()
  if (!atteso) {
    await registraChiamata(req, 'nonConfigurata', {})
    return { ok: false, errore: 'API non configurata: nessun token (generalo in Impostazioni App o imposta API_TOKEN).', status: 503 }
  }

  const chiave = (
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
  if (!chiaviUguali(chiave, atteso)) {
    await registraChiamata(req, 'chiaveErrata', { utenteChiesto: req.headers.get('x-utente') || '' })
    return { ok: false, errore: 'Non autorizzato: chiave API errata o mancante.', status: 401 }
  }

  const emailUtente = (req.headers.get('x-utente') || '').trim().toLowerCase()
  if (!emailUtente) {
    return { ok: false, errore: 'Manca l’header x-utente (email dell’utente AI Mail).', status: 400 }
  }

  const u = await db.utente.findFirst({
    where: { email: { equals: emailUtente, mode: 'insensitive' }, attivo: true },
    select: { id: true, email: true },
  })
  if (u) {
    // ⚠️⚠️ La stessa email può essere SIA un utente di login SIA una casella
    // (qui `nicolo.donato@deluxy.it` e `cs@deluxy.it` lo sono tutte e due).
    // Prima si usciva subito col solo utente, `accountEmail` restava vuoto, e
    // chi chiedeva di mandare «da Nicolò» se la vedeva partire dalla PRIMA
    // casella dell'utente — in ordine di indice `amministrazione@deluxy.it`.
    // Deterministico, silenzioso, e con risposta `ok: true`.
    const suaCasella = await db.account.findFirst({
      where: { utenteId: u.id, email: { equals: emailUtente, mode: 'insensitive' }, attivo: true },
      select: { email: true },
    })
    await registraChiamata(req, 'ok', { utenteChiesto: emailUtente, utenteId: u.id })
    return { ok: true, utenteId: u.id, email: u.email, ...(suaCasella ? { accountEmail: suaCasella.email } : {}) }
  }

  // ⭐ 26/08: `x-utente` puo' essere anche l'email di una CASELLA (Account).
  // Il caso vero: la piattaforma consegne manda i recap «da
  // amministrazione@deluxy.it», che e' un account collegato all'utente di
  // Nicolo' — non un utente di login. Prima rispondeva «nessun utente», e per
  // giunta l'invio senza account esplicito partiva dalla PRIMA casella
  // dell'utente, non da quella chiesta.
  const account = await db.account.findFirst({
    where: { email: { equals: emailUtente, mode: 'insensitive' }, attivo: true },
    select: { utenteId: true, email: true, utente: { select: { email: true, attivo: true } } },
  })
  if (account?.utente?.attivo) {
    await registraChiamata(req, 'ok', { utenteChiesto: emailUtente, utenteId: account.utenteId })
    return { ok: true, utenteId: account.utenteId, email: account.utente.email, accountEmail: account.email }
  }

  await registraChiamata(req, 'utenteSconosciuto', { utenteChiesto: emailUtente })
  return { ok: false, errore: `Nessun utente o casella AI Mail attiva con email ${emailUtente}.`, status: 404 }
}
