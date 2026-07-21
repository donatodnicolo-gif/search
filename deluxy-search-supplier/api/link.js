// Handoff da un'altra app: apre la ricerca già sbloccata, senza login.
// Pattern "authorization code" (come OAuth): l'app chiamante (con la sua chiave
// API) crea un CODICE monouso e a scadenza breve; l'utente apre l'URL col codice;
// il browser lo SCAMBIA una volta sola per una SESSIONE temporanea (mai in URL).
//
// POST /api/link            header x-api-key (o admin)  body {quando}
//    -> { ok, code, url, scadeInSec }   (url = APP/?t=<code> — aggiungi &brand=&ordine=)
// GET  /api/link?code=<code>            (nessuna auth: il browser non ha ancora credenziali)
//    -> { ok, session, utente }   consuma il codice e crea una sessione da 1h
//
// KV: linkcode:<code> (TTL 300s, monouso) → session:<sess> (TTL 3600s).

import { authUser, kvCmd } from './_auth.js';
import { randomBytes } from 'node:crypto';

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 60); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, x-app-session, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // --- consumo del codice (pubblico): il browser lo scambia per una sessione ---
    if (req.method === 'GET') {
      const code = String(req.query.code || '').trim();
      if (!/^[a-f0-9]{48}$/.test(code)) return res.status(400).json({ error: 'Codice mancante o malformato.' });
      const raw = await kvCmd(['GET', 'linkcode:' + code]);
      if (!raw) return res.status(401).json({ error: 'Link non valido o scaduto: chiedi all\'app di rigenerarlo.' });
      await kvCmd(['DEL', 'linkcode:' + code]);   // monouso: consumato subito
      let info = {}; try { info = JSON.parse(raw); } catch (e) { /* ignora */ }
      const sess = randomBytes(24).toString('hex');
      const utente = info.utente || 'link';
      await kvCmd(['SET', 'session:' + sess, JSON.stringify({ utente, quando: s(req.query.ts, 40) }), 'EX', 3600]);
      return res.status(200).json({ ok: true, session: sess, utente });
    }

    // --- creazione del codice (richiede chiave API o admin) ---
    if (req.method === 'POST') {
      const auth = await authUser(req);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const code = randomBytes(24).toString('hex');
      await kvCmd(['SET', 'linkcode:' + code, JSON.stringify({ utente: auth.utente, quando: s(body.quando, 40) }), 'EX', 300]);
      const base = 'https://' + req.headers.host;
      return res.status(200).json({ ok: true, code, scadeInSec: 300, url: base + '/?t=' + code });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
