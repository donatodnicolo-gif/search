import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { schedaCliente } from '@/lib/scheda-cliente'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// LA LETTURA AI DELLA SCHEDA: due righe su chi è questo cliente.
//
// ⚠️ RIASSUME I FATTI DELLA SCHEDA, NON LI INVENTA NÉ LI INTERPRETA. Le regole
// sono strette di proposito: qui l'AI parla di una persona reale a chi sta per
// scriverle, e una frase inventata («cliente esigente») diventa il tono con cui
// le si risponde. Se i dati non bastano, dirlo è la risposta giusta.
//
// Non usa le istruzioni di CS AI: quelle dicono come PARLARE AL CLIENTE, questo
// è un appunto per il collega. Mescolarle darebbe un riassunto scritto col
// «lei» e la firma aziendale, che qui non c'entrano niente.

const ISTRUZIONI = `Sei un collega del servizio clienti che passa la consegna a chi sta per rispondere a questo cliente.

Scrivi al massimo quattro frasi, in italiano, dette come le diresti a voce a un collega.

Regole, in ordine di importanza:
1. USA SOLO I DATI CHE TI DO. Non aggiungere caratteristiche, gusti, intenzioni o giudizi che non siano scritti nei dati: "cliente esigente", "molto affezionato", "sembra insoddisfatto" sono cose che non sai.
2. Di' le cose che cambiano il modo di rispondergli: quante volte ha comprato, se ha reclami aperti, se aspetta una risposta da noi, a chi manda di solito, quando ordina.
3. Se una cosa non si sa, non nominarla. Non scrivere "non risultano reclami" se la lista dei reclami e' vuota per mancanza di dati: distingui "non e' mai successo" da "non lo sappiamo" solo se te lo dico io.
4. Niente saluti, niente formule, niente consigli di vendita. E' un appunto, non una mail.
5. Se i dati sono troppo pochi per dire qualcosa di utile, scrivilo in una riga e basta.`

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { email, telefono } = (await req.json().catch(() => ({}))) as {
    email?: string
    telefono?: string
  }
  const scheda = await schedaCliente({ email: email ?? '', telefono: telefono ?? '' })
  if (!scheda) return NextResponse.json({ errore: 'Cliente non identificabile.' }, { status: 400 })

  const c = await leggiImpostazioni(['openaiApiKey', 'openaiModelloRisposte'])
  const chiave = (c.openaiApiKey ?? '').trim()
  if (!chiave) {
    return NextResponse.json(
      { errore: 'Manca la chiave OpenAI (Impostazioni): senza, la lettura non si può fare.' },
      { status: 400 }
    )
  }

  const reclamiAperti = scheda.reclami.filter((r) => r.stato !== 'risolto' && r.stato !== 'chiuso')
  const nonLetti = scheda.conversazioni.reduce((s, x) => s + x.nonLetti, 0)

  // I fatti si passano già digeriti: numeri e nomi, senza testo libero. Meno
  // materiale ambiguo c'è, meno spazio ha il modello per aggiungere del suo.
  const fatti = [
    `Nome: ${scheda.nome || 'non noto'}`,
    scheda.ordiniInTutto
      ? `Ha comprato ${scheda.ordiniInTutto} volte in tutto (conteggio del registro ordini).`
      : 'Quante volte abbia comprato non risulta.',
    `Ordini che vediamo: ${scheda.ordini.length}${
      scheda.fonteOrdini === 'copia locale' ? ' (SOLO ultimi due mesi: lo storico non era raggiungibile)' : ''
    }.`,
    scheda.speso ? `Totale di quegli ordini: ${Math.round(scheda.speso)} euro.` : '',
    scheda.tipoCliente ? `Tipo: ${scheda.tipoCliente}.` : '',
    scheda.destinatari.length
      ? `Manda spesso a: ${scheda.destinatari
          .slice(0, 4)
          .map((d) => `${d.nome}${d.citta ? ` (${d.citta})` : ''} ${d.volte} volte`)
          .join('; ')}.`
      : '',
    scheda.ricorrenze.length
      ? `Ordina in questi mesi, in anni diversi: ${scheda.ricorrenze
          .map((r) => `${r.mese} (${r.volte} ordini in ${r.anni} anni)`)
          .join('; ')}.`
      : '',
    reclamiAperti.length
      ? `RECLAMI APERTI: ${reclamiAperti.map((r) => `${r.casistica} (ordine ${r.ordineNumero})`).join('; ')}.`
      : scheda.reclami.length
        ? `Reclami passati, tutti chiusi: ${scheda.reclami.length}.`
        : '',
    scheda.rimborsi.length ? `Rimborsi richiesti: ${scheda.rimborsi.length}.` : '',
    nonLetti ? `ATTENZIONE: ha ${nonLetti} messaggi che non abbiamo ancora letto.` : '',
    scheda.ultimoContatto
      ? `Ultimo messaggio: ${new Date(scheda.ultimoContatto.quando).toLocaleDateString('it-IT')} su ${
          scheda.ultimoContatto.canale
        }, ${scheda.ultimoContatto.direzione === 'in' ? 'scritto dal cliente' : 'scritto da noi'}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new OpenAI({ apiKey: chiave, timeout: 45_000, maxRetries: 1 })
    const r = await client.chat.completions.create({
      model: (c.openaiModelloRisposte || 'gpt-4o').trim(),
      temperature: 0.2,
      messages: [
        { role: 'system', content: ISTRUZIONI },
        { role: 'user', content: `DATI DEL CLIENTE:\n${fatti}\n\nOra scrivi l'appunto.` },
      ],
    })
    const testo = r.choices[0]?.message?.content?.trim()
    if (!testo) return NextResponse.json({ errore: 'Risposta vuota dal modello.' }, { status: 502 })
    return NextResponse.json({ lettura: testo, fatti })
  } catch (e) {
    return NextResponse.json({ errore: `Lettura non riuscita: ${(e as Error).message}` }, { status: 502 })
  }
}
