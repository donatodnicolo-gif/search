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

// Registrazione: il PRIMO utente registrato diventa amministratore (bootstrap
// della prima apertura), i successivi nascono operatori.
export async function registrati(formData: FormData) {
  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!nome || !email || password.length < 8) {
    redirect(
      '/registrati?errore=' +
        encodeURIComponent('Servono nome, email e una password di almeno 8 caratteri.')
    )
  }

  const esistente = await db.utente.findUnique({ where: { email } })
  if (esistente) {
    redirect('/registrati?errore=' + encodeURIComponent('Questa email è già registrata: accedi.'))
  }

  const quanti = await db.utente.count()
  const utente = await db.utente.create({
    data: {
      nome,
      email,
      passwordHash: hashPassword(password),
      ruolo: quanti === 0 ? 'admin' : 'operatore',
    },
  })
  await apriSessione(utente.id)
  redirect('/')
}

export async function esci() {
  const negozio = await cookies()
  negozio.delete(SESSION_COOKIE)
  redirect('/login')
}
