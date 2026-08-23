// Il giro giornaliero: l'AI legge le chat del giorno e PROPONE che cosa manca
// nel glossario, che cosa è sbagliato, e che cosa converrebbe dire all'operatore.
//
// ⚠️⚠️ **PROPONE. Non scrive.** Il glossario è quello su cui un operatore si
// basa per parlare a un cliente: un'AI che ci mette dentro un fatto da sola lo
// metterebbe in bocca a una persona senza che nessuno l'abbia verificato, e a
// scoprirlo sarebbe il cliente. Ogni proposta finisce in `PropostaGlossario` con
// stato `aperta`, e una persona accetta o scarta.
//
// ⚠️⚠️ **Ogni proposta porta la conversazione da cui nasce.** Senza la prova non
// è una proposta, è un'opinione: chi decide deve poter controllare in dieci
// secondi invece di fidarsi. Le proposte senza una conversazione vera si
// buttano qui, prima di arrivare a schermo.
//
// ⚠️ Gira una volta al giorno e non a ogni messaggio: è una lettura d'insieme,
// e a ogni messaggio costerebbe cento volte tanto per dire cento volte la stessa
// cosa.

import OpenAI from 'openai'
import { db } from './db'
import { leggiImpostazioni } from './impostazioni'

/** Quante conversazioni al massimo si guardano in un giro. */
const MAX_CONVERSAZIONI = 40
/** Quanti messaggi per conversazione: le code lunghe sono ripetizioni. */
const MAX_MESSAGGI = 12
/** Quante proposte al massimo si tengono da un giro solo. */
const MAX_PROPOSTE = 8

const MODELLO_DEFAULT = 'gpt-4o'

export type EsitoGiro = {
  conversazioniLette: number
  proposteNuove: number
  scartate: number
  errore: string
}

const ISTRUZIONI = [
  'Sei il redattore del glossario interno di un servizio clienti che vende fiori e torte (marchi: Deluxy, Deluxy Flowers, Cake Design).',
  'Ti do (1) il glossario di oggi e (2) le conversazioni con i clienti delle ultime 24 ore.',
  'Il tuo compito: trovare i FATTI che servirebbero a chi risponde e che nel glossario non ci sono, quelli che ci sono ma risultano SBAGLIATI dalle conversazioni, e i problemi ricorrenti che conviene segnalare.',
  '',
  'REGOLE, e sono la parte importante:',
  '- Proponi SOLO fatti che si leggono nelle conversazioni. Non dedurre, non generalizzare da un caso solo se il caso è chiaramente eccezionale, non inventare politiche aziendali.',
  '- Ogni proposta DEVE citare l\'id della conversazione da cui nasce (campo "conversazioneId", copiato da quelli che ti do).',
  '- Non proporre testi da mandare al cliente (quelli sono gli Script) né regole di tono per l\'AI (quelle sono le istruzioni CS AI): qui vanno solo FATTI.',
  '- Non proporre dati che l\'app già conosce da sola: numeri di telefono nostri, indirizzi email nostri, domini dei siti, percentuali di pagamento ai fornitori.',
  '- Nel dubbio non proporre. Una proposta sbagliata costa più di una mancata: chi la legge si fida.',
  '',
  'Tipi: "aggiunta" (manca), "correzione" (c\'è ma è sbagliato: metti anche voceId), "avviso" (nessuna voce da cambiare, ma l\'operatore deve saperlo — es. una domanda che torna ogni giorno senza risposta pronta).',
  'Categoria: "cliente" se si può dire a chi scrive, "tecnico" se è roba interna.',
  'negozioId: copialo da quelli che ti do, oppure lascialo vuoto se il fatto vale per tutti i marchi.',
  '',
  'Rispondi SOLO in JSON: {"proposte":[{"tipo":"...","voceId":"","termine":"...","definizione":"...","categoria":"...","negozioId":"","perche":"che cosa hai visto, in una frase","conversazioneId":"..."}]}',
].join('\n')

type PropostaGrezza = {
  tipo?: string
  voceId?: string
  termine?: string
  definizione?: string
  categoria?: string
  negozioId?: string
  perche?: string
  conversazioneId?: string
}

/**
 * Legge le chat delle ultime `ore` e scrive le proposte aperte.
 *
 * Non solleva mai: un giro che fallisce non deve lasciare tracce di errore in
 * un cron: torna il motivo e chi chiama lo scrive nella risposta.
 */
