// Da quale numero escono gli avvisi dell'aiuto? (sola lettura, non manda niente)
//   npx tsx scripts/prova-aiuto-mittente.mts
import { mittenteAvvisi, numeroAmministratore } from '../src/lib/aiuto-whatsapp'
import { db } from '../src/lib/db'

console.log('parte da:  ', await mittenteAvvisi())
console.log('arriva a: +', await numeroAmministratore())
await db.$disconnect()
