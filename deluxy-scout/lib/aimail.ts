// La finestra «scrivi» di AI Mail, aperta da Scout con i campi già compilati.
//
// AI Mail espone `/scrivi?a=…&oggetto=…&corpo=…&app=…&rif=…`: apre il suo
// editor con dentro quello che gli passi. È la strada per **scrivere una mail a
// mano** restando dentro l'ecosistema — la mail parte dalla casella collegata
// lì e la copia finisce in «Inviata», come per qualunque mail scritta da AI Mail.
//
// ⚠️ Non è l'invio di Scout, ed è bene sapere in cosa differisce:
//  · **niente invio a più negozi**: è una finestra, un destinatario alla volta
//    (o più indirizzi separati da virgola, ma con lo stesso identico testo);
//  · **niente variabili**: `[nome]`, `[negozio]`… vanno riempite PRIMA, qui,
//    perché di là non c'è nessun contatto a cui agganciarle;
//  · **niente formattazione**: AI Mail tratta il corpo che arriva dall'URL come
//    testo semplice e l'HTML lo appiattisce — è una sua scelta esplicita, «chi
//    manda formattato usa l'API»;
//  · **niente traccia automatica**: `contatti_avviati` lo scrive l'invio di
//    Scout. Di là Scout non sa cosa è partito, quindi il negozio non diventa
//    Lead da solo.
// Per un invio a più contatti, con variabili e formattazione, resta la
// schermata d'invio di Scout (`/invio/[scriptId]`).
import { testoSemplice } from '@/lib/variabili';

const BASE = 'https://deluxy-mail.vercel.app';

/** Il tetto che si dà al corpo: un URL troppo lungo non arriva a destinazione
 *  (i browser tagliano oltre ~8000 caratteri, e AI Mail taglia a 8000). */
const MAX_CORPO = 6000;

/**
 * L'indirizzo di UNA mail dentro AI Mail.
 *
 * ⚠️ Vuole l'id INTERNO di AI Mail (`leads.mail_ref`), non il Message-ID della
 * posta (`leads.mail_id`): quello serve solo a non reimportare due volte, e in
 * un URL non apre niente.
 */
export function urlMessaggioAiMail(idMessaggio: string): string {
  return `${BASE}/messaggio/${encodeURIComponent(idMessaggio)}`;
}

export interface MailDaScrivere {
  /** Uno o più indirizzi, separati da virgola. */
  a: string;
  oggetto?: string | null;
  /** Può essere HTML: viene appiattito qui, così si vede subito cosa arriva. */
  corpo?: string | null;
  /** A cosa si riferisce, per farlo leggere a chi apre la finestra. */
  rif?: string | null;
}

export function urlScriviAiMail(m: MailDaScrivere): string {
  const p = new URLSearchParams();
  p.set('a', m.a);
  if (m.oggetto?.trim()) p.set('oggetto', m.oggetto.trim());
  const corpo = testoSemplice(m.corpo ?? '').slice(0, MAX_CORPO);
  if (corpo) p.set('corpo', corpo);
  // Chi ha aperto la finestra: AI Mail lo mostra in testa, così chi scrive sa
  // da dove arriva la richiesta.
  p.set('app', 'Deluxy Scout');
  if (m.rif?.trim()) p.set('rif', m.rif.trim());
  return `${BASE}/scrivi?${p.toString()}`;
}