export async function giroGlossario(ore = 24): Promise<EsitoGiro> {
  const vuoto: EsitoGiro = { conversazioniLette: 0, proposteNuove: 0, scartate: 0, errore: '' }

  const imp = await leggiImpostazioni(['openaiApiKey', 'openaiModelloRisposte'])
  if (!imp.openaiApiKey) return { ...vuoto, errore: 'Chiave OpenAI non configurata.' }

  const da = new Date(Date.now() - ore * 3600_000)
  const conversazioni = await db.conversazione.findMany({
    where: { ultimoMessaggioIl: { gte: da }, eliminataIl: null, archiviata: false },
    orderBy: { ultimoMessaggioIl: 'desc' },
    take: MAX_CONVERSAZIONI,
    select: {
      id: true,
      canale: true,
      nome: true,
      negozioId: true,
      messaggi: {
        orderBy: { creatoIl: 'desc' },
        take: MAX_MESSAGGI,
        select: { direzione: true, testo: true },
      },
    },
  })
  if (!conversazioni.length) return vuoto

  const [negozi, voci] = await Promise.all([
    db.negozioShopify.findMany({ select: { id: true, nome: true } }),
    db.voceGlossario.findMany({ select: { id: true, termine: true, definizione: true, negozioId: true } }),
  ])
  const idNegozi = new Set(negozi.map((n) => n.id))
  const idVoci = new Set(voci.map((v) => v.id))
  const idConversazioni = new Set(conversazioni.map((c) => c.id))

  const glossarioOggi = voci.length
    ? voci
        .map(
          (v) =>
            `- [${v.id}]${v.negozioId ? ` (${negozi.find((n) => n.id === v.negozioId)?.nome ?? ''})` : ''} ${v.termine}: ${v.definizione}`
        )
        .join('\n')
    : '(il glossario è ancora vuoto)'

  const marchi = negozi.map((n) => `- [${n.id}] ${n.nome}`).join('\n')

  const chat = conversazioni
    .map((c) => {
      const righe = [...c.messaggi]
        .reverse()
        .map((m) => `${m.direzione === 'in' ? 'CLIENTE' : 'NOI'}: ${m.testo.replace(/\s+/g, ' ').slice(0, 400)}`)
        .join('\n')
      return `### conversazione ${c.id} · ${c.canale} · ${c.nome || 'senza nome'}\n${righe}`
    })
    .join('\n\n')

  let grezze: PropostaGrezza[] = []
  try {
    const client = new OpenAI({ apiKey: imp.openaiApiKey })
    const risposta = await client.chat.completions.create(
      {
        model: imp.openaiModelloRisposte || MODELLO_DEFAULT,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ISTRUZIONI },
          {
            role: 'user',
            content: `MARCHI:\n${marchi}\n\nGLOSSARIO DI OGGI:\n${glossarioOggi}\n\nCONVERSAZIONI:\n${chat}`,
          },
        ],
      },
      { signal: AbortSignal.timeout(120_000) }
    )
    const letto = JSON.parse(risposta.choices[0]?.message?.content ?? '{}') as {
      proposte?: PropostaGrezza[]
    }
    grezze = letto.proposte ?? []
  } catch (e) {
    return { ...vuoto, conversazioniLette: conversazioni.length, errore: (e as Error).message }
  }

  // ── IL FILTRO: quello che l'AI dice non entra così com'è ──
  //
  // ⚠️ Si buttano, in silenzio, le proposte senza prova (conversazione che non
  // esiste), quelle su un marchio inventato, quelle che correggono una voce che
  // non c'è, e i doppioni di proposte già aperte. È lo stesso principio del
  // correttore di bozze: l'AI propone, il codice controlla che regga.
  const gia = await db.propostaGlossario.findMany({
    where: { stato: 'aperta' },
    select: { termine: true, negozioId: true },
  })
  const giaAperte = new Set(gia.map((p) => `${p.termine.toLowerCase()}|${p.negozioId ?? ''}`))

  let scartate = 0
  const buone: PropostaGrezza[] = []
  for (const p of grezze) {
    const termine = (p.termine ?? '').trim()
    const definizione = (p.definizione ?? '').trim()
    const conversazioneId = (p.conversazioneId ?? '').trim()
    const tipo = ['aggiunta', 'correzione', 'avviso'].includes(p.tipo ?? '') ? p.tipo! : 'aggiunta'
    const negozioId = (p.negozioId ?? '').trim()
    const voceId = (p.voceId ?? '').trim()

    if (!termine || !definizione) { scartate++; continue }
    // ⚠️ Senza una conversazione VERA non è una proposta: è un'opinione.
    if (!idConversazioni.has(conversazioneId)) { scartate++; continue }
    if (negozioId && !idNegozi.has(negozioId)) { scartate++; continue }
    if (tipo === 'correzione' && !idVoci.has(voceId)) { scartate++; continue }
    const chiave = `${termine.toLowerCase()}|${negozioId}`
    if (giaAperte.has(chiave)) { scartate++; continue }
    giaAperte.add(chiave)
    buone.push({ ...p, tipo, termine, definizione, conversazioneId, negozioId, voceId })
    if (buone.length >= MAX_PROPOSTE) break
  }

  if (buone.length) {
    await db.propostaGlossario.createMany({
      data: buone.map((p) => ({
        tipo: p.tipo!,
        voceId: p.voceId ?? '',
        termine: p.termine!,
        definizione: p.definizione!,
        categoria: p.categoria === 'tecnico' ? 'tecnico' : 'cliente',
        negozioId: p.negozioId ?? '',
        perche: (p.perche ?? '').trim(),
        conversazioneId: p.conversazioneId!,
      })),
    })
  }

  return {
    conversazioniLette: conversazioni.length,
    proposteNuove: buone.length,
    scartate,
    errore: '',
  }
}
