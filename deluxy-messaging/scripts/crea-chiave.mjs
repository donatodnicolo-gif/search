// Crea (o rigenera) una chiave di SOLA LETTURA per un'app che deve leggere il
// Customer Service (reclami e voti degli ordini) via /api/v1/*.
// Uso:  npm run chiave -- <nome-app>
// Esempio:
//   npm run chiave -- deluxy-orders
//
// La chiave viene stampata UNA SOLA VOLTA: nel database resta solo lo SHA-256.
// Va copiata nel .env dell'app client (es. MESSAGGI_API_KEY=...).
import { PrismaClient } from '@prisma/client'
import { createHash, randomBytes } from 'crypto'

const prisma = new PrismaClient()

const nome = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!nome) {
  console.error('Uso: npm run chiave -- <nome-app>')
  process.exit(1)
}

const chiave = `dlxm_${randomBytes(24).toString('hex')}`
const hash = createHash('sha256').update(chiave).digest('hex')

await prisma.apiKey.upsert({
  where: { nome },
  create: { nome, hash },
  update: { hash, attiva: true },
})

console.log(`Chiave API di sola lettura per "${nome}":`)
console.log()
console.log(`  ${chiave}`)
console.log()
console.log("Conservala ora: non sarà più recuperabile (nel DB c'è solo l'hash).")

await prisma.$disconnect()
