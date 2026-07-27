// Chi può entrare nell'app e con quali poteri.
//
// ⚠️ PERCHÉ ESISTE QUESTO FILE. Fino a ieri la pagina `/registrati` era aperta a
// chiunque: bastava conoscere l'indirizzo dell'app per crearsi un account ed
// entrare fra novecento ordini con nomi, indirizzi, telefoni ed email dei
// clienti, i reclami e i rimborsi. Era pensata come bootstrap della prima
// apertura — «il primo che si registra diventa amministratore» — ma restava
// aperta per sempre. Ora la registrazione libera vale SOLO finché non esiste
// nessun utente; dopo, gli account li crea un amministratore da /utenti.

import { db } from './db'

export const RUOLI = [
  {
    chiave: 'admin',
    nome: 'Amministratore',
    spiega: 'Può creare e togliere account, oltre a usare tutta l’app.',
  },
  {
    chiave: 'operatore',
    nome: 'Operatore',
    spiega: 'Usa l’app per lavorare gli ordini e rispondere ai clienti.',
  },
] as const

export type ChiaveRuolo = (typeof RUOLI)[number]['chiave']

export function ruoloValido(v: string): v is ChiaveRuolo {
  return RUOLI.some((r) => r.chiave === v)
}

export function nomeRuolo(chiave: string): string {
  return RUOLI.find((r) => r.chiave === chiave)?.nome ?? chiave
}

/** Lunghezza minima della password. Non è un numero tondo a caso: è quella già
 *  chiesta dalla registrazione, e abbassarla ora indebolirebbe gli account che
 *  esistono già. */
export const MIN_PASSWORD = 8

/**
 * L'app non ha ancora nessun utente?
 *
 * È l'unico caso in cui la registrazione libera ha senso: un'installazione
 * nuova deve pur avere un primo amministratore, e non c'è nessuno che possa
 * crearlo. Da lì in poi la porta si chiude.
 */
export async function installazioneVergine(): Promise<boolean> {
  return (await db.utente.count()) === 0
}

/**
 * Quanti amministratori ci sono, escludendone eventualmente uno.
 *
 * Serve per la regola che segue: **l'ultimo amministratore non si può togliere
 * né retrocedere**. Senza quel controllo basta un clic distratto per chiudere
 * fuori tutti dalla gestione degli account, e da dentro l'app non si rientra
 * più — si dovrebbe andare a mano sul database.
 */
export async function altriAmministratori(escludiId: string): Promise<number> {
  return db.utente.count({ where: { ruolo: 'admin', id: { not: escludiId } } })
}

export type EsitoControllo = { ok: true } | { ok: false; motivo: string }

/** Si può togliere questo utente, o è l'ultimo che tiene aperte le porte? */
export async function puoEssereRimosso(id: string): Promise<EsitoControllo> {
  const u = await db.utente.findUnique({ where: { id } })
  if (!u) return { ok: false, motivo: 'Utente non trovato.' }
  if (u.ruolo === 'admin' && (await altriAmministratori(id)) === 0) {
    return {
      ok: false,
      motivo:
        'È l’unico amministratore rimasto: togliendolo, nessuno potrebbe più creare account. Nominane un altro prima.',
    }
  }
  return { ok: true }
}

/** Si può cambiare il ruolo di questo utente? */
export async function puoCambiareRuolo(id: string, nuovo: string): Promise<EsitoControllo> {
  if (!ruoloValido(nuovo)) return { ok: false, motivo: 'Ruolo non valido.' }
  const u = await db.utente.findUnique({ where: { id } })
  if (!u) return { ok: false, motivo: 'Utente non trovato.' }
  if (u.ruolo === 'admin' && nuovo !== 'admin' && (await altriAmministratori(id)) === 0) {
    return {
      ok: false,
      motivo:
        'È l’unico amministratore: retrocedendolo non resterebbe nessuno a gestire gli account.',
    }
  }
  return { ok: true }
}

/** Email scritta come si deve: senza spazi, minuscola, con una chiocciola. */
export function normalizzaEmail(v: string): string {
  return v.trim().toLowerCase()
}

export function emailValida(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}
