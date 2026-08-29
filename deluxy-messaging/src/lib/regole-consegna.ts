// QUANTO SI FA PAGARE LA CONSEGNA, per marchio e città.
//
// ⚠️⚠️ Chiesto dall'utente il 28/08/2026: «devi tener conto delle regole per i
// pagamenti delle consegne (milano €15, roma e firenze €25), flowers gratuita,
// cake €10». Prima la spedizione la sceglieva l'operatore da una tendina piena
// delle voci che il negozio aveva usato di recente — comoda, ma non applicava
// nessuna regola: bastava scegliere quella sbagliata per fatturare al cliente un
// prezzo che non è il suo.
//
// ⚠️ LA REGOLA È PER MARCHIO, POI PER CITTÀ. I due negozi «di consegna» hanno un
// prezzo fisso, il terzo (Deluxy, i regali) va a città:
//   · Deluxy Flowers → sempre GRATUITA;
//   · Cakedesign     → sempre 10 €;
//   · Deluxy         → Milano 15 €, Roma e Firenze 25 €.
//
// ⚠️ Quando la città non ha una regola (Deluxy fuori da Milano/Roma/Firenze),
// NON si inventa un prezzo: si torna `certa: false` e l'operatore lo scrive a
// mano. Meglio un campo da riempire che un importo indovinato addosso a un
// cliente.
//
// ⚠️ Questo file non parla con nessuno: è una regola pura, e si prova
// (`scripts/prova-regole-consegna.mts`) senza database e senza Shopify. Se un
// prezzo cambia, cambia QUI e in un posto solo.

export type RegolaConsegna = {
  /** Il titolo della riga di spedizione su Shopify. */
  titolo: string
  prezzo: number
  /** La frase da mostrare: «Milano · 15 €», «Flowers · gratuita». */
  etichetta: string
  /**
   * `true` = la regola ha deciso il prezzo (marchio fisso, o città nota).
   * `false` = non c'è una regola per questo caso: l'operatore sceglie.
   */
  certa: boolean
}

/**
 * ⚠️ Le città con una regola, in forma normalizzata (minuscole, senza accenti).
 * Si confronta la città di consegna con queste: «MILANO», «Milano (MI)» e
 * «milano» sono la stessa città.
 */
const PER_CITTA: { chiavi: string[]; nome: string; prezzo: number }[] = [
  { chiavi: ['milano'], nome: 'Milano', prezzo: 15 },
  { chiavi: ['roma', 'rome'], nome: 'Roma', prezzo: 25 },
  { chiavi: ['firenze', 'florence'], nome: 'Firenze', prezzo: 25 },
]

function norm(v: string): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .trim()
}

/**
 * La regola per questo marchio e questa città.
 *
 * @param negozioNome il nome del negozio come lo conosce l'app («Deluxy»,
 *   «FLowers», «Cake»): il marchio si riconosce da lì.
 * @param citta la città di CONSEGNA.
 */
export function regolaConsegna(negozioNome: string, citta: string): RegolaConsegna {
  const n = norm(negozioNome)

  // ── Marchi a prezzo fisso ──
  if (n.includes('flower')) {
    return { titolo: 'Consegna Deluxy Flowers', prezzo: 0, etichetta: 'Flowers · gratuita', certa: true }
  }
  if (n.includes('cake')) {
    return { titolo: 'Consegna Cakedesign', prezzo: 10, etichetta: 'Cake · 10 €', certa: true }
  }

  // ── Deluxy (e ogni altro): a città ──
  const c = norm(citta)
  for (const r of PER_CITTA) {
    // ⚠️ Confine di parola: «milano» combacia con «milano» e «milano mi», non
    // con un nome che se la porta dentro per caso.
    const parole = c.split(' ').filter(Boolean)
    if (r.chiavi.some((k) => parole.includes(k))) {
      return { titolo: 'Consegna Deluxy', prezzo: r.prezzo, etichetta: `${r.nome} · ${r.prezzo} €`, certa: true }
    }
  }

  // ── Deluxy, città senza regola: non si indovina ──
  return {
    titolo: 'Consegna Deluxy',
    prezzo: 0,
    etichetta: citta.trim()
      ? `Nessuna regola per «${citta.trim()}»: scegli tu il prezzo`
      : 'Scegli la città per applicare la regola',
    certa: false,
  }
}
