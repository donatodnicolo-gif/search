// La finestra «scrivi» di AI Mail, aperta da qui coi campi già compilati.
//
// AI Mail espone `/scrivi?a=…&oggetto=…&corpo=…&app=…&rif=…`: apre il suo
// editor con dentro quello che gli passi. È la strada comune a tutte le app
// Deluxy per scrivere una mail a mano restando dentro l'ecosistema — la mail
// parte dalla casella collegata **là**, e la copia finisce nella sua «Inviata».
//
// ⚠️ **Quello che parte da AI Mail non finisce in questa conversazione.** Il
// thread qui registra solo ciò che spedisce quest'app: usando la finestra di AI
// Mail, in Inbox non resta traccia della risposta. È il compromesso di usare il
// programma di posta buono al posto di quello minimo: va detto a chi clicca,
// non scoperto dopo.
//
// Un URL troppo lungo non arriva: i browser tagliano oltre ~8000 caratteri e AI
// Mail taglia a 8000. Il corpo si ferma prima, a 6000.

const BASE = 'https://deluxy-mail.vercel.app'
const MAX_CORPO = 6000

export type MailDaScrivere = {
  /** Uno o più indirizzi, separati da virgola. */
  a: string
  oggetto?: string | null
  corpo?: string | null
  /** A cosa si riferisce: AI Mail lo mostra a chi apre la finestra. */
  rif?: string | null
}

export function urlScriviAiMail(m: MailDaScrivere): string {
  const p = new URLSearchParams()
  p.set('a', m.a.trim())
  if (m.oggetto?.trim()) p.set('oggetto', m.oggetto.trim())
  const corpo = (m.corpo ?? '').trim().slice(0, MAX_CORPO)
  if (corpo) p.set('corpo', corpo)
  // Chi ha aperto la finestra: AI Mail lo scrive in testa, così chi manda sa da
  // dove arriva la richiesta.
  p.set('app', 'Deluxy Customer Service')
  if (m.rif?.trim()) p.set('rif', m.rif.trim())
  return `${BASE}/scrivi?${p.toString()}`
}
