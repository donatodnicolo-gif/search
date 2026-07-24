'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { creaSessione, SESSION_COOKIE } from '@/lib/auth'
import { hashPassword, verificaPassword } from '@/lib/password'

async function apriSessione(userId: string) {
  const negozio = await cookies()
  negozio.set(SESSION_COOKIE, await creaSessione(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // un mese
    path: '/',
  })
}

export async function entra(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  const utente = await db.utente.findUnique({ where: { email } })
  if (!utente || !verificaPassword(password, utente.passwordHash)) {
    redirect('/login?errore=' + encodeURIComponent('Email o password errate.'))
  }

  await apriSessione(utente.id)
  redirect('/')
}

// Bootstrap: finché non esiste nessun utente, il form del login crea il primo
// amministratore. Appena c'è un utente questa via si chiude da sola.
export async function creaPrimoAdmin(formData: FormData) {
  const quanti = await db.utente.count()
  if (quanti > 0) redirect('/login?errore=' + encodeURIComponent('Esiste già un utente: accedi.'))

  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!nome || !email || password.length < 8) {
    redirect(
      '/login?errore=' + encodeURIComponent('Servono nome, email e una password di almeno 8 caratteri.')
    )
  }

  const utente = await db.utente.create({
    data: { nome, email, passwordHash: hashPassword(password), ruolo: 'admin' },
  })
  await apriSessione(utente.id)
  redirect('/')
}

export async function esci() {
  const negozio = await cookies()
  negozio.delete(SESSION_COOKIE)
  redirect('/login')
}
