// LE FASCE ORARIE DI CONSEGNA, COME LE OFFRE IL SITO.
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026: «la fascia oraria di consegna deve
// essere selezionabile secondo le logiche del sito (consenti però di
// selezionare fascia flessibile per impostare manualmente)». Prima era un campo
// di testo libero, e si vede nei dati veri: fra gli ordini da giugno ci sono
// `116-20`, `8-16`, `9-17`, `16-20 ultimo orario disponibile`. Un ordine con la
// fascia scritta storta arriva al fornitore senza un orario che si possa
// leggere.
//
// ⚠️ Le fasce NON sono inventate: sono quelle che i siti mandano davvero,
// contate sugli ordini dal 01/06/2026 (misurato il 02/09/2026).
//
//   Flowers   178 × 08-12   128 × 12-16   120 × 16-20   (il resto è rumore)
//   Cake       68 × 08-12    46 × 12-16    47 × 16-20
//   Deluxy     fasce di UN'ORA: 08-09 · 09-10 · 10-11 · 11-12 · 12-13 ·
//              14-15 · 19-20 …  e le doppie 08-10 · 10-12 · 12-14 · 14-16 ·
//              16-18 · 18-20 · 20-22
//
// Perché sono diverse: deluxy.it consegna «a ora» con il valet in guanti
// bianchi, gli altri due su tre fasce ampie.

/** Le tre fasce ampie dei siti che consegnano a mezza giornata. */
const FASCE_AMPIE = ['08-12', '12-16', '16-20']

/** Le fasce di deluxy.it: un'ora per volta, più le doppie che usa davvero. */
const FASCE_DELUXY = [
  '08-09',
  '09-10',
  '10-11',
  '11-12',
  '12-13',
  '13-14',
  '14-15',
  '15-16',
  '16-17',
  '17-18',
  '18-19',
  '19-20',
  '20-21',
  '21-22',
  '08-10',
  '10-12',
  '12-14',
  '14-16',
  '16-18',
  '18-20',
  '20-22',
]

/**
 * Le fasce che si possono scegliere per quel marchio.
 *
 * ⚠️ Si decide dal NOME del negozio e non da un id: i negozi sono tre e i nomi
 * stanno scritti in tabella («Deluxy», «FLowers», «Cake»). Un marchio nuovo
 * (business.deluxy.it) cade sulle fasce ampie, che è il caso più comune —
 * e comunque resta «flessibile» per scriverla a mano.
 */
export function fascePerNegozio(nomeNegozio: string): string[] {
  const n = (nomeNegozio ?? '').trim().toLowerCase()
  // ⚠️ «deluxy» compare anche in «Deluxy Flowers»: si guarda che NON sia
  // flowers o cake prima di dare le fasce a ora, o Flowers si ritroverebbe
  // quattordici scelte che il suo sito non offre.
  if (n.includes('flower') || n.includes('cake')) return FASCE_AMPIE
  if (n.includes('deluxy')) return FASCE_DELUXY
  return FASCE_AMPIE
}

/**
 * La fascia scritta è una di quelle del sito?
 *
 * ⚠️ Serve alla schermata per capire se mostrare la tendina o il campo libero:
 * riaprendo una bozza con `16-20 ultimo orario disponibile` dentro, la tendina
 * non deve **cancellarla** scegliendo la prima voce al posto suo.
 */
export function fasciaDelSito(nomeNegozio: string, fascia: string): boolean {
  return fascePerNegozio(nomeNegozio).includes((fascia ?? '').trim())
}
