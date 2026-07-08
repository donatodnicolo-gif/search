// OAuth Shopify — ottiene e salva il token Admin API di ogni negozio nella cassaforte (KV).
// Avvio:    GET /api/oauth?shop=xxxx.myshopify.com&pass=IL_PASSCODE   -> redirect a Shopify
// Callback: GET /api/oauth?code=...&shop=...&hmac=...&state=...        -> scambia il code con il token e lo salva
//
// Env richiesti su Vercel:
//   SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET  (dalle Credenziali dell'app nella Dev Dashboard)
//   APP_PASSWORD  (già presente)
//   KV_REST_API_URL / KV_REST_API_TOKEN  (già presenti)

import crypto from 'crypto';

const REDIRECT = 'https://search-deluxy.vercel.app/api/oauth';
const SCOPES = 'read_orders,read_customers,read_products';

// dominio .myshopify.com  ->  brand usato nell'app
const SHOP_BRAND = {
  'fb72b1-2.myshopify.com': 'deluxyflowers.com',
  'deluxygifts.myshopify.com': 'deluxy.it',
  'cakedesign-5921.myshopify.com': 'cakedesign.me',
};

async function kv(cmd) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  return j.result;
}
async function readConfig() {
  const raw = await kv(['GET', 'config:v1']);
  return raw ? JSON.parse(raw) : { googleKey: '', proxy: '', stores: [] };
}

function verifyHmac(query, secret) {
  const { hmac, signature, ...rest } = query;
  const msg = Object.keys(rest).sort()
    .map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(String(hmac), 'utf8')); }
  catch (e) { return false; }
}

export default async function handler(req, res) {
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const q = req.query || {};
  const shop = String(q.shop || '');

  if (shop && !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).send('Dominio negozio non valido.');
  }

  // ---- CALLBACK ----
  if (q.code) {
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('OAuth non configurato (manca CLIENT_ID/SECRET su Vercel).');
    if (!verifyHmac(q, CLIENT_SECRET)) return res.status(401).send('Verifica HMAC fallita.');
    try {
      const tr = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: q.code }),
      });
      if (!tr.ok) return res.status(502).send('Scambio token fallito: HTTP ' + tr.status);
      const data = await tr.json();
      const token = data.access_token;
      if (!token) return res.status(502).send('Nessun access_token ricevuto.');
      const brand = SHOP_BRAND[shop] || shop;
      const cfg = await readConfig();
      const stores = cfg.stores || [];
      const i = stores.findIndex(s => s.brand === brand);
      const entry = { brand, shop, token };
      if (i >= 0) stores[i] = entry; else stores.push(entry);
      cfg.stores = stores;
      await kv(['SET', 'config:v1', JSON.stringify(cfg)]);
      res.writeHead(302, { Location: 'https://search-deluxy.vercel.app/?connected=' + encodeURIComponent(brand) });
      return res.end();
    } catch (err) {
      return res.status(500).send('Errore OAuth: ' + (err.message || String(err)));
    }
  }

  // ---- START ----
  if (shop) {
    if (!process.env.APP_PASSWORD || String(q.pass || '') !== process.env.APP_PASSWORD) {
      return res.status(401).send('Pass code mancante o errato. Uso: /api/oauth?shop=xxxx.myshopify.com&pass=IL_PASSCODE');
    }
    if (!CLIENT_ID) return res.status(500).send('OAuth non configurato (manca CLIENT_ID su Vercel).');
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://${shop}/admin/oauth/authorize`
      + `?client_id=${encodeURIComponent(CLIENT_ID)}`
      + `&scope=${encodeURIComponent(SCOPES)}`
      + `&redirect_uri=${encodeURIComponent(REDIRECT)}`
      + `&state=${state}`;
    res.writeHead(302, { Location: url });
    return res.end();
  }

  return res.status(400).send('Uso: /api/oauth?shop=xxxx.myshopify.com&pass=IL_PASSCODE');
}
