'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from './db'
import { hashPassword, verificaPassword } from './password'
import { SESSION_COOKIE, EMAIL_COOKIE, creaSessione } from './auth'
import { richiediAdmin, utenteCorrente } from './sessione'

function testo(form: FormData, campo: string): string {
  return String(form.get(campo) ?? '').trim()
}

async function apriSessione(userId: string, email: string) {
  const jar = await cookies()
  const comune = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
  jar.set(SESSION_COOKIE, await creaSessione(userId), {
    ...comune,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
  jar.set(EMAIL_COOKIE, email, { ...comune, maxAge: 60 * 60 * 24 * 180 })
}

/** Login con email + password. */
export async function accedi(form: FormData) {
  const email = testo(form, 'email').toLowerCase()
  const password = testo(form, 'password')

  const u = await db.utente.findUnique({ where: { email } })
  // Stesso messaggio per email inesistente e password errata: non riveliamo
  // quali email esistono.
  if (!u || !u.attivo || !verificaPassword(password, u.passwordHash)) {
    redirect('/login?errore=1')
  }

  await apriSessione(u.id, u.email)
  redirect('/')
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
  if (!email || password.length < 6) redirect('/login?errore=dati')

  const u = await db.utente.create({
    data: { email, nome, passwordHash: hashPassword(password), ruolo: 'admin' },
  })
  await apriSessione(u.id, u.email)
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
  if (password.length < 6) return { ok: false, messaggio: 'La password deve avere almeno 6 caratteri.' }
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
  await db.utente.update({ where: { id }, data: { attivo } })
  revalidatePath('/utenti')
}

export async function reimpostaPassword(
  id: string,
  password: string
): Promise<{ ok: boolean; messaggio: string }> {
  await richiediAdmin()
  if (password.length < 6) return { ok: false, messaggio: 'Almeno 6 caratteri.' }
  await db.utente.update({ where: { id }, data: { passwordHash: hashPassword(password) } })
  revalidatePath('/utenti')
  return { ok: true, messaggio: 'Password aggiornata.' }
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
