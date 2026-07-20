// Gestione chiavi API (solo amministratore, pass code principale).
// Le chiavi servono ad AI e integrazioni per chiamare le API dell'app con
// l'header `x-api-key: dlxs_<id>_<segreto>` al posto di email+password.
//
// GET  /api/chiavi                          -> { ok, chiavi:[{id,nome,creata}] }  (mai hash/segreti)
// POST /api/chiavi {azione:'crea',  nome, quando} -> { ok, chiave:'dlxs_…' }  ← mostrata SOLO ora
// POST /api/chiavi {azione:'revoca', id}          -> { ok, revocata:id }
//
// Il segreto è salvato hashato (scrypt+salt): perso = si genera una chiave nuova.

import { authUser, readApiKeys, writeApiKeys, newSalt, hashPass } from './_auth.js';
import { randomBytes } from 'node:crypto';

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 120); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    if (!auth.admin) return res.status(403).json({ error: 'Solo l\'amministratore (pass code principale) gestisce le chiavi API.' });

    const chiavi = await readApiKeys();

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, chiavi: chiavi.map(k => ({ id: k.id, nome: k.nome, creata: k.creata })) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const azione = s(body.azione, 20);

      if (azione === 'crea') {
        const nome = s(body.nome, 60).trim();
        if (!nome) return res.status(400).json({ error: 'Dai un nome alla chiave (es. "claude", "zapier").' });
        const id = randomBytes(4).toString('hex');
        const segreto = randomBytes(16).toString('hex');
        const salt = newSalt();
        chiavi.push({ id, nome, salt, hash: hashPass(segreto, salt), creata: s(body.quando, 40) });
        await writeApiKeys(chiavi);
        return res.status(200).json({
          ok: true, id, nome,
          chiave: `dlxs_${id}_${segreto}`,
          nota: 'Conserva la chiave ORA: non sarà più visibile (in cassaforte resta solo l\'hash).',
        });
      }

      if (azione === 'revoca') {
        const id = s(body.id, 20);
        const dopo = chiavi.filter(k => k.id !== id);
        if (dopo.length === chiavi.length) return res.status(404).json({ error: 'Chiave non trovata: ' + id });
        await writeApiKeys(dopo);
        return res.status(200).json({ ok: true, revocata: id });
      }

      return res.status(400).json({ error: 'Azione non valida (crea|revoca).' });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
