// Edge Function `estrai-anagrafica` (Deno): LEGGE UNA RICHIESTA E CAPISCE CHI
// L'HA MANDATA, per compilare l'anagrafica invece di lasciarla vuota.
//
// Richiesta dell'utente (26/08/2026): «usa l'ai per capire esattamente come
// compilare tutti i campi». Nasce da un caso vero: qualificando una richiesta
// dal modulo del sito, nel registro Anagrafiche stava per entrare un'azienda
// chiamata come una PERSONA, senza città, senza indirizzo, senza categoria — e
// con referente «Business Deluxy (Shopify)», che è il mittente della notifica.
// Tutto quello che serviva era scritto dentro il messaggio.
//
// POST /functions/v1/estrai-anagrafica   (utente Scout loggato)
//   { testo, mittente?, oggetto? }
//   → { ok, fonte: 'ai' | 'regole', dati: {...}, avviso? }
//
// ⚠️⚠️ REGOLA NON NEGOZIABILE: **non si deduce**. Il modello riempie un campo
// solo se il dato è SCRITTO nel testo; se non c'è, torna null. «Meglio "non
// indicato" che sbagliato» — un indirizzo inventato finisce nel registro delle
// anagrafiche B2B e ci resta. Il prompt lo dice, e l'app mostra comunque i
// campi a chi qualifica prima di scriverli.
//
// ⚠️ Il motore è **OpenAI** (scelta dell'utente, 26/08/2026): serve
// `OPENAI_API_KEY` fra i secret del progetto — la stessa che usa già
// `assistente-trattative`. Se un giorno ci fosse solo la chiave Anthropic vale
// anche quella, ma la strada principale è una sola.
//
// Senza nessuna chiave la funzione NON fallisce: torna quello che sa estrarre a
// regole e lo DICHIARA (`fonte: 'regole'`), così chi guarda sa cosa ha in mano.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chiaveHub } from '../_shared/chiavi.ts';

const OPENAI = 'https://api.openai.com/v1/chat/completions';
const MODEL_OPENAI = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'; // veloce ed economico
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODEL_ANTHROPIC = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

