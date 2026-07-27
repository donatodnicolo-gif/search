'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { hashPassword } from '@/lib/password'
import {
  MIN_PASSWORD,
  emailValida,
  normalizzaEmail,
  puoCambiareRuolo,
  puoEssereRimosso,
  ruoloValido,
} from '@/lib/utenti'

// Gli account di accesso all'app. Li apre e li chiude un AMMINISTRATORE.
//
// ⚠️ Il controllo del ruolo sta qui dentro, in ogni azione, e non solo nella
// pagina. Una server action è un endpoint a tutti gli effetti: nascondere il
// bottone a chi non è amministratore non impedisce a nessuno di chiamarla lo
// stesso. Se il cancello fosse solo nella pagina, un operatore potrebbe
// promuoversi da solo con una richiesta scritta a mano.

async function soloAmministratore() {
  const io = await utenteCorrente()
  if (!io) redirect('/login')
  if (io.ruolo !== 'admin') {
    throw new Error('Serve un account amministratore per gestire gli accessi.')
  }
  return io
}

/** Rimanda alla pagina con un messaggio: gli errori si leggono, non si indovinano. */
function torna(messaggio: string, tipo: 'ok' | 'errore' = 'ok'): never {
  redirect(`/utenti?${tipo}=` + encodeURIComponent(messaggio))
}

export async function creaUtente(formData: FormData) {
  await soloAmministratore()

  const nome = String(formData.get('nome') ?? '').trim()
  const email = normalizzaEmail(String(formData.get('email') ?? ''))
  const password = String(formData.get('password') ?? '')
  const ruoloScelto = String(formData.get('ruolo') ?? 'operatore')
  const ruolo = ruoloValido(ruoloScelto) ? ruoloScelto : 'operatore'

  if (!nome) torna('Serve il nome della persona.', 'errore')
  if (!emailValida(email)) torna('L’email non sembra valida.', 'errore')
  if (password.length < MIN_PASSWORD) {
    torna(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`, 'errore')
  }

  if (await db.utente.findUnique({ where: { email } })) {
    torna('Esiste già un account con questa email.', 'errore')
  }

  await db.utente.create({ data: { nome, email, passwordHash: hashPassword(password), ruolo } })
  revalidatePath('/utenti')
  torna(
    `Account creato per ${nome}. Comunicagli la password che hai scelto: l’app non gliela manda.`
  )
}

export async function cambiaRuolo(formData: FormData) {
  await soloAmministratore()
  const id = String(formData.get('id') ?? '')
  const ruolo = String(formData.get('ruolo') ?? '')

  const controllo = await puoCambiareRuolo(id, ruolo)
  if (!controllo.ok) torna(controllo.motivo, 'errore')

  const u = await db.utente.update({ where: { id }, data: { ruolo } })
  revalidatePath('/utenti')
  torna(`${u.nome} ora è ${ruolo === 'admin' ? 'amministratore' : 'operatore'}.`)
}

export async function cambiaPassword(formData: FormData) {
  await soloAmministratore()
  const id = String(formData.get('id') ?? '')
  const password = String(formData.get('password') ?? '')

  if (password.length < MIN_PASSWORD) {
    torna(`La password deve avere almeno ${MIN_PASSWORD} caratteri.`, 'errore')
  }
  const u = await db.utente.findUnique({ where: { id } })
  if (!u) torna('Utente non trovato.', 'errore')

  await db.utente.update({ where: { id }, data: { passwordHash: hashPassword(password) } })
  revalidatePath('/utenti')
  // ⚠️ Non si scrive la password nel messaggio: finirebbe nell'URL, e da lì
  // nella cronologia del browser e nei log del server.
  torna(`Password di ${u.nome} cambiata. Comunicagliela a voce o su un canale sicuro.`)
}

export async function eliminaUtente(formData: FormData) {
  const io = await soloAmministratore()
  const id = String(formData.get('id') ?? '')

  // Cancellare il proprio account mentre ci si sta dentro lascia la sessione
  // aperta su un utente che non esiste più: si viene buttati fuori al primo
  // caricamento, senza aver capito perché.
  if (id === io.id) {
    torna('Non puoi togliere il tuo stesso account: chiedilo a un altro amministratore.', 'errore')
  }

  const controllo = await puoEssereRimosso(id)
  if (!controllo.ok) torna(controllo.motivo, 'errore')

  const u = await db.utente.delete({ where: { id } })
  revalidatePath('/utenti')
  torna(`Account di ${u.nome} rimosso: da adesso non può più entrare.`)
}
