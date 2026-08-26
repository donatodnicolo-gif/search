// SOLA LETTURA: quanti ordini risultano pagati al fornitore ma stanno ancora in
// uno stato di lavorazione precedente ad «attesa consegna».
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const pagate = await db.richiestaPagamento.findMany({
  where: { pagataIl: { not: null } },
  select: { id: true, ordineNumero: true, pagataIl: true, importo: true, intestatario: true },
  orderBy: { pagataIl: 'desc' },
})
console.log('richieste pagate:', pagate.length)
const numeri = [...new Set(pagate.map((r) => r.ordineNumero).filter(Boolean))]
console.log('numeri distinti:', numeri.length)
const conCancelletto = numeri.filter((n) => n.startsWith('#')).length
console.log('con #:', conCancelletto, '· senza #:', numeri.length - conCancelletto)

const varianti = numeri.flatMap((n) => [n, n.startsWith('#') ? n.slice(1) : `#${n}`])
const ordini = await db.ordine.findMany({
  where: { numero: { in: varianti } },
  select: { id: true, numero: true, negozioNome: true, gestione: true, annullatoIl: true, clienteNome: true },
})
console.log('ordini trovati:', ordini.length)
const perStato = {}
for (const o of ordini) perStato[o.gestione] = (perStato[o.gestione] ?? 0) + 1
console.log('per stato:', perStato)

// quali numeri pagati NON hanno un ordine qui
const trovati = new Set(ordini.map((o) => o.numero.replace('#', '')))
const orfani = numeri.filter((n) => !trovati.has(n.replace('#', '')))
console.log('numeri pagati senza ordine in questa app:', orfani.length, orfani.slice(0, 10))

// doppioni: stesso numero su piu negozi
const perNumero = {}
for (const o of ordini) (perNumero[o.numero.replace('#','')] ??= []).push(o.negozioNome)
const doppi = Object.entries(perNumero).filter(([, v]) => v.length > 1)
console.log('numeri con PIU di un ordine:', doppi.length, doppi.slice(0, 10))

const DA_SPOSTARE = ['da_gestire', 'ricerca_fornitore', 'in_pagamento', 'comunicazione']
const fermi = ordini.filter((o) => DA_SPOSTARE.includes(o.gestione))
console.log('\n=== PAGATI MA FERMI PRIMA (' + fermi.length + ') ===')
for (const o of fermi) console.log(' ', o.numero, '|', o.gestione, '|', o.negozioNome, '|', o.clienteNome, o.annullatoIl ? '| ANNULLATO' : '')
await db.$disconnect()
