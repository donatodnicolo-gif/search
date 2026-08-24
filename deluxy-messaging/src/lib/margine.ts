// QUANTO CI RESTA, chiedendo un pagamento al fornitore.
//
// ⚠️ Il conto si faceva a mente, o non si faceva. Chi compila una richiesta ha
// davanti due numeri — quanto ha incassato l'ordine e quanto ha promesso al
// fornitore — e la differenza fra i due è tutto il guadagno di quell'ordine. Non
// mostrarla vuol dire lasciare che una cifra concordata al telefono venga
// scoperta a fine mese, quando non si può più discutere.
//
// ⚠️ Questo file NON importa `db` né `orders`: lo usa la pagina Pagamenti, che è
// un componente client. La quota arriva già letta, dall'esterno.

export type Verdetto = 'ok' | 'oltre' | 'perdita' | 'senza-verdetto'

export type EsitoMargine = {
  /** Quanto ha pagato il cliente. */
  valoreOrdine: number
  /** Quanto stiamo per dare al fornitore. */
  alFornitore: number
  /** Che percentuale del venduto se ne va al fornitore. */
  quotaFornitorePct: number
  /** Quanto ci resta, in percentuale e in euro. */
  marginePct: number
  margineEuro: number
  /**
   * La quota prevista, letta da Deluxy Orders.
   *
   * ⚠️⚠️ `null` quando non la sappiamo (Orders non configurato o non risponde), e
   * in quel caso **non si dà nessun verdetto**: si mostrano i numeri e basta. Un
   * «va bene» calcolato su una regola inventata qui sarebbe peggio del silenzio
   * — la regola vive in Orders e cambia lì, e un 60% scritto nel nostro codice
   * resterebbe al vecchio valore il giorno che la cambiano.
   */
  quotaPrevista: number | null
  verdetto: Verdetto
}

/**
 * ⚠️ Un pelo di tolleranza sul confronto, solo per i decimali.
 *
 * 130 su 216,67 fa 59,9994%: senza questo margine di errore un accordo
 * *esattamente* al 60% risulterebbe «oltre» per un millesimo, e chi lo legge
 * andrebbe a ridiscutere un prezzo che era giusto. Non è una tolleranza
 * commerciale — è aritmetica in virgola mobile.
 */
const SFUMATURA = 0.05

export function calcolaMargine(
  valoreOrdine: number,
  alFornitore: number,
  quotaPrevista: number | null
): EsitoMargine | null {
  // ⚠️ Senza uno dei due numeri non si calcola NIENTE. Una percentuale su un
  // valore ordine sconosciuto sarebbe un numero inventato che sembra un dato:
  // meglio dire «non lo so» che mostrare un margine falso accanto a una cifra
  // che sta per partire verso una banca.
  if (!Number.isFinite(valoreOrdine) || valoreOrdine <= 0) return null
  if (!Number.isFinite(alFornitore) || alFornitore <= 0) return null

  const quotaFornitorePct = (alFornitore / valoreOrdine) * 100
  const marginePct = 100 - quotaFornitorePct
  const margineEuro = valoreOrdine - alFornitore

  let verdetto: Verdetto
  if (alFornitore > valoreOrdine) {
    // ⚠️ Caso a parte, e non è un «oltre» più grande: qui l'ordine ci costa più
    // di quanto è stato venduto. Non è un margine magro, è una perdita, e va
    // detto con un'altra parola perché si legga come un'altra cosa.
    verdetto = 'perdita'
  } else if (quotaPrevista === null) {
    verdetto = 'senza-verdetto'
  } else if (quotaFornitorePct <= quotaPrevista + SFUMATURA) {
    verdetto = 'ok'
  } else {
    verdetto = 'oltre'
  }

  return {
    valoreOrdine,
    alFornitore,
    quotaFornitorePct,
    marginePct,
    margineEuro,
    quotaPrevista,
    verdetto,
  }
}

/** Una percentuale come si scrive: una cifra dopo la virgola, e mai «60,0%». */
export function pct(v: number): string {
  const arrotondato = Math.round(v * 10) / 10
  return `${arrotondato.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
}

export function euro(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

/** La frase da mostrare sotto l'importo. */
export function frasiMargine(m: EsitoMargine): { riga: string; verdetto: string } {
  const riga =
    `Al fornitore va il ${pct(m.quotaFornitorePct)} dei ${euro(m.valoreOrdine)} dell'ordine. ` +
    `A noi resta ${euro(m.margineEuro)}, cioè il ${pct(m.marginePct)}.`

  if (m.verdetto === 'perdita') {
    return {
      riga,
      verdetto: `Stai pagando più di quanto è stato venduto: ci rimettiamo ${euro(-m.margineEuro)}.`,
    }
  }
  if (m.verdetto === 'senza-verdetto') {
    return {
      riga,
      // ⚠️ Si dice PERCHÉ manca il verdetto, non lo si tace: chi non vede né un
      // «va bene» né un «no» pensa che il conto non sia stato fatto.
      verdetto:
        'Quanto dovrebbe restarci non lo so: la regola vive in Deluxy Orders, che ora non risponde.',
    }
  }
  if (m.verdetto === 'ok') {
    return {
      riga,
      verdetto: `In linea: al fornitore è previsto fino al ${pct(m.quotaPrevista!)}.`,
    }
  }
  const eccesso = m.valoreOrdine * ((m.quotaFornitorePct - m.quotaPrevista!) / 100)
  return {
    riga,
    verdetto:
      `Sopra la quota prevista (${pct(m.quotaPrevista!)}): sono ${euro(eccesso)} in più di ` +
      `quello che di solito diamo. Puoi mandarla lo stesso — ma sappilo.`,
  }
}
