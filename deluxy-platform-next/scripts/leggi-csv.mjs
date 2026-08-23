// Lettore CSV minimo ma corretto: gestisce virgolette, virgole dentro i campi
// e virgolette raddoppiate. Nato il 23/08/2026 dopo che uno split fatto con una
// regex ha disallineato le colonne di `service.csv` e mi ha fatto leggere il
// nome del servizio nella colonna del modello di prezzo.
import fs from 'node:fs';

export function leggiCsv(percorso) {
  const testo = fs.readFileSync(percorso, 'utf8');
  const righe = [];
  let campo = '', riga = [], dentro = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (dentro) {
      if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe.shift();
  return righe
    .filter((r) => r.length === testa.length)
    .map((r) => Object.fromEntries(testa.map((k, i) => [k, r[i] === 'NULL' ? null : r[i]])));
}
