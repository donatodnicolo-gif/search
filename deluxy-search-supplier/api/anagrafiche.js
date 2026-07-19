// Proxy di lettura verso il registro anagrafiche: il browser chiama questo
// endpoint (autenticato con le utenze dell'app) e la chiave x-api-key del
// registro resta sul server (config KV), come chiedono le regole d'ingaggio
// del registro ("chiave in variabile lato server, mai nel browser").
//
// GET /api/anagrafiche?categoria=&citta=&provincia=&q=&perPage=
//   -> { ok, totale, dati:[...] }          (risposta del registro, inoltrata)
//   -> { ok, skipped:true }                se nessuna chiave è configurata

import { authUser, readConfig } from './_auth.js';

const ANAG_URL_DEFAULT = 'https://deluxy-anagrafiche.vercel.app';
const PARAMS = ['q', 'categoria', 'citta', 'provincia', 'regione', 'stato', 'perPage', 'page'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const cfg = await readConfig();
    const base = (cfg.anagUrl || ANAG_URL_DEFAULT).replace(/\/$/, '');
    // lettura con la chiave di lettura; in mancanza va bene anche quella di scrittura
    const key = (cfg.anagKey || cfg.anagWriteKey || '').trim();
    if (!key) return res.status(200).json({ ok: true, skipped: true, dati: [] });

    const qs = new URLSearchParams();
    for (const p of PARAMS) {
      const v = req.query[p];
      if (v != null && String(v).trim() !== '') qs.set(p, String(v));
    }
    if (!qs.get('perPage')) qs.set('perPage', '200');

    const r = await fetch(base + '/api/v1/partners?' + qs, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Registro: ' + (j.errore || ('HTTP ' + r.status)) });
    return res.status(200).json({ ok: true, totale: j.totale, dati: j.dati || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
