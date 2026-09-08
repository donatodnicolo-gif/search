import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * ⭐ 08/09/2026 — CAMBIO DELLE COORDINATE BANCARIE IN DUE PASSI.
 *
 * Regola utente: «in impostazioni del profilo consenti di modificare anche le proprie
 * informazioni sul conto corrente e intestatario conto; per modificare queste cose però
 * va inserito un codice che l'app manda alla mail del partner con il codice di verifica.
 * È solo per la modifica delle informazioni bancarie».
 *
 * ⚠️ PERCHÉ DUE PASSI E NON UNO. Cambiare l'IBAN è il gesto che un attacco cerca: chi
 * entrasse in una sessione di partner potrebbe dirottare i bonifici, e nessuno se ne
 * accorgerebbe fino al primo pagamento andato altrove. Perciò la richiesta **non scrive
 * niente**: parcheggia i valori proposti, manda un codice alla mail in ANAGRAFICA, e i
 * campi veri cambiano solo quando quel codice torna indietro. Se il codice non arriva
 * (perché chi ha chiesto il cambio non ha accesso a quella casella), l'IBAN resta quello
 * di prima — ed è arrivata comunque una mail a dire che qualcuno ci ha provato.
 *
 * Qui stanno le parti pure — validazione, codice, impronta, confronto — così sono
 * leggibili e provabili senza database.
 */

/** Quanto vive un codice. Quindici minuti: il tempo di aprire la posta, non di più. */
export const CODICE_VALIDO_MINUTI = 15;
/** Oltre questi tentativi la richiesta decade: sei cifre senza tetto si indovinano. */
export const TENTATIVI_MASSIMI = 5;
/** Fra due invii: evita che il bottone «rimanda» diventi un modo per riempire una casella. */
export const RIMANDA_DOPO_SECONDI = 60;

/**
 * L'IBAN è valido?
 *
 * Formato (2 lettere paese + 2 cifre di controllo + fino a 30 alfanumerici) **e**
 * checksum mod-97 dello standard ISO 13616.
 *
 * ⚠️ Il checksum non è pignoleria: intercetta la cifra sbagliata e le due invertite, che
 * sono gli errori veri di chi ricopia un IBAN dal telefono. Un IBAN col formato giusto e
 * il checksum sbagliato è un bonifico che parte e torna indietro settimane dopo.
 */
export function ibanValido(grezzo: string): boolean {
  const s = grezzo.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  // Si sposta il paese in coda, si traducono le lettere in numeri (A=10 … Z=35),
  // e il resto della divisione per 97 deve fare 1.
  const ruotato = s.slice(4) + s.slice(0, 4);
  const numerico = ruotato.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // Il numero è più lungo di quanto un intero regga: si divide a pezzi.
  let resto = 0;
  for (const cifra of numerico) resto = (resto * 10 + Number(cifra)) % 97;
  return resto === 1;
}

/** L'IBAN come si scrive nel database: senza spazi, maiuscolo. */
export function normalizzaIban(grezzo: string): string {
  return grezzo.replace(/[\s-]/g, '').toUpperCase();
}

