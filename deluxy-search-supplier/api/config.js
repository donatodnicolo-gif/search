// Cassaforte impostazioni — salva/legge la configurazione (chiave Google, negozi
// Shopify, utenze) su Vercel KV. I token Shopify, la chiave di scrittura del
// registro e le password delle utenze NON vengono mai restituiti al browser.
//
// GET  /api/config    header x-app-password (+x-app-user)  — qualsiasi utenza
// POST /api/config    SOLO amministratore (pass code principale APP_PASSWORD)
//   body { googleKey, proxy, ..., utenti:[{nome,pass}], stores:[{brand,shop,token}] }
//   (token/pass vuoti = mantengono quelli già salvati)

import { authUser } from './_auth.js';

const KEY = 'config:v1';

async function kv(cmd) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) throw new Error('Archivio KV non configurato.');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  return j.result;
}

async function readConfig() {
  const raw = await kv(['GET', KEY]);
  if (!raw) return { googleKey: '', proxy: '', stores: [] };
  try { return JSON.parse(raw); } catch (e) { return { googleKey: '', proxy: '', stores: [] }; }
}

// versione "pubblica": include la chiave Google e quella (sola lettura) del registro
// anagrafiche — servono al browser — ma NON i token Shopify né la chiave di
// SCRITTURA del registro (usata solo dal server in /api/segnala)
function sanitize(c) {
  return {
    googleKey: c.googleKey || '',
    proxy: c.proxy || '',
    anagUrl: c.anagUrl || '',
    hasAnagKey: !!c.anagKey,
    hasAnagWriteKey: !!c.anagWriteKey,
    googleOauthClientId: c.googleOauthClientId || '',
    utenti: (c.utenti || []).map(u => ({ nome: u.nome })),
    stores: (c.stores || []).map(s => ({ brand: s.brand, shop: s.shop || '', hasToken: !!s.token })),
  };
}

// utenze: pass vuota = mantiene quella già salvata; riga tolta = utenza rimossa
function mergeUtenti(current, incoming) {
  if (!Array.isArray(incoming)) return current || [];
  const byNome = {};
  (current || []).forEach(u => { if (u && u.nome) byNome[String(u.nome).toLowerCase()] = u; });
  return incoming
    .map(u => {
      const nome = String((u && u.nome) || '').trim();
      if (!nome) return null;
      const prev = byNome[nome.toLowerCase()] || {};
      const pass = (u.pass && String(u.pass).trim()) ? String(u.pass).trim() : (prev.pass || '');
      return pass ? { nome, pass } : null;   // utenza senza password = non salvata
    })
    .filter(Boolean);
}

function mergeStores(current, incoming) {
  if (!Array.isArray(incoming)) return current || [];
  const byBrand = {};
  (current || []).forEach(s => { byBrand[s.brand] = s; });
  return incoming.map(s => {
    const prev = byBrand[s.brand] || {};
    const token = (s.token && String(s.token).trim()) ? String(s.token).trim() : (prev.token || '');
    return { brand: s.brand, shop: (s.shop || prev.shop || '').trim(), token };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      const c = await readConfig();
      return res.status(200).json({ ok: true, config: sanitize(c), utente: auth.utente, admin: auth.admin });
    }

    if (req.method === 'POST') {
      if (!auth.admin) return res.status(403).json({ error: 'Solo l\'amministratore (pass code principale) può salvare le impostazioni.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const cur = await readConfig();
      const merged = {
        googleKey: body.googleKey !== undefined ? String(body.googleKey).trim() : (cur.googleKey || ''),
        proxy: body.proxy !== undefined ? String(body.proxy).trim() : (cur.proxy || ''),
        anagUrl: body.anagUrl !== undefined ? String(body.anagUrl).trim() : (cur.anagUrl || ''),
        // segreta: vuota = mantiene quella già salvata (le chiavi non tornano al browser)
        anagKey: (body.anagKey && String(body.anagKey).trim()) ? String(body.anagKey).trim() : (cur.anagKey || ''),
        // segreta: vuota = mantiene quella già salvata (come i token Shopify)
        anagWriteKey: (body.anagWriteKey && String(body.anagWriteKey).trim()) ? String(body.anagWriteKey).trim() : (cur.anagWriteKey || ''),
        googleOauthClientId: body.googleOauthClientId !== undefined ? String(body.googleOauthClientId).trim() : (cur.googleOauthClientId || ''),
        utenti: mergeUtenti(cur.utenti, body.utenti),
        stores: mergeStores(cur.stores, body.stores),
      };
      await kv(['SET', KEY, JSON.stringify(merged)]);
      return res.status(200).json({ ok: true, config: sanitize(merged) });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
