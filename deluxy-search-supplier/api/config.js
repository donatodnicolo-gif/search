// Cassaforte impostazioni — salva/legge la configurazione (chiave Google, negozi Shopify) su Vercel KV.
// Protetta dal pass code (APP_PASSWORD). I token Shopify NON vengono mai restituiti al browser.
//
// GET  /api/config    header x-app-password  -> { ok, config: { googleKey, proxy, stores:[{brand,shop,hasToken}] } }
// POST /api/config    header x-app-password  body { googleKey, proxy, stores:[{brand,shop,token}] }
//   (token vuoto = mantiene quello già salvato)

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

// versione "pubblica": include la chiave Google (serve al browser) ma NON i token Shopify
function sanitize(c) {
  return {
    googleKey: c.googleKey || '',
    proxy: c.proxy || '',
    stores: (c.stores || []).map(s => ({ brand: s.brand, shop: s.shop || '', hasToken: !!s.token })),
  };
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
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!process.env.APP_PASSWORD) return res.status(500).json({ error: 'Backend non configurato: manca APP_PASSWORD.' });
    const pass = req.headers['x-app-password'] || '';
    if (pass !== process.env.APP_PASSWORD) return res.status(401).json({ error: 'Pass code errato.' });

    if (req.method === 'GET') {
      const c = await readConfig();
      return res.status(200).json({ ok: true, config: sanitize(c) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const cur = await readConfig();
      const merged = {
        googleKey: body.googleKey !== undefined ? String(body.googleKey).trim() : (cur.googleKey || ''),
        proxy: body.proxy !== undefined ? String(body.proxy).trim() : (cur.proxy || ''),
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
