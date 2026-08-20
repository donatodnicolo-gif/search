// Casi di prova della lingua del saluto automatico (src/lib/primo-contatto.ts).
//   npx tsx scripts/prova-primo-contatto.mts
import { linguaDelPrimoContatto } from '../src/lib/primo-contatto'

const casi: { testo: string; canale: string; id: string; atteso: string }[] = [
  { testo: 'Hi I want deliver a sympathy flower in Italy address is - Via Teocrito 56 20128 Milano MI Italy', canale: 'whatsapp', id: '393334455667', atteso: 'en' },
  { testo: 'Hello, I would like to send a bouquet tomorrow', canale: 'whatsapp', id: '393334455667', atteso: 'en' },
  { testo: 'Buongiorno volevo spedire delle rose nere domani mattina con un messaggio', canale: 'whatsapp', id: '393338323778', atteso: 'it' },
  { testo: 'Bonjour, je voudrais une livraison demain matin', canale: 'whatsapp', id: '33612345678', atteso: 'fr' },
  { testo: 'Hola, quiero un pedido para mañana', canale: 'whatsapp', id: '34612345678', atteso: 'es' },
  { testo: 'Guten Tag, ich möchte eine Lieferung bitte', canale: 'whatsapp', id: '491701234567', atteso: 'de' },
  { testo: 'ok', canale: 'whatsapp', id: '393334455667', atteso: 'it' },
  { testo: 'ok', canale: 'whatsapp', id: '33612345678', atteso: 'fr' },
  { testo: 'ok', canale: 'widget', id: 'token', atteso: 'it' },
  { testo: 'Ciao, avete consegna a Milano domani?', canale: 'widget', id: 'token', atteso: 'it' },
]

let falliti = 0
for (const c of casi) {
  const avuto = linguaDelPrimoContatto(c.testo, c.id, c.canale)
  const ok = avuto === c.atteso
  if (!ok) falliti++
  console.log(`${ok ? 'OK  ' : 'NO  '} atteso ${c.atteso}, avuto ${avuto} — ${c.testo.slice(0, 48)}`)
}
console.log(falliti === 0 ? `\nTutti e ${casi.length} i casi passano.` : `\n${falliti} FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
