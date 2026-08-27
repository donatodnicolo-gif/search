import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from './auth'
import { db } from './db'
import { redirect } from 'next/navigation'

/**
 * L'utente loggato (dal cookie di sessione firmato), o null.
 *
 * ⚠️⚠️ Due controlli, non uno. La FIRMA dice «questo cookie l'ho scritto io» e
 * la sa verificare anche il middleware; l'UTENTE dice «e vale ancora», e quello
 * lo può dire solo chi legge il database:
 *  · l'utente non c'è più (cancellato) → fuori;
 *  · la sua `generazione` è cambiata (gli è stata cambiata la password) → fuori.
 *
 * Senza il secondo, un cookie firmato bene valeva trenta giorni qualunque cosa
 * succedesse all'account.
 */
export async function utenteCorrente() {
  const negozio = await cookies()
  const sessione = await verificaSessione(negozio.get(SESSION_COOKIE)?.value)
  if (!sessione) return null
  const utente = await db.utente.findUnique({ where: { id: sessione.userId } })
  if (!utente) return null
  if (utente.generazione !== sessione.generazione) return null
  return utente
}

/**
 * L'utente loggato, PRETENDENDOLO.
 *
 * ⚠️⚠️ Esiste perché diciassette handler facevano `const io = await
 * utenteCorrente()` e poi usavano `io?.nome ?? ''` senza mai chiedersi se `io`
 * fosse null. Non è un caso teorico: il cookie è `userId.HMAC(userId)` e vive
 * trenta giorni, il middleware ne verifica solo la FIRMA, e cancellare un
 * utente non lo invalida. Quindi un ex dipendente col cookie in mano mandava
 * mail da `cs@deluxy.it`, scriveva ai clienti su WhatsApp e approvava rimborsi
 * — e la riga in archivio diceva autore `''`, cioè **nessuno**.
 *
 * ⚠️ Solleva invece di restituire null apposta: un valore da controllare si
 * dimentica di controllare, un'eccezione no.
 */
export async function richiediUtente() {
  const io = await utenteCorrente()
  if (!io) {
    throw Object.assign(new Error('Non autenticato.'), { status: 401 })
  }
  return io
}

/**
 * L'utente loggato, e deve essere un AMMINISTRATORE.
 *
 * ⚠️⚠️ La regola era già scritta, in italiano e col motivo, in
 * `src/app/(app)/utenti/actions.ts`: «una server action è un endpoint a tutti
 * gli effetti: nascondere il bottone a chi non è amministratore non impedisce a
 * nessuno di chiamarla lo stesso». Era applicata in **un file su sette**. Le
 * altre sei — Impostazioni, Caselle, Negozi, Numeri WhatsApp, Facebook e
 * Instagram, Widget dei siti — non chiedevano nemmeno chi fossi.
 *
 * ⚠️ Che cosa si otteneva, misurato il 27/08/2026 sull'app vera (3 utenti: 1
 * amministratore e 2 operatori, e le voci erano nel menu di tutti):
 *  · scrivere `imapHost` di una casella lasciando VUOTO il campo password — la
 *    password vera resta cifrata in tabella e il cron la presenta al server di
 *    chi ha cambiato l'indirizzo: la posta di `cs@deluxy.it` cambia padrone;
 *  · scrivere `anagraficheUrl` e farsi consegnare al primo giro la chiave da 53
 *    caratteri del registro Anagrafiche (le variabili d'ambiente che avrebbero
 *    la precedenza **non sono impostate** in produzione: verificato);
 *  · svuotare `metaAppSecret` e `igAppSecret`, e il webhook di Meta smette di
 *    verificare le firme senza smettere di funzionare;
 *  · accendere o spegnere l'AI che scrive ai clienti da sola — che la rotta
 *    `/api/ai-fuori-turno` vieta ai non amministratori con un 403.
 *
 * ⚠️ Chi non è amministratore viene rimandato indietro, non messo davanti a un
 * errore: la voce di menu adesso non c'è, quindi chi arriva qui ci arriva da un
 * segnalibro o da un link vecchio, e per lui quella pagina non esiste.
 */
export async function soloAmministratore() {
  const io = await utenteCorrente()
  if (!io) redirect('/login')
  if (io.ruolo !== 'admin') redirect('/')
  return io
}
