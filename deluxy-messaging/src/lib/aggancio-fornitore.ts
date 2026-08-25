// QUANDO UN «AGGANCIATA» DEL REGISTRO È DAVVERO QUELL'AZIENDA.
//
// ⚠️⚠️ IL CASO VERO, misurato il 25/08/2026 sul registro delle modifiche di
// Anagrafiche. Pagando **«Paradis des fleurs»** (ordine #2797, 25/08 ore 11:10):
//
//   RichiestaMatch  «nome:Paradis des fleurs» → agganciata (confidenza media)
//                   → partner «Contatti senza azienda (HubSpot)»
//   Modifica        statoFornitore: «» → «abituale»   [origine: customer-service]
//
// Cioè: il fornitore vero **non è entrato in anagrafica**, e un contenitore che
// non è nemmeno un'azienda è stato marcato come nostro fornitore abituale.
//
// Perché è successo: la ricerca del registro pretende che **ogni parola**
// compaia in **almeno un campo**, compresi i **contatti collegati**. Quel record
// ne ha 288: «paradis» sta in uno, «des» in sei, «fleurs» in un altro. Combacia.
// Ed essendo l'unico risultato, `trovati.length === 1` lo promuove ad
// «agganciata».
//
// ⚠️⚠️ Sono due errori sovrapposti, e li conosciamo tutti e due: **una regola di
// ricerca larga riusata per AFFERMARE un'identità**, e **«un solo risultato»
// scambiato per certezza**. Una ricerca larga è giusta quando a scegliere è una
// persona che guarda l'elenco; qui invece nessuno guarda, e si scrive.
//
// Quindi il mittente non si fida sulla parola: guarda **come si chiama** il
// record che gli è stato agganciato. Il registro resta il proprietario del dato
// — questa è la nostra prudenza prima di scrivergli.

const norm = (s: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Il nome che ci ha risposto il registro è lo stesso di cui stiamo parlando?
 *
 * Passa se i due nomi coincidono, oppure se **il più corto compare per intero e
 * nella stessa sequenza** dentro l'altro — che è il caso per cui il match
 * esiste: noi diciamo «Ketty Flowers», il registro ha «Ketty Flowers · PORTO
 * CERVO» (o viceversa: noi «S.A.S. ELENA FLEURS 46 RUE ARSON», lui «Elena
 * Fleurs»).
 *
 * ⚠️ Il nome corto deve avere **sostanza**: almeno due parole e sei caratteri.
 * Senza questa riga, un'anagrafica generica di una parola («Fiori») si
 * aggancerebbe a mezzo mondo — che è di nuovo affermare a partire da una
 * somiglianza.
 */
export function agganciaAffidabile(nostro: string, delRegistro: string): boolean {
  const a = norm(nostro)
  const b = norm(delRegistro)
  if (!a || !b) return false
  if (a === b) return true

  // ⚠️ Stesso nome, punteggiatura diversa: «Sa Commercial Garden Group srls» e
  // «S.A. COMMERCIAL GARDEN GROUP S.R.L.S.» sono la stessa azienda, ma spezzati
  // in parole diventano «sa … srls» contro «s a … s r l s» e non combaciano
  // più. Attaccate, sì. ⚠️ Solo l'uguaglianza, non il «contiene»: senza spazi
  // due nomi diversi si infilano l'uno dentro l'altro con troppa facilità.
  const attaccato = (s: string) => s.replace(/ /g, '')
  if (attaccato(a) === attaccato(b)) return true

  const ta = a.split(' ')
  const tb = b.split(' ')
  const corto = ta.length <= tb.length ? ta : tb
  const lungo = corto === ta ? tb : ta
  if (corto.length < 2 || corto.join('').length < 6) return false
  return ` ${lungo.join(' ')} `.includes(` ${corto.join(' ')} `)
}
