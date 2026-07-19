// Storico richieste — registro (su KV) di ciò che l'app ha fatto nel tempo:
// richieste ordine inviate (WhatsApp/email), contatti salvati in rubrica,
// segnalazioni al commerciale. Ogni evento porta l'utenza che l'ha fatto.
//
// GET  /api/storico   header x-app-password (+ x-app-user)  -> { ok, eventi:[...] }
// POST /api/storico   body { tipo, quando, canale, esito, negozio:{...}, ordine:{...} }
//   tipo: 'richiesta' | 'rubrica' | 'segnalazione'
//   L'utente NON arriva dal body: è quello autenticato. Il timestamp arriva dal
//   browser (campo quando, ISO) — niente new Date() nelle funzioni serverless.

import { authUser, kvCmd } from './_auth.js';

const KEY = 'storico:v1';
const MAX_EVENTI = 500;

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 200); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const raw = await kvCmd(['GET', KEY]);
    let eventi = [];
    if (raw) { try { eventi = JSON.parse(raw) || []; } catch (e) { eventi = []; } }

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, eventi });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const tipo = s(body.tipo, 20);
      if (!['richiesta', 'rubrica', 'segnalazione'].includes(tipo)) {
        return res.status(400).json({ error: "Tipo evento non valido (richiesta|rubrica|segnalazione)." });
      }
      const negozio = body.negozio || {};
      const ordine = body.ordine || {};
      const evento = {
        tipo,
        quando: s(body.quando, 40),
        utente: auth.utente,
        canale: s(body.canale, 20),
        esito: s(body.esito, 80),
        negozio: {
          nome: s(negozio.nome, 120),
          telefono: s(negozio.telefono, 40),
          email: s(negozio.email, 120),
          citta: s(negozio.citta, 60),
          provincia: s(negozio.provincia, 40),
        },
        ordine: (ordine.numero || ordine.valore) ? {
          numero: s(ordine.numero, 20),
          valore: s(ordine.valore, 20),
          brand: s(ordine.brand, 40),
        } : null,
      };
      eventi.unshift(evento);                       // più recenti in testa
      if (eventi.length > MAX_EVENTI) eventi = eventi.slice(0, MAX_EVENTI);
      await kvCmd(['SET', KEY, JSON.stringify(eventi)]);
      return res.status(200).json({ ok: true, totale: eventi.length });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
