import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { orariDeiNegozi } from '@/lib/orari-negozi'
import { adessoRoma, calendarioConsegna, etichettaFascia, fasceIntere, primoGiornoAperto } from '@/lib/orari-regole'
import { fascePerNegozio } from '@/lib/fasce-consegna'
import { metodiPagamentoDelNegozio, spedizioniDelNegozio } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'
// Due chiamate a Shopify (spedizioni usate, metodi di pagamento): respiro.
export const maxDuration = 30

// GET /api/v1/nuovo-ordine/opzioni?negozio=<id>[&giorni=30]
//
// ⭐ TUTTO ciò che il modulo «Nuovo ordine» del Customer Service sa offrire,
// detto ALLE ALTRE APP (11/09/2026, utente dal CRM: «le fasce orarie devono
// essere dei negozi o a inserimento manuale; copia tutte le opzioni dal
// Customer Service, chiedi espressamente all'app quali ha»). Il CS è la casa
// di queste regole: chi crea un ordine da fuori le LEGGE da qui, non se le
// riscrive. Se qui compare un'opzione nuova, il modulo del CRM la vede.
//
// Risposta:
//   negozio           { id, nome, dominio }
//   fasce             { configurato, primoGiornoAperto, oltre: ["08-12", …],
//                       calendario: [{ data, quando, ok, motivo, fasce }],
//                       storiche: [...]  (solo se il negozio non ha orari scritti) }
//                     — la fascia si può anche scrivere a mano («flessibile»)
//   spedizioni        le voci che quel negozio usa davvero (ordini recenti)
//   tariffe           come si calcolano: POST /api/v1/nuovo-ordine/tariffe
//                     (indirizzo + righe → tariffe del sito e stima fuori zona)
//   metodiPagamento   i mezzi con cui i clienti di quel negozio hanno pagato
//   iva               { aggiungibile, predefinito, spiegazione }
//   campi             l'elenco dei campi facoltativi che il POST accetta, a parole
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const negozioId = req.nextUrl.searchParams.get('negozio')?.trim()
  if (!negozioId) return erroreApi(400, 'Manca ?negozio=<id>')
  const giorni = Math.min(120, Math.max(1, Number(req.nextUrl.searchParams.get('giorni')) || 45))

  const tutti = await orariDeiNegozi()
  const n = tutti.find((x) => x.negozio.id === negozioId)
  if (!n) return erroreApi(404, 'Negozio non trovato.')

  const adesso = adessoRoma()
  // ⚠️ Shopify può non rispondere: le fasce e i campi non devono cadere con lui.
  const [spedizioni, metodiPagamento] = await Promise.all([
    spedizioniDelNegozio(negozioId).catch(() => []),
    metodiPagamentoDelNegozio(negozioId).catch(() => []),
  ])

  return NextResponse.json(
    {
      negozio: { id: n.negozio.id, nome: n.negozio.nome, dominio: n.negozio.dominio },
      fasce: n.configurato
        ? {
            configurato: true,
            primoGiornoAperto: primoGiornoAperto(n.orario, adesso.data),
            oltre: fasceIntere(n.orario.regole, n.orario.regole.oltre.durataOre).map(etichettaFascia),
            calendario: calendarioConsegna(n.orario, adesso, {}, giorni).map((g) => ({
              data: g.data,
              quando: g.quando,
              ok: g.ok,
              motivo: g.motivo,
              fasce: g.etichette,
            })),
          }
        : {
            configurato: false,
            primoGiornoAperto: null,
            oltre: fascePerNegozio(n.negozio.nome),
            calendario: [],
            storiche: fascePerNegozio(n.negozio.nome),
          },
      spedizioni,
      tariffe: {
        come: 'POST /api/v1/nuovo-ordine/tariffe',
        corpo: '{ negozioId, indirizzo{indirizzo,citta,cap,provincia,paese}, righe[{variantId|titolo+prezzo, quantita}] }',
        nota: 'Il sito è il listino: le sue tariffe vincono. Fuori dalle città di casa arriva anche una STIMA al chilometro, da mostrare, mai da scrivere da sola.',
      },
      metodiPagamento,
      iva: {
        aggiungibile: true,
        predefinito: false,
        spiegazione:
          "Su Deluxy e Flowers i prezzi sono IVA esclusa: senza la spunta Shopify non aggiunge nulla (il prezzo concordato è quello); con la spunta aggiunge l'IVA sopra, per chi vuole la fattura. Su Cake i prezzi sono IVA inclusa e la spunta non cambia il totale.",
      },
      campi: [
        { nome: 'destinatario', tipo: '{ nome, cognome, telefono }', spiegazione: 'Chi riceve, quando non è chi paga: nei regali il valet chiama lui.' },
        { nome: 'anonima', tipo: 'boolean', spiegazione: 'Consegna anonima: chi riceve non deve sapere da parte di chi.' },
        { nome: 'consensoMarketing', tipo: 'boolean', spiegazione: 'Il cliente acconsente alle comunicazioni (nel CS nasce acceso).' },
        { nome: 'eccezioneOrari', tipo: 'string', spiegazione: 'Motivo per consegnare in un giorno chiuso; vuoto = una data chiusa si rifiuta.' },
        { nome: 'consegna.fascia', tipo: 'string', spiegazione: 'Una delle fasce del giorno, oppure scritta a mano («flessibile»).' },
        { nome: 'consegna.civicoNote', tipo: 'string', spiegazione: 'Note per chi consegna: citofono, piano, portineria.' },
        { nome: 'biglietto', tipo: 'string', spiegazione: 'La dedica che accompagna il regalo.' },
        { nome: 'spedizione', tipo: '{ titolo, prezzo }', spiegazione: 'Una voce usata, una tariffa del sito, una scritta a mano, o vuota (senza consegna).' },
        { nome: 'aggiungiIva', tipo: 'boolean', spiegazione: "Aggiungere l'IVA sopra ai prezzi (vedi iva)." },
        {
          nome: 'pagamento',
          tipo: '"link" | "pagato" | "alla-consegna"',
          spiegazione:
            'Link di pagamento (resta bozza finché non paga), ordine che nasce pagato, oppure ⭐ «alla-consegna»: l’ordine nasce subito e resta DA INCASSARE (su Shopify «in attesa di pagamento», con l’importo dovuto). I soldi li prende chi consegna.',
        },
        {
          nome: 'mezzoPagamento',
          tipo: 'string',
          spiegazione:
            'Con che mezzo ha pagato o pagherà: vale con pagamento = pagato e con alla-consegna. Le voci vere del negozio stanno in metodiPagamento qui sopra; per il contrassegno si usa «Contanti alla consegna» o «POS alla consegna», che su Shopify non esistono come gateway perché quei soldi non passano di lì.',
        },
      ],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