/** L'IBAN come si mostra a schermo, a gruppi di quattro. */
export function ibanLeggibile(iban: string): string {
  return normalizzaIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * L'IBAN mascherato, per dirlo in una mail o in un registro senza scriverlo per intero:
 * `IT60 •••• •••• 5678`. Serve a far riconoscere il conto a chi lo conosce, senza
 * consegnarlo a chi lo sta leggendo per caso.
 */
export function ibanMascherato(iban: string | null | undefined): string {
  const s = normalizzaIban(iban ?? '');
  if (s.length < 8) return '—';
  return `${s.slice(0, 4)} ${'•'.repeat(4)} ${'•'.repeat(4)} ${s.slice(-4)}`;
}

/**
 * L'indirizzo email mascherato: `n••••o@deluxy.it`. Va detto a chi chiede il cambio
 * DOVE è stato mandato il codice — altrimenti non sa dove guardare — ma senza rivelare
 * per intero una casella a chi magari non è il proprietario.
 */
export function emailMascherata(email: string): string {
  const [nome, dominio] = email.split('@');
  if (!dominio) return '—';
  const visibile = nome.length <= 2 ? nome.slice(0, 1) : nome.slice(0, 1) + nome.slice(-1);
  return `${visibile[0]}${'•'.repeat(Math.max(2, nome.length - 2))}${visibile.slice(1)}@${dominio}`;
}

/**
 * Il codice: sei cifre da una sorgente crittografica.
 *
 * ⚠️ `Math.random()` non va: è prevedibile, e chi conosce lo stato del generatore
 * indovina il codice successivo senza nemmeno provarci. `randomInt` di node usa la
 * sorgente del sistema operativo.
 */
export function generaCodice(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** L'impronta del codice. Nel database non finisce mai il codice, solo questa. */
export function impronta(codice: string): string {
  return createHash('sha256').update(codice.trim()).digest('hex');
}

/**
 * Il confronto fra l'impronta salvata e quella del codice ricevuto.
 *
 * ⚠️ A TEMPO COSTANTE. Un `===` su stringhe esce al primo carattere diverso, e la
 * differenza di tempo — piccola, ma misurabile su molte prove — dice quanti caratteri
 * erano giusti. `timingSafeEqual` impiega lo stesso tempo comunque vada.
 */
export function improntaCombacia(salvata: string | null | undefined, codice: string): boolean {
  if (!salvata) return false;
  const a = Buffer.from(salvata, 'utf8');
  const b = Buffer.from(impronta(codice), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** L'intestatario: una persona o una ragione sociale, non un romanzo. */
export function intestatarioValido(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && t.length <= 120;
}

export interface RichiestaInSospeso {
  bankAccount: string;
  bankAccountName: string;
}

/** I valori proposti, come si conservano in attesa della conferma. */
export function serializzaSospeso(r: RichiestaInSospeso): string {
  return JSON.stringify({ bankAccount: r.bankAccount, bankAccountName: r.bankAccountName });
}

export function leggiSospeso(testo: string | null | undefined): RichiestaInSospeso | null {
  if (!testo) return null;
  try {
    const v = JSON.parse(testo) as Partial<RichiestaInSospeso>;
    if (typeof v?.bankAccount !== 'string' || typeof v?.bankAccountName !== 'string') return null;
    return { bankAccount: v.bankAccount, bankAccountName: v.bankAccountName };
  } catch {
    return null;
  }
}

/** Il corpo della mail col codice. */
export function mailCodice(insegna: string, codice: string, ibanNuovo: string, ibanVecchio: string | null): { oggetto: string; html: string } {
  const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;max-width:560px">`,
    `<p style="font-size:15px;margin:0 0 14px">Gentile ${esc(insegna)},</p>`,
    `<p style="font-size:15px;margin:0 0 18px">abbiamo ricevuto la richiesta di cambiare le coordinate bancarie del suo profilo Deluxy. Per confermarla, inserisca questo codice nella pagina del profilo:</p>`,
    `<p style="font-size:34px;letter-spacing:8px;font-weight:600;margin:0 0 18px;font-variant-numeric:tabular-nums">${esc(codice)}</p>`,
    `<p style="font-size:14px;color:#6e6e73;margin:0 0 18px">Il codice vale ${CODICE_VALIDO_MINUTI} minuti.</p>`,
    `<table style="border-collapse:collapse;margin:0 0 18px">`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">IBAN attuale</td><td style="padding:4px 0;font-size:14px">${esc(ibanMascherato(ibanVecchio))}</td></tr>`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">IBAN richiesto</td><td style="padding:4px 0;font-size:14px"><b>${esc(ibanLeggibile(ibanNuovo))}</b></td></tr>`,
    `</table>`,
    // ⚠️ Questa riga è la difesa vera: se la richiesta non è sua, il partner lo scopre
    // ADESSO — mentre l'IBAN è ancora quello di prima — e non al primo bonifico perso.
    `<p style="font-size:14px;margin:0 0 6px"><b>Non ha chiesto lei questo cambiamento?</b> Non inserisca il codice: le coordinate restano quelle attuali. Ci avvisi subito rispondendo a questa email.</p>`,
    `<p style="font-size:13px;color:#6e6e73;margin:18px 0 0">Deluxy</p>`,
    `</div>`,
  ].join('');
  return { oggetto: 'Codice di verifica per il cambio delle coordinate bancarie', html };
}

/** L'avviso all'ufficio, a cambio avvenuto. */
export function mailAvvisoUfficio(insegna: string, vecchio: string | null, nuovo: string, intestatario: string, quando: Date): { oggetto: string; html: string } {
  const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;max-width:560px">`,
    `<p style="font-size:15px;margin:0 0 14px">Il partner <b>${esc(insegna)}</b> ha cambiato le proprie coordinate bancarie dal profilo, confermando col codice ricevuto per email.</p>`,
    `<table style="border-collapse:collapse;margin:0 0 18px">`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">Quando</td><td style="padding:4px 0;font-size:14px">${esc(quando.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }))}</td></tr>`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">IBAN precedente</td><td style="padding:4px 0;font-size:14px">${esc(vecchio ? ibanLeggibile(vecchio) : '(non c\'era)')}</td></tr>`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">IBAN nuovo</td><td style="padding:4px 0;font-size:14px"><b>${esc(ibanLeggibile(nuovo))}</b></td></tr>`,
    `<tr><td style="padding:4px 14px 4px 0;color:#6e6e73;font-size:13px">Intestatario</td><td style="padding:4px 0;font-size:14px">${esc(intestatario)}</td></tr>`,
    `</table>`,
    `<p style="font-size:14px;margin:0">Se questo cambiamento non era atteso, verificarlo col partner <b>prima del prossimo pagamento</b>.</p>`,
    `</div>`,
  ].join('');
  return { oggetto: `Coordinate bancarie cambiate — ${insegna}`, html };
}
