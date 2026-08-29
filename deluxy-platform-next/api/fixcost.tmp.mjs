import fs from 'node:fs'
const p = 'src/orders-sync/orders-sync.module.ts'
let s = fs.readFileSync(p, 'utf8')
const crlf = s.includes('\r\n'); const N = crlf ? '\r\n' : '\n'
const a = [
'      c.costoConsegna += (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0);'
].join(N)
if (!s.includes(a)) { console.error('non trovato'); process.exit(1) }
const b = [
'      // ⚠️ LO STESSO COSTO CHE USA IL MARGINE (allineato il 26/08/2026): se la',
'      // consegna NON e\' pagabile il suo costo e\' ZERO (l\'importo resta scritto',
'      // sulla riga, ma non si paga), e la somma non va mai sotto zero — il',
'      // contante trattenuto dal valet e\' cassa, non un ricavo della consegna.',
'      // Prima qui si sommava il grezzo: l\'ingrediente pubblicato a Orders era',
'      // diverso da quello usato dentro margineFinale su 767 ordini, per',
'      // 12.745,87 EUR di costo che non esiste. Un ingrediente che non ricompone',
'      // il piatto e\' peggio di un ingrediente assente.',
'      c.costoConsegna += d.payable === false',
'        ? 0',
'        : Math.max(0, (d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));'
].join(N)
fs.writeFileSync(p, s.replace(a, b))
console.log('ok costo allineato')
