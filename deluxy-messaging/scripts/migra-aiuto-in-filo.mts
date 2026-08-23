// Porta le vecchie risposte «una sola» dentro il filo dei messaggi.
//   npx tsx scripts/migra-aiuto-in-filo.mts
//
// ⚠️ Si fa una volta e poi lo script resta come traccia. Senza, il pannello
// dovrebbe leggere in due modi diversi per sempre — la vecchia risposta nel
// campo `risposta` e le nuove nel filo — ed è il genere di doppia strada che
// dopo sei mesi nessuno ricorda perché c'è.
import { db } from '../src/lib/db'

const vecchie = await db.domandaAiuto.findMany({ where: { risposta: { not: '' } } })
console.log('richieste con una risposta nel vecchio campo:', vecchie.length)

for (const d of vecchie) {
  const gia = await db.messaggioAiuto.count({ where: { domandaId: d.id } })
  if (gia) {
    console.log(` · ${d.codice}: ha già dei messaggi, la salto`)
    continue
  }
  await db.messaggioAiuto.create({
    data: {
      domandaId: d.id,
      autore: 'admin',
      autoreNome: d.rispostaDaNome || 'Amministratore',
      testo: d.risposta,
      viaWhatsApp: d.rispostaDaNome.includes('WhatsApp'),
      // ⚠️ La data vera, non adesso: se no il filo mostrerebbe una risposta
      // arrivata oggi a una domanda di ieri.
      creatoIl: d.rispostaIl ?? d.creatoIl,
    },
  })
  await db.domandaAiuto.update({ where: { id: d.id }, data: { risposta: '' } })
  console.log(` · ${d.codice}: risposta portata nel filo`)
}
console.log('\nfatto.')
await db.$disconnect()
