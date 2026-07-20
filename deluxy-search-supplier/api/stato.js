// Stato della ricerca fornitore per ordine + "stelline" sui fornitori contattati.
// Condiviso fra tutti gli operatori (KV), così si vede chi è già stato sentito.
//
// GET  /api/stato?ordine=<brand#numero | generale>
//   -> { ok, stato:'non iniziata|in corso|trovato', stelle:{ id:{nome,utente,quando} } }
// POST /api/stato  body { ordine, quando, stato?, stella?:{id,nome,on} }
//   - stato: aggiorna lo stato della ricerca per quell'ordine
//   - stella: on=true segna il fornitore come contattato, on=false toglie il segno
//   Il timestamp arriva dal browser (niente new Date() nelle funzioni serverless).

import { authUser, kvCmd } from './_auth.js';

const KEY = 'statoricerca:v1';
const STATI = ['non iniziata', 'in corso', 'trovato'];
const MAX_ORDINI = 300;

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 120); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const raw = await kvCmd(['GET', KEY]);
    let mappa = {};
    if (raw) { try { mappa = JSON.parse(raw) || {}; } catch (e) { mappa = {}; } }

    if (req.method === 'GET') {
      const k = s(req.query.ordine, 80) || 'generale';
      const e = mappa[k] || {};
      return res.status(200).json({ ok: true, ordine: k, stato: e.stato || 'non iniziata', stelle: e.stelle || {} });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const k = s(body.ordine, 80) || 'generale';
      const quando = s(body.quando, 40);
      const e = mappa[k] || { stato: 'non iniziata', stelle: {} };
      if (body.stato != null) {
        const st = s(body.stato, 20);
        if (!STATI.includes(st)) return res.status(400).json({ error: 'Stato non valido (non iniziata|in corso|trovato).' });
        e.stato = st; e.statoDa = auth.utente; e.statoQuando = quando;
      }
      if (body.stella && body.stella.id) {
        const id = s(body.stella.id, 80);
        e.stelle = e.stelle || {};
        if (body.stella.on) e.stelle[id] = { nome: s(body.stella.nome, 120), utente: auth.utente, quando };
        else delete e.stelle[id];
      }
      e.aggiornato = quando;
      mappa[k] = e;
      // non far crescere la mappa all'infinito: via gli ordini toccati meno di recente
      const chiavi = Object.keys(mappa);
      if (chiavi.length > MAX_ORDINI) {
        chiavi.sort((a, b) => String(mappa[a].aggiornato || '').localeCompare(String(mappa[b].aggiornato || '')));
        for (const old of chiavi.slice(0, chiavi.length - MAX_ORDINI)) delete mappa[old];
      }
      await kvCmd(['SET', KEY, JSON.stringify(mappa)]);
      return res.status(200).json({ ok: true, ordine: k, stato: e.stato, stelle: e.stelle || {} });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
