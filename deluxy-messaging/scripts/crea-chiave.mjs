// Crea (o rigenera) una chiave per un'app che deve parlare col Customer
// Service via /api/v1/*. Di default è di SOLA LETTURA (reclami e voti);
// con `--scrittura` può anche CREARE ordini con link di pagamento
// (/api/v1/nuovo-ordine).
// Uso:  npm run chiave -- <nome-app> [--scrittura]
// Esempio:
//   npm run chiave -- deluxy-orders
//   npm run chiave -- deluxy-crm --scrittura
//
// La chiave viene stampata UNA SOLA VOLTA: nel database resta solo lo SHA-256.
// Va copiata nel .env dell'app client (es. MESSAGGI_API_KEY=...).
import { PrismaClient } from '@prisma/client'
import { createHash, randomBytes } from 'crypto'

const prisma = new PrismaClient()

const nome = process.argv.slice(2).find((a) => !a.startsWith('--'))
const scrittura = process.argv.includes('--scrittura')
if (!nome) {
  console.error('Uso: npm run chiave -- <nome-app> [--scrittura]')
  process.exit(1)
}

const chiave = `dlxm_${randomBytes(24).toString('hex')}`
const hash = createHash('sha256').update(chiave).digest('hex')

await prisma.apiKey.upsert({
  where: { nome },
  create: { nome, hash, scrittura },
  update: { hash, attiva: true, scrittura },
})

console.log(`Chiave API ${scrittura ? 'con SCRITTURA (crea ordini)' : 'di sola lettura'} per "${nome}":`)
console.log()
console.log(`  ${chiave}`)
console.log()
console.log("Conservala ora: non sarà più recuperabile (nel DB c'è solo l'hash).")

await prisma.$disconnect()
