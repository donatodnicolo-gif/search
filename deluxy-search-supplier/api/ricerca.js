// Cache condivisa delle ricerche in zona (48h) — evita di ripetere le chiamate a
// pagamento a Google quando la STESSA ricerca (indirizzo + categoria) è già stata
// fatta da qualsiasi operatore nelle ultime 48 ore. Condivisa fra tutti (KV).
//
// GET  /api/ricerca?key=<chiave>   -> { hit:true, salvatoIl, etaSec, payload } | { hit:false }
// POST /api/ricerca  { key, payload }  -> { ok:true }   (TTL 48h)
//
// `payload` è opaco per il server: lo costruisce e lo rilegge il front-end
// (HTML dei risultati già renderizzati + dati delle schede + foto). Il timestamp
// arriva dal browser (niente new Date() nelle funzioni serverless): il server usa
// il TTL del KV per la scadenza, e restituisce `salvatoIl` così com'era salvato.

import { authUser, kvCmd } from './_auth.js';

const PREFISSO = 'ricerca:v1:';
const TTL_SEC = 48 * 60 * 60;            // 48 ore
const MAX_BYTE = 900 * 1024;             // tetto prudente per il valore KV (~900 KB)

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 80); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, x-app-session, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const key = s(req.query.key, 60).replace(/[^a-z0-9]/gi, '');
      if (!key) return res.status(400).json({ error: 'Chiave mancante.' });
      const raw = await kvCmd(['GET', PREFISSO + key]);
      if (!raw) return res.status(200).json({ hit: false });
      let obj; try { obj = JSON.parse(raw); } catch (e) { return res.status(200).json({ hit: false }); }
      return res.status(200).json({ hit: true, salvatoIl: obj.salvatoIl || '', payload: obj.payload });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const key = s(body.key, 60).replace(/[^a-z0-9]/gi, '');
      if (!key) return res.status(400).json({ error: 'Chiave mancante.' });
      if (body.payload == null) return res.status(400).json({ error: 'Payload mancante.' });
      const record = JSON.stringify({ salvatoIl: s(body.salvatoIl, 40), payload: body.payload });
      // troppo pesante per il KV: non salvare (la ricerca funziona lo stesso, senza cache)
      if (record.length > MAX_BYTE) return res.status(200).json({ ok: false, tropoGrande: true });
      await kvCmd(['SET', PREFISSO + key, record, 'EX', TTL_SEC]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
