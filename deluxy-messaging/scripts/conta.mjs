// Conteggi di SOLA LETTURA sul database di produzione (nessuna scrittura).
// Serve a riempire la fotografia dell'handoff: canali collegati, chiavi, utenti,
// reclami, rimborsi. Non stampa mai il valore di un segreto, solo pieno/vuoto.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const out = {}
out.ordini = await db.ordine.count()
out.ordiniDaGestire = await db.ordine.count({ where: { gestione: 'da_gestire' } })
out.ordiniSenzaConsegna = await db.ordine.count({ where: { dataConsegna: null } })
out.conversazioni = await db.conversazione.count()
out.conversazioniPerCanale = await db.conversazione.groupBy({
  by: ['canale'],
  _count: { _all: true },
})
out.conversazioniNonLette = await db.conversazione.count({ where: { nonLetti: { gt: 0 } } })
out.presaInCarico = await db.conversazione.count({ where: { presaDaId: { not: '' } } })
out.messaggi = await db.messaggio.count()
out.utenti = await db.utente.findMany({ select: { email: true, ruolo: true } })
out.reclamiTotali = await db.reclamo.count()
out.reclamiPerStato = await db.reclamo.groupBy({ by: ['stato'], _count: { _all: true } })
out.rimborsiPerStato = await db.rimborso.groupBy({ by: ['stato'], _count: { _all: true } })
out.script = await db.script.count()
out.istruzioniAI = await db.istruzioneAI.count()
out.negozi = await db.negozioShopify.findMany({
  select: { nome: true, attivo: true, waPhoneNumberId: true, dominio: true },
})
out.numeriWhatsApp = (
  await db.numeroWhatsApp.findMany({
    select: { nome: true, attivo: true, negozioId: true, token: true, wabaId: true },
  })
).map((n) => ({ nome: n.nome, attivo: n.attivo, brand: !!n.negozioId, token: !!n.token, waba: !!n.wabaId }))
out.pagineMeta = (
  await db.paginaMeta.findMany({
    select: { canale: true, nome: true, attivo: true, negozioId: true, token: true, tokenScadeIl: true, tokenEsito: true },
  })
).map((p) => ({
  canale: p.canale,
  nome: p.nome,
  attivo: p.attivo,
  brand: !!p.negozioId,
  token: !!p.token,
  scadeIl: p.tokenScadeIl,
  esito: p.tokenEsito,
}))
out.caselle = (
  await db.casellaEmail.findMany({
    select: { indirizzo: true, attiva: true, predefinita: true, password: true, negozioId: true },
  })
).map((c) => ({
  indirizzo: c.indirizzo,
  attiva: c.attiva,
  predefinita: c.predefinita,
  password: !!c.password,
  brand: !!c.negozioId,
}))
out.widgetSiti = await db.widgetSito.findMany({
  select: { slug: true, dominio: true, attivo: true, apreSulSito: true },
})
const chiavi = await db.impostazione.findMany({ select: { chiave: true, valore: true } })
out.impostazioni = Object.fromEntries(chiavi.map((i) => [i.chiave, i.valore ? 'PRESENTE' : 'vuota']))

console.log(JSON.stringify(out, null, 1))
await db.$disconnect()
