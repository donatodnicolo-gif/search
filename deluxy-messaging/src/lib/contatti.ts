import { db } from './db'
import { leggiImpostazioni } from './impostazioni'
import {
  accessTokenDaRefresh,
  aggiornaContatto,
  cercaContattoPerTelefono,
  creaContatto,
} from './google'
import { prefissoDaNegozio } from './negozi'

// Colla fra gli ordini e Google Contacts: legge le credenziali, conia un access
// token e salva i contatti dei clienti. Il nome in rubrica è
// "SIGLA Nome Cognome #ordine" (es. "FL Mario Rossi #1042"), dove la sigla è del
// negozio e il numero è quello dell'ordine PIÙ RECENTE di quel cliente.

/** Access token Google dai settaggi salvati; `null` se Google non è collegato. */
export async function googleAccessToken(): Promise<string | null> {
  const c = await leggiImpostazioni(['googleClientId', 'googleClientSecret', 'googleRefreshToken'])
  if (!c.googleClientId || !c.googleClientSecret || !c.googleRefreshToken) return null
  return accessTokenDaRefresh(c.googleClientId, c.googleClientSecret, c.googleRefreshToken)
}

/** "FL Mario Rossi #1042" — sigla, nome, numero dell'ordine più recente. */
export function nomeContatto(prefisso: string, nome: string, numeroOrdine: string): string {
  const numero = numeroOrdine.trim()
  return [prefisso.trim(), nome.trim() || 'Cliente', numero.startsWith('#') || !numero ? numero : `#${numero}`]
    .filter(Boolean)
    .join(' ')
}

/** Chiave di dedup di una persona: le ultime 9 cifre del telefono. */
function chiaveTelefono(telefono: string): string {
  const cifre = telefono.replace(/[^\d]/g, '')
  return cifre.length >= 6 ? cifre.slice(-9) : ''
}

export type RiepilogoContatti = {
  collegato: boolean
  aggiunti: number
  aggiornati: number
  presenti: number // già in rubrica ma NON creati da noi: non li tocchiamo
  errori: number
  rimasti: number // oltre il limite di questo giro
}

/**
 * Salva su Google Contacts i clienti degli ordini non ancora salvati.
 * Un contatto per persona (dedup sul telefono): se la persona ha più ordini si
 * usa il più recente per il numero in evidenza. I contatti già esistenti creati
 * da noi vengono aggiornati col nuovo numero d'ordine; quelli personali
 * dell'utente NON vengono mai rinominati.
 */
export async function salvaContattiOrdini(limite = 40): Promise<RiepilogoContatti> {
  const vuoto: RiepilogoContatti = {
    collegato: false,
    aggiunti: 0,
    aggiornati: 0,
    presenti: 0,
    errori: 0,
    rimasti: 0,
  }
  const token = await googleAccessToken().catch(() => null)
  if (!token) return vuoto

  // Dal più recente: il primo ordine di ogni gruppo è quello da mostrare.
  const daFare = await db.ordine.findMany({
    where: { contattoSalvato: false, telefono: { not: '' } },
    orderBy: { data: 'desc' },
  })

  const gruppi = new Map<string, typeof daFare>()
  for (const o of daFare) {
    const chiave = chiaveTelefono(o.telefono)
    if (!chiave) continue
    const g = gruppi.get(chiave)
    if (g) g.push(o)
    else gruppi.set(chiave, [o])
  }

  // Sigla per negozio (personalizzabile in /negozi, altrimenti dedotta).
  const negozi = await db.negozioShopify.findMany()
  const sigle = new Map(negozi.map((n) => [n.id, prefissoDaNegozio(n.nome, n.dominio, n.prefisso)]))

  const tutti = [...gruppi.values()]
  const daLavorare = tutti.slice(0, limite)
  const esito: RiepilogoContatti = { ...vuoto, collegato: true, rimasti: tutti.length - daLavorare.length }

  for (const ordini of daLavorare) {
    const recente = ordini[0] // il più recente del cliente
    const nome = nomeContatto(sigle.get(recente.negozioId) ?? '', recente.clienteNome, recente.numero)
    try {
      const esistente = await cercaContattoPerTelefono(token, recente.telefono)
      let testo: string
      if (esistente && !esistente.nostro) {
        // Contatto personale dell'utente: non lo rinominiamo mai.
        testo = `Già in rubrica: ${esistente.nome}`
        esito.presenti++
      } else if (esistente) {
        await aggiornaContatto(token, esistente.resourceName, {
          nome,
          telefono: recente.telefono,
          email: recente.email,
          indirizzo: recente.indirizzo,
          note: `ordine ${recente.numero}`,
        })
        testo = `Aggiornato: ${nome}`
        esito.aggiornati++
      } else {
        await creaContatto(token, {
          nome,
          telefono: recente.telefono,
          email: recente.email,
          indirizzo: recente.indirizzo,
          note: `ordine ${recente.numero}`,
        })
        testo = `Aggiunto: ${nome}`
        esito.aggiunti++
      }
      // Tutti gli ordini della persona sono coperti da questo contatto.
      await db.ordine.updateMany({
        where: { id: { in: ordini.map((o) => o.id) } },
        data: { contattoSalvato: true, contattoEsito: testo },
      })
    } catch (e) {
      esito.errori++
      await db.ordine.update({
        where: { id: recente.id },
        data: { contattoEsito: 'Errore: ' + (e as Error).message },
      })
    }
  }

  return esito
}

/** Salva il contatto di un singolo ordine (bottone della riga). */
export async function salvaContattoOrdine(
  accessToken: string,
  ordine: {
    id: string
    negozioId: string
    clienteNome: string
    telefono: string
    email: string
    indirizzo: string
    numero: string
  }
): Promise<string> {
  const negozio = await db.negozioShopify.findUnique({ where: { id: ordine.negozioId } })
  const sigla = negozio ? prefissoDaNegozio(negozio.nome, negozio.dominio, negozio.prefisso) : ''
  const nome = nomeContatto(sigla, ordine.clienteNome, ordine.numero)

  const esistente = ordine.telefono ? await cercaContattoPerTelefono(accessToken, ordine.telefono) : null
  const dati = {
    nome,
    telefono: ordine.telefono,
    email: ordine.email,
    indirizzo: ordine.indirizzo,
    note: `ordine ${ordine.numero}`,
  }
  if (esistente && !esistente.nostro) return `Già in rubrica: ${esistente.nome}`
  if (esistente) {
    await aggiornaContatto(accessToken, esistente.resourceName, dati)
    return `Aggiornato: ${nome}`
  }
  await creaContatto(accessToken, dati)
  return `Aggiunto: ${nome}`
}
