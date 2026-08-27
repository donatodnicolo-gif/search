'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from './db'
import { hashPassword, verificaPassword } from './password'
import { SESSION_COOKIE, EMAIL_COOKIE, creaSessione } from './auth'
import { richiediAdmin, utenteCorrente } from './sessione'

/**
 * Quanto dev'essere lunga una password NUOVA.
 *
 * ⚠️ Vale solo dove una password si IMPOSTA (primo admin, nuovo utente,
 * reimposta). In `accedi` la lunghezza non si controlla, e non si deve
 * cominciare: chi ha già una password di sei caratteri deve poter entrare —
 * altrimenti questa riga non alza la sicurezza, chiude fuori le persone.
 * Il costo di scrypt è al valore di default di Node, quindi l'unica difesa
 * vera contro un dizionario, se un giorno il database uscisse, è che la
 * password non sia corta.
 */
const MIN_PASSWORD = 10

function testo(form: FormData, campo: string): string {
  return String(form.get(campo) ?? '').trim()
}

async function apriSessione(userId: string, email: string, versione: number) {
  const jar = await cookies()
  const comune = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
  jar.set(SESSION_COOKIE, await creaSessione(userId, versione), {
    ...comune,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
  jar.set(EMAIL_COOKIE, email, { ...comune, maxAge: 60 * 60 * 24 * 180 })
}

/**
 * Dove mandare l'utente dopo il login: ci pensa il middleware a metterlo nel
 * link quando ti ferma su una pagina precisa. ⚠️ Solo percorsi INTERNI — il
 * valore arriva da un campo del form, e un `dopo` che punta fuori
 * trasformerebbe la login in un redirect aperto verso un sito qualsiasi.
 *
 * ⚠️⚠️ Il controllo NON è più «comincia per / ma non per //»: quella è una
 * lista nera, e le liste nere si aggirano. Il carattere che la bucava era la
 * BARRA ROVESCIA — provato: `/login?dopo=/\evil.example.com` arrivava intatto
 * nel campo del form, superava il filtro (comincia per «/», non per «//») e i
 * browser lo risolvevano FUORI, su `https://evil.example.com/`. Il dipendente
 * faceva login qui e atterrava su un sito che gli richiedeva la password.
 *
 * Adesso si fa l'unica cosa che non ha eccezioni: si RISOLVE l'indirizzo con
 * lo stesso parser dei browser contro un'origine finta. Se dopo la
 * risoluzione l'origine è cambiata, il valore puntava fuori — comunque fosse
 * scritto, con la barra rovescia, con le tabulazioni o con quello che
 * inventeranno domani. Si tiene `pathname + search` perché il `dopo` porta
 * spesso una query (`/scrivi?a=…`, il link che arriva dalle altre app).
 */
const ORIGINE_FINTA = 'http://x.invalid'

function dopoIlLogin(form: FormData): string {
  const v = testo(form, 'dopo')
  if (!v.startsWith('/')) return '/'
  try {
    const u = new URL(v, ORIGINE_FINTA)
    return u.origin === ORIGINE_FINTA ? `${u.pathname}${u.search}` : '/'
  } catch {
    return '/'
  }
}

/** Login con email + password. */
export async function accedi(form: FormData) {
  const email = testo(form, 'email').toLowerCase()
  const password = testo(form, 'password')
  const dopo = dopoIlLogin(form)

  const u = await db.utente.findUnique({ where: { email } })
  // Stesso messaggio per email inesistente e password errata: non riveliamo
  // quali email esistono.
  if (!u || !u.attivo || !verificaPassword(password, u.passwordHash)) {
    redirect(`/login?errore=1${dopo !== '/' ? `&dopo=${encodeURIComponent(dopo)}` : ''}`)
  }

  await apriSessione(u.id, u.email, u.sessioneVersione)
  redirect(dopo)
}

/**
 * Crea il primo amministratore. Vale solo quando non esiste ancora nessun
 * utente: è il modo di far partire il sistema senza una porta di servizio.
 */
export async function creaPrimoAdmin(form: FormData) {
  if ((await db.utente.count()) > 0) redirect('/login')

  const email = testo(form, 'email').toLowerCase()
  const nome = testo(form, 'nome') || email
  const password = testo(form, 'password')
  if (!email || password.length < MIN_PASSWORD) redirect('/login?errore=dati')

  const u = await db.utente.create({
    data: { email, nome, passwordHash: hashPassword(password), ruolo: 'admin' },
  })
  await apriSessione(u.id, u.email, u.sessioneVersione)
  redirect('/')
}

export async function esci() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}

// ---------- Gestione utenti (solo admin) ----------

export async function creaUtente(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  await richiediAdmin()
  const email = testo(form, 'email').toLowerCase()
  const nome = testo(form, 'nome') || email
  const password = testo(form, 'password')
  const ruolo = testo(form, 'ruolo') === 'admin' ? 'admin' : 'utente'

  if (!email.includes('@')) return { ok: false, messaggio: 'Email non valida.' }
  if (password.length < MIN_PASSWORD) return { ok: false, messaggio: `La password deve avere almeno ${MIN_PASSWORD} caratteri.` }
  if (await db.utente.findUnique({ where: { email } })) {
    return { ok: false, messaggio: 'Esiste già un utente con questa email.' }
  }

  await db.utente.create({ data: { email, nome, passwordHash: hashPassword(password), ruolo } })
  revalidatePath('/utenti')
  return { ok: true, messaggio: `Utente ${email} creato.` }
}

export async function cambiaStatoUtente(id: string, attivo: boolean) {
  const admin = await richiediAdmin()
  // Un admin non può disattivare se stesso: si chiuderebbe fuori.
  if (id === admin.id) return
  // ⚠️ Disattivando, si alza anche la versione: `attivo: false` da solo
  // basterebbe (lo rilegge `utenteCorrente()` a ogni richiesta), ma se un
  // domani l'utente viene riattivato i suoi vecchi biglietti tornerebbero
  // buoni — compresi quelli che erano il motivo per cui l'avevi spento.
  await db.utente.update({
    where: { id },
    data: attivo ? { attivo } : { attivo, sessioneVersione: { increment: 1 } },
  })
  revalidatePath('/utenti')
}

export async function reimpostaPassword(
  id: string,
  password: string
): Promise<{ ok: boolean; messaggio: string }> {
  await richiediAdmin()
  if (password.length < MIN_PASSWORD) return { ok: false, messaggio: `Almeno ${MIN_PASSWORD} caratteri.` }
  // ⚠️⚠️ La versione sale INSIEME alla password (revisione di sicurezza
  // 27/08/2026). Prima cambiare la password riscriveva solo l'hash: chi si
  // era portato via il cookie di quella persona continuava a entrare come se
  // niente fosse, e la cosa che chiunque farebbe per prima — «cambio la
  // password» — non serviva a niente. Alzando il numero, tutti i biglietti
  // firmati prima smettono di valere: chi ha la password nuova rientra, chi
  // aveva solo il cookie no.
  await db.utente.update({
    where: { id },
    data: { passwordHash: hashPassword(password), sessioneVersione: { increment: 1 } },
  })
  revalidatePath('/utenti')
  return { ok: true, messaggio: 'Password aggiornata: chi era collegato con la vecchia dovrà rientrare.' }
}

export async function eliminaUtente(id: string) {
  const admin = await richiediAdmin()
  if (id === admin.id) return // non si elimina da solo
  // Cascade: spariscono anche le sue caselle, messaggi, attività…
  await db.utente.delete({ where: { id } })
  revalidatePath('/utenti')
}

/** La firma personale che finisce nelle bozze. La modifica l'utente stesso. */
export async function salvaFirma(firma: string) {
  const u = await utenteCorrente()
  if (!u) return
  await db.utente.update({ where: { id: u.id }, data: { firma } })
  revalidatePath('/impostazioni')
}
