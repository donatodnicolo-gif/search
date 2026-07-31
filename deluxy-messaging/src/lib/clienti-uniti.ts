// Unire a mano due righe della rubrica clienti che sono la stessa persona.
//
// I clienti si ricavano dagli ordini raggruppando per telefono (ultime 9 cifre)
// e, in mancanza, per email. Finché la persona usa sempre gli stessi contatti
// funziona; quando cambia numero, o ordina una volta dall'email di lavoro, la
// stessa persona diventa due righe con metà storia ciascuna — e chi guarda
// «tre ordini» sta in realtà guardando un cliente che ne ha otto.
//
// ⚠️ QUESTE UNIONI NON SI INDOVINANO. Nei dati veri «Nicolò Donato» è due righe
// con due numeri e due email diverse: nessun dato le collega, solo il nome. E il
// nome non è una chiave — gli omonimi esistono, e unire due omonimi vuol dire
// mostrare a un cliente gli ordini di un altro. Qui si CONSIGLIA soltanto: a
// unire è una persona, e ogni unione si può disfare.

import { db } from './db'

/** La chiave di una riga della rubrica: telefono se c'è, altrimenti email. */
export function chiaveDi(telefono: string, email: string): string {
  const cifre = (telefono ?? '').replace(/[^\d]/g, '')
  if (cifre.length >= 6) return 'tel:' + cifre.slice(-9)
  if ((email ?? '').trim()) return 'mail:' + email.trim().toLowerCase()
  return ''
}

/**
 * Le unioni salvate: chiave assorbita → chiave che resta.
 *
 * ⚠️ Si segue la catena. Unire A in B e poi B in C lascia scritto «A→B», e senza
 * seguirla A resterebbe attaccata a una riga che non esiste più: il cliente si
 * spezzerebbe di nuovo proprio dopo che qualcuno lo ha unito.
 */
export async function mappaUnioni(): Promise<Map<string, string>> {
  const righe = await db.clienteUnito.findMany({ select: { chiave: true, principale: true } })
  const diretta = new Map(righe.map((r) => [r.chiave, r.principale]))
  const finale = new Map<string, string>()
  for (const [chiave] of diretta) {
    let a = diretta.get(chiave) as string
    // Il limite non è pignoleria: un anello (A→B, B→A) creato da due unioni
    // fatte al contrario girerebbe per sempre e bloccherebbe la pagina.
    for (let i = 0; i < 20 && diretta.has(a); i++) {
      const prossima = diretta.get(a) as string
      if (prossima === a || prossima === chiave) break
      a = prossima
    }
    finale.set(chiave, a)
  }
  return finale
}

/**
 * Unisce più righe in una.
 *
 * `principale` è quella che resta: non è un dettaglio estetico, è la riga il cui
 * telefono e la cui email restano quelli «buoni» del cliente.
 */
export async function unisciClienti(
  chiavi: string[],
  principale: string,
  utente: string
): Promise<number> {
  const daUnire = [...new Set(chiavi)].filter((k) => k && k !== principale)
  if (!daUnire.length || !principale) return 0

  // Se la principale era a sua volta assorbita da qualcun altro, si unisce a
  // quella: due unioni fatte in ordine diverso devono finire nello stesso posto.
  const mappa = await mappaUnioni()
  let capo = mappa.get(principale) ?? principale

  // ⚠️ CAMBIARE IDEA SU QUALE RIGA TENERE.
  //
  // Se la riga scelta adesso era già stata assorbita proprio da una di quelle
  // che stiamo unendo, seguire la vecchia unione vorrebbe dire ignorare la
  // scelta appena fatta — e, scrivendola comunque, creare un ANELLO (A→B e
  // B→A) che si annulla da solo: le due righe resterebbero separate senza che
  // nessuno capisca perché. Succede davvero: è capitato unendo gli stessi due
  // clienti prima a mano e poi in blocco, nei due versi opposti.
  //
  // L'ultima parola è di chi sta scegliendo ora: si scioglie il vecchio legame.
  if (daUnire.includes(capo)) {
    await db.clienteUnito.deleteMany({ where: { chiave: principale } })
    capo = principale
  }

  await db.$transaction([
    // Chi puntava a una delle righe che stiamo assorbendo deve seguirla.
    db.clienteUnito.updateMany({
      where: { principale: { in: daUnire } },
      data: { principale: capo },
    }),
    ...daUnire.map((chiave) =>
      db.clienteUnito.upsert({
        where: { chiave },
        create: { chiave, principale: capo, unitoDa: utente },
        update: { principale: capo, unitoDa: utente },
      })
    ),
  ])
  return daUnire.length
}

/** Disfa l'unione: le righe tornano separate come le vedeva la rubrica. */
export async function separaCliente(principale: string): Promise<number> {
  const esito = await db.clienteUnito.deleteMany({
    where: { OR: [{ principale }, { chiave: principale }] },
  })
  return esito.count
}

export type ClienteRicostruito = {
  chiave: string
  nome: string
  /** Il recapito «buono»: quello della riga principale. */
  telefono: string
  email: string
  indirizzo: string
  ultimoNumero: string
  negozioId: string
  /** Tutti i recapiti del gruppo, principale compreso, dal più recente. */
  telefoni: string[]
  indirizziEmail: string[]
}

/**
 * Rimette insieme un cliente partendo dalla sua chiave, unioni comprese.
 *
 * Serve dove non basta la lista: per scrivere in rubrica Google, dove il
 * contatto deve avere TUTTI i numeri e TUTTE le email della persona.
 */
