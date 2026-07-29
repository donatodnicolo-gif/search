// Stato del collegamento WhatsApp, in sola lettura.
//
// Risponde alla domanda «cosa manca perché un numero riceva»: quali numeri sono
// in tabella, quali credenziali ci sono (SOLO presente/assente: nessun segreto
// esce da qui) e — se c'è un token — cosa dice Meta di quei numeri e se la
// nostra app è iscritta al WhatsApp Business Account.
//
//   node scripts/stato-whatsapp.mjs
//
// Niente scritture: si può lanciare in qualsiasi momento, anche in produzione.

import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'

for (const file of ['.env', '.env.local']) {
  try {
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // il file può non esserci: in produzione le variabili arrivano da Vercel
  }
}

const API = 'https://graph.facebook.com/v21.0'
const db = new PrismaClient()

/** Stessa cifratura di src/lib/crypto.ts (AES-256-GCM con APP_SECRET). */
function decifra(valore) {
  const [iv, tag, dato] = valore.split(':')
  const chiave = crypto.createHash('sha256').update(process.env.APP_SECRET ?? '').digest()
  const d = crypto.createDecipheriv('aes-256-gcm', chiave, Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return d.update(Buffer.from(dato, 'hex'), undefined, 'utf8') + d.final('utf8')
}

async function chiedi(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const corpo = await res.json().catch(() => ({}))
  return { ok: res.ok, corpo }
}

const CHIAVI = [
  'waToken',
  'waPhoneNumberId',
  'waBusinessAccountId',
  'metaVerifyToken',
  'metaAppSecret',
  'webhookUltimaChiamata',
  'webhookUltimoEsito',
]

const righe = await db.impostazione.findMany({ where: { chiave: { in: CHIAVI } } })
const imp = Object.fromEntries(righe.map((r) => [r.chiave, r.valore]))

console.log('--- Impostazioni ---')
for (const k of CHIAVI) {
  const v = imp[k] ?? ''
  const mostrabile = k.startsWith('webhook') ? v || '(mai)' : v ? `presente (${v.length} car.)` : 'MANCA'
  console.log(`  ${k}: ${mostrabile}`)
}

const numeri = await db.numeroWhatsApp.findMany({ include: { negozio: { select: { nome: true } } } })
console.log(`\n--- Numeri in tabella: ${numeri.length} ---`)
for (const n of numeri) {
  console.log(
    `  ${n.numeroVisibile || '(numero non scritto)'} · ${n.nome} · phoneNumberId=${n.phoneNumberId} · waba=${n.wabaId || 'MANCA'} · marchio=${n.negozio?.nome ?? '—'} · ${n.attivo ? 'attivo' : 'sospeso'} · token ${n.token ? 'suo' : 'generale'}`
  )
}

let token = ''
try {
  token = imp.waToken ? decifra(imp.waToken) : ''
} catch {
  console.log('\n⚠️ waToken illeggibile: APP_SECRET diverso da quello con cui è stato salvato.')
}

if (!token) {
  console.log('\nNessun token generale leggibile: la parte su Meta si ferma qui.')
} else {
  const waba = imp.waBusinessAccountId || numeri.find((n) => n.wabaId)?.wabaId || ''
  console.log(`\n--- Meta (WABA ${waba || 'sconosciuto'}) ---`)
  if (waba) {
    const n = await chiedi(
      `${API}/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type`,
      token
    )
    console.log(
      n.ok ? JSON.stringify(n.corpo.data, null, 2) : `numeri: ${JSON.stringify(n.corpo.error)}`
    )
    const s = await chiedi(`${API}/${waba}/subscribed_apps`, token)
    console.log(
      's app iscritte:',
      s.ok ? JSON.stringify(s.corpo.data) : JSON.stringify(s.corpo.error)
    )
  } else {
    console.log('Nessun WABA id: né in Impostazioni né sui numeri in tabella.')
  }
}

await db.$disconnect()
