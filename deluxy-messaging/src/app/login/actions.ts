'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { creaSessione, SESSION_COOKIE } from '@/lib/auth'
import { hashPassword, verificaPassword } from '@/lib/password'
import { installazioneVergine, normalizzaEmail, emailValida, MIN_PASSWORD } from '@/lib/utenti'

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

/**
 * Registrazione: SOLO il primo amministratore di un'installazione nuova.
 *
 * ⚠️ Prima questa funzione era aperta a chiunque. L'intenzione era il bootstrap
 * («il primo che si registra diventa amministratore, gli altri operatori»), ma
 * la porta restava aperta per sempre: chi conosceva l'indirizzo dell'app si
 * apriva un account ed entrava fra novecento ordini con nomi, indirizzi,
 * telefoni ed email dei clienti, i reclami e i rimborsi. Adesso, se esiste già
 * un utente, la registrazione libera non passa: gli account li crea un
 * amministratore da /utenti.
 */
export async function registrati(formData: FormData) {
  if (!(await installazioneVergine())) {
    redirect(
      '/login?errore=' +
        encodeURIComponent(
          'Gli account li apre un amministratore dalla pagina Utenti: chiedi a lui di crearne uno per te.'
        )
    )
  }

  const nome = String(formData.get('nome') ?? '').trim()
  const email = normalizzaEmail(String(formData.get('email') ?? ''))
  const password = String(formData.get('password') ?? '')
  if (!nome || !emailValida(email) || password.length < MIN_PASSWORD) {
    redirect(
      '/registrati?errore=' +
        encodeURIComponent(
          `Servono nome, un'email valida e una password di almeno ${MIN_PASSWORD} caratteri.`
        )
    )
  }

  // Si ricontrolla qui: fra il controllo di sopra e questa riga potrebbe
  // essersi registrato qualcun altro. È improbabile e costa una query.
  if (!(await installazioneVergine())) {
    redirect('/login?errore=' + encodeURIComponent('Il primo account è già stato creato.'))
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