export async function ricostruisciCliente(chiave: string): Promise<ClienteRicostruito | null> {
  const unioni = await mappaUnioni()
  const ordini = await db.ordine.findMany({
    orderBy: { data: 'desc' },
    select: {
      clienteNome: true,
      telefono: true,
      email: true,
      indirizzo: true,
      numero: true,
      negozioId: true,
    },
  })

  const suoi = ordini.filter((o) => {
    const k = chiaveDi(o.telefono, o.email)
    return k && (unioni.get(k) ?? k) === chiave
  })
  if (!suoi.length) return null

  // Il primo è l'ordine più recente: il suo recapito è quello a cui il cliente
  // risponde oggi, e deve restare il principale sul contatto.
  const primo = suoi[0]
  const telefoni: string[] = []
  const email: string[] = []
  for (const o of suoi) {
    if (o.telefono && !telefoni.includes(o.telefono)) telefoni.push(o.telefono)
    if (o.email && !email.includes(o.email)) email.push(o.email)
  }

  return {
    chiave,
    nome: suoi.find((o) => o.clienteNome)?.clienteNome ?? '',
    telefono: primo.telefono,
    email: primo.email,
    indirizzo: suoi.find((o) => o.indirizzo)?.indirizzo ?? '',
    ultimoNumero: primo.numero,
    negozioId: primo.negozioId,
    telefoni,
    indirizziEmail: email,
  }
}

/**
 * TUTTI i recapiti di una persona, unioni comprese, partendo da uno solo.
 *
 * ⚠️ Serve alla scheda cliente. Senza, dopo un'unione la scheda mostrerebbe
 * solo la metà da cui si è entrati: tre ordini invece di otto, i reclami di un
 * numero e non dell'altro — cioè esattamente il problema che l'unione doveva
 * risolvere, ma spostato in un posto dove non si vede.
 */
export async function contattiDelGruppo(
  email: string,
  telefono: string
): Promise<{ email: string[]; telefoni: string[] }> {
  const partenza = chiaveDi(telefono, email)
  if (!partenza) return { email: [], telefoni: [] }

  const unioni = await mappaUnioni()
  const capo = unioni.get(partenza) ?? partenza
  // Il gruppo: la riga che resta più tutte quelle assorbite da lei.
  const gruppo = new Set([capo, ...[...unioni].filter(([, p]) => p === capo).map(([k]) => k)])
  // Da soli non basterebbero: se si entra da una riga assorbita, quella chiave
  // dev'esserci comunque.
  gruppo.add(partenza)
  if (gruppo.size === 1) return { email: [], telefoni: [] }

  const ordini = await db.ordine.findMany({
    where: { OR: [{ NOT: { email: '' } }, { NOT: { telefono: '' } }] },
    select: { email: true, telefono: true },
  })
  const email_ = new Set<string>()
  const telefoni = new Set<string>()
  for (const o of ordini) {
    if (!gruppo.has(chiaveDi(o.telefono, o.email))) continue
    if (o.email) email_.add(o.email)
    if (o.telefono) telefoni.add(o.telefono)
  }
  return { email: [...email_], telefoni: [...telefoni] }
}

/** Senza accenti, senza maiuscole, senza spazi doppi: «Nicolò» e «Nicolo». */
export function nomeConfrontabile(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    // I segni diacritici scritti col loro codice: nel sorgente sono invisibili,
    // e un accento «staccato» dentro una parentesi quadra è il genere di cosa
    // che un editor o un copia-incolla mangia senza dirlo.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type RigaConfrontabile = { chiave: string; nome: string; email: string }

/**
 * I gruppi di righe che *potrebbero* essere la stessa persona.
 *
 * Due indizi, di forza diversa:
 * - **stessa email** su righe diverse: quasi sempre la stessa persona (ha
 *   cambiato numero, o un ordine è arrivato senza telefono);
 * - **stesso nome**: un indizio e basta. I Rossi non sono tutti parenti.
 *
 * Si torna il motivo insieme al gruppo, perché chi decide deve sapere su cosa
 * sta decidendo — non è la stessa cosa fidarsi di un'email o di un cognome.
 */
export function possibiliDoppioni(
  righe: RigaConfrontabile[]
): { motivo: 'email' | 'nome'; chiavi: string[] }[] {
  const perEmail = new Map<string, string[]>()
  const perNome = new Map<string, string[]>()
  for (const r of righe) {
    const email = (r.email ?? '').trim().toLowerCase()
    if (email) perEmail.set(email, [...(perEmail.get(email) ?? []), r.chiave])
    const nome = nomeConfrontabile(r.nome)
    // Un nome solo («Mario») capita a decine di clienti: come indizio non vale.
    if (nome && nome.includes(' ')) perNome.set(nome, [...(perNome.get(nome) ?? []), r.chiave])
  }

  const gruppi: { motivo: 'email' | 'nome'; chiavi: string[] }[] = []
  const gia = new Set<string>()
  for (const chiavi of perEmail.values()) {
    if (chiavi.length < 2) continue
    gruppi.push({ motivo: 'email', chiavi })
    chiavi.forEach((k) => gia.add(k))
  }
  for (const chiavi of perNome.values()) {
    if (chiavi.length < 2) continue
    // Se l'email le ha già messe insieme, ripeterle per nome è rumore.
    if (chiavi.every((k) => gia.has(k))) continue
    gruppi.push({ motivo: 'nome', chiavi })
  }
  return gruppi
}