// Le categorie che il registro conosce davvero (lette dalle sue anagrafiche il
// 26/08/2026). Il modello deve scegliere fra queste o dire null: una categoria
// inventata verrebbe scartata in silenzio dal registro — che è il modo peggiore
// di sbagliare, perché sembra funzionare.
const CATEGORIE = [
  'ALTRO', 'AZIENDA', 'BOUTIQUE', 'CATERING', 'CHEF PRIVATO', 'CIOCCOLATERIA',
  'COLAZIONI & BRUNCH', 'CONCIERGE', 'CONSULENZA', 'CORPORATE', 'ENOTECA',
  'FIORISTA', 'GIFTING', 'GIOIELLERIA', 'HOTEL', 'MAGAZZINO', 'MERCHANDISING',
  'MODA', 'PARTY', 'PASTICCERIA', 'RISTORANTE', 'SPIRITS',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export interface DatiEstratti {
  /** Il nome dell'AZIENDA (non della persona). null se il testo non lo dice. */
  ragioneSociale: string | null;
  citta: string | null;
  indirizzo: string | null;
  categoria: string | null;
  referente: { nome: string | null; email: string | null; telefono: string | null; ruolo: string | null };
  /** Cosa chiede, in una riga: serve all'oggetto della trattativa. */
  richiesta: string | null;
  /** Quello che il modello NON ha trovato: si mostra, non si nasconde. */
  mancanti: string[];
}

/** Il ripiego a regole: le etichette del modulo Shopify e i pattern generici. */
function aRegole(testo: string, mittente: string | null): DatiEstratti {
  const etichetta = (label: string) => {
    const m = testo.match(new RegExp(`${label}\\s*:\\s*([^\\n\\r]+)`, 'i'));
    return m?.[1]?.trim() || null;
  };
  const email =
    etichetta('Email') ||
    testo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ||
    (mittente && mittente.includes('@') ? mittente : null);
  const telefono = etichetta('Phone') || etichetta('Telefono') || testo.match(/\+?\d[\d\s\-.]{7,}\d/)?.[0] || null;
  const nome = etichetta('Name') || etichetta('Nome') || null;
  const azienda = etichetta('Company') || etichetta('Azienda') || etichetta('Ragione sociale') || null;
  const dati: DatiEstratti = {
    ragioneSociale: azienda,
    citta: etichetta('Città') || etichetta('City') || null,
    indirizzo: etichetta('Indirizzo') || etichetta('Address') || null,
    categoria: null,
    referente: { nome, email: email?.toLowerCase() ?? null, telefono, ruolo: null },
    richiesta: null,
    mancanti: [],
  };
  dati.mancanti = campiMancanti(dati);
  return dati;
}

function campiMancanti(d: DatiEstratti): string[] {
  const out: string[] = [];
  if (!d.ragioneSociale) out.push('ragione sociale');
  if (!d.citta) out.push('città');
  if (!d.indirizzo) out.push('indirizzo');
  if (!d.categoria) out.push('categoria');
  if (!d.referente?.nome) out.push('nome del referente');
  return out;
}

const SISTEMA = `Sei l'assistente di un'azienda che vende servizi B2B (consegne, fiori, catering, gifting).
Ricevi il testo di una richiesta arrivata per email o dal modulo di un sito.
Il tuo compito è compilare la scheda anagrafica dell'azienda che ha scritto.

REGOLA ASSOLUTA: non dedurre e non inventare. Metti un valore SOLO se è scritto
nel testo (o è ovvio dal dominio dell'email, es. "@gruppospuma.it" → l'azienda è
"Gruppo Spuma"). Se un dato non c'è, scrivi null. Un indirizzo o una città
sbagliati finiscono nel registro aziendale e ci restano: "non indicato" è
sempre meglio di un valore plausibile.

Distingui l'AZIENDA dalla PERSONA: "ragioneSociale" è l'azienda, "referente" è
chi scrive. Se il testo porta solo una persona senza azienda, ragioneSociale
resta null (non copiarci il nome della persona).

Ignora i mittenti automatici (notifiche di piattaforme come Shopify, no-reply,
mailer@): non sono il referente. Il referente vero è dentro il testo.

"categoria" va scelta ESATTAMENTE da questo elenco, oppure null:
${CATEGORIE.join(', ')}.

"richiesta" è una riga che riassume cosa chiede il cliente, con le sue parole.

Rispondi SOLO con questo JSON, senza commenti:
{"ragioneSociale":null,"citta":null,"indirizzo":null,"categoria":null,
 "referente":{"nome":null,"email":null,"telefono":null,"ruolo":null},
 "richiesta":null}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Chi chiama dev'essere un utente Scout loggato.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ ok: false, errore: 'Non autenticato' }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const testo = String(body.testo ?? '').trim().slice(0, 6000);
    const mittente = typeof body.mittente === 'string' ? body.mittente.trim() : null;
    const oggetto = typeof body.oggetto === 'string' ? body.oggetto.trim() : null;
    if (!testo) return json({ ok: false, errore: 'Manca il testo della richiesta.' }, 400);

    // OpenAI è la strada principale; Anthropic vale solo se c'è quella e non
    // l'altra. Due motori con lo stesso prompt: cambia solo la forma della
    // chiamata e dove sta la risposta.
    const keyOpenAI = Deno.env.get('OPENAI_API_KEY') ?? (await chiaveHub('OPENAI_API_KEY'));
    const keyAnthropic = keyOpenAI
      ? null
      : Deno.env.get('ANTHROPIC_API_KEY') ?? (await chiaveHub('ANTHROPIC_API_KEY'));
    if (!keyOpenAI && !keyAnthropic) {
      // Inerte, non rotta: si dice cosa manca e si torna il ripiego.
      return json({
        ok: true,
        fonte: 'regole',
        dati: aRegole(testo, mittente),
        avviso:
          'Chiave AI non configurata: i campi sono stati letti con le regole fisse (etichette del modulo). ' +
          'Per la lettura completa serve OPENAI_API_KEY fra i secret del progetto Supabase.',
      });
    }

    const contenuto = JSON.stringify({ mittente, oggetto, testo });
    const aiRes = keyOpenAI
      ? await fetch(OPENAI, {
          method: 'POST',
          headers: { Authorization: `Bearer ${keyOpenAI}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: MODEL_OPENAI,
            // Modalità JSON: la risposta è un oggetto, non un testo da cui
            // ritagliarlo. Il prompt nomina «JSON», come la modalità pretende.
            response_format: { type: 'json_object' },
            temperature: 0,
            messages: [
              { role: 'system', content: SISTEMA },
              { role: 'user', content: contenuto },
            ],
          }),
        })
      : await fetch(ANTHROPIC, {
          method: 'POST',
          headers: { 'x-api-key': keyAnthropic!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: MODEL_ANTHROPIC,
            max_tokens: 1000,
            system: SISTEMA,
            messages: [{ role: 'user', content: contenuto }],
          }),
        });
    if (!aiRes.ok) {
      const dettaglio = await aiRes.text().catch(() => '');
      return json({
        ok: true,
        fonte: 'regole',
        dati: aRegole(testo, mittente),
        avviso: `L'AI non ha risposto (${aiRes.status}): campi letti con le regole fisse. ${dettaglio.slice(0, 160)}`,
      });
    }
    const aiData = await aiRes.json();
    // OpenAI: `choices[0].message.content` · Anthropic: `content[0].text`.
    const raw: string = keyOpenAI
      ? aiData.choices?.[0]?.message?.content ?? '{}'
      : aiData.content?.[0]?.text ?? '{}';
    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const pulisci = (v: unknown): string | null => {
      const s = typeof v === 'string' ? v.trim() : '';
      // ⚠️ Il modello a volte scrive «non indicato» invece di null: sarebbe
      // finito nel registro come se fosse un valore.
      if (!s || /^(null|n\/?d|non indicat|sconosciut|nessun)/i.test(s)) return null;
      return s;
    };
    const categoria = pulisci(parsed.categoria);
    const dati: DatiEstratti = {
      ragioneSociale: pulisci(parsed.ragioneSociale),
      citta: pulisci(parsed.citta),
      indirizzo: pulisci(parsed.indirizzo),
      // Fuori catalogo = come se non l'avesse detta: il registro la scarterebbe
      // in silenzio, e in silenzio è il modo peggiore.
      categoria: categoria && CATEGORIE.includes(categoria.toUpperCase()) ? categoria.toUpperCase() : null,
      referente: {
        nome: pulisci(parsed.referente?.nome),
        email: pulisci(parsed.referente?.email)?.toLowerCase() ?? null,
        telefono: pulisci(parsed.referente?.telefono),
        ruolo: pulisci(parsed.referente?.ruolo),
      },
      richiesta: pulisci(parsed.richiesta),
      mancanti: [],
    };
    dati.mancanti = campiMancanti(dati);
    return json({ ok: true, fonte: "ai", dati, modello: keyOpenAI ? MODEL_OPENAI : MODEL_ANTHROPIC });
  } catch (e) {
    return json({ ok: false, errore: String((e as Error)?.message ?? e) }, 500);
  }
});
