// Vercel Serverless Function — recupero ordine Shopify (lato server, token al sicuro)
// Endpoint: GET /api/order?brand=deluxy.it&number=1042   header: x-app-password
//
// Variabili d'ambiente da impostare su Vercel (Settings -> Environment Variables):
//   APP_PASSWORD           password che l'operatore digita nell'app (protegge i dati ordine)
//   SHOP_DELUXY            es. deluxy.myshopify.com        TOKEN_DELUXY            (Admin API access token)
//   SHOP_DELUXYFLOWERS     es. deluxyflowers.myshopify.com TOKEN_DELUXYFLOWERS
//   SHOP_CAKEDESIGN        es. cakedesign.myshopify.com    TOKEN_CAKEDESIGN

import { authUser, kvCmd } from './_auth.js';

const API_VERSION = '2024-10';

const BRANDS = {
  'deluxy.it':         { shop: process.env.SHOP_DELUXY,        token: process.env.TOKEN_DELUXY },
  'deluxyflowers.com': { shop: process.env.SHOP_DELUXYFLOWERS, token: process.env.TOKEN_DELUXYFLOWERS },
  'cakedesign.me':     { shop: process.env.SHOP_CAKEDESIGN,    token: process.env.TOKEN_CAKEDESIGN },
};

const ORDER_QUERY = `
query getOrder($q: String!) {
  orders(first: 1, query: $q, sortKey: CREATED_AT, reverse: true) {
    edges { node {
      id name createdAt displayFinancialStatus note
      customAttributes { key value }
      totalPriceSet { shopMoney { amount currencyCode } }
      shippingAddress { name firstName lastName address1 address2 city zip province country phone }
      customer { firstName lastName phone email }
      lineItems(first: 20) { edges { node {
        title quantity variantTitle
        customAttributes { key value }
        image { url }
        product { featuredImage { url } }
      } } }
    } }
  }
}`;

async function gql(shop, token, q) {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: ORDER_QUERY, variables: { q } }),
  });
  if (!r.ok) throw new Error(`Shopify HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error('Shopify GraphQL: ' + JSON.stringify(j.errors));
  const edges = j?.data?.orders?.edges || [];
  return edges.length ? edges[0].node : null;
}

async function findOrder(shop, token, number) {
  const raw = String(number).trim().replace(/^#/, '');
  // prova varie forme del nome ordine (con/senza #, ricerca libera, per numero)
  const queries = [`name:#${raw}`, `name:${raw}`, `name:*${raw}`, `${raw}`, `order_number:${raw}`];
  const wanted = raw.replace(/\D/g, '');
  for (const q of queries) {
    const node = await gql(shop, token, q);
    // accetta solo se il numero dell'ordine trovato coincide ESATTAMENTE con quello richiesto
    if (node && String(node.name).replace(/\D/g, '') === wanted) return node;
  }
  return null;
}

// diagnostica: elenca i nomi degli ordini recenti per capire il formato
async function recentOrderNames(shop, token) {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: '{ orders(first:5, sortKey:CREATED_AT, reverse:true){ edges{ node{ name } } } }' }),
  });
  const j = await r.json();
  if (j.errors) return { error: j.errors };
  return (j?.data?.orders?.edges || []).map(e => e.node.name);
}

async function kvSet(key, value, ttl) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return false;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, value, 'EX', ttl]),
    });
    return true;
  } catch (e) { return false; }
}

// legge un ordine dal magazzino KV (salvato dal webhook)
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', key]),
    });
    const j = await r.json();
    return j.result || null;
  } catch (e) { return null; }
}

// credenziali del negozio: prima dalla cassaforte KV (config:v1), poi dalle env come fallback
async function storeFor(brand) {
  const raw = await kvGet('config:v1');
  if (raw) {
    try {
      const c = JSON.parse(raw);
      const s = (c.stores || []).find(x => x.brand === brand);
      if (s && s.shop && s.token) return { shop: s.shop, token: s.token };
    } catch (e) { /* ignora */ }
  }
  const env = BRANDS[brand];
  return (env && env.shop && env.token) ? { shop: env.shop, token: env.token } : null;
}

// cerca un valore fra gli attributi ordine + proprietà righe, per parola chiave
function guess(order, re) {
  const pools = [...(order.customAttributes || [])];
  for (const e of order.lineItems?.edges || []) pools.push(...(e.node.customAttributes || []));
  const hit = pools.find(a => a && a.key && re.test(a.key));
  return hit ? hit.value : '';
}

function normalize(brand, o) {
  const sa = o.shippingAddress || {};
  const cust = o.customer || {};
  const items = (o.lineItems?.edges || []).map(e => {
    const n = e.node;
    return {
      title: n.title,
      variant: (n.variantTitle && n.variantTitle !== 'Default Title') ? n.variantTitle : '',
      quantity: n.quantity,
      image: n.image?.url || n.product?.featuredImage?.url || '',
      properties: (n.customAttributes || []).filter(a => a.key && !a.key.startsWith('_')),
    };
  });
  const address = [sa.address1, sa.address2, [sa.zip, sa.city].filter(Boolean).join(' '), sa.province, sa.country]
    .filter(Boolean).join(', ');
  const recipient = sa.name || [sa.firstName, sa.lastName].filter(Boolean).join(' ')
    || [cust.firstName, cust.lastName].filter(Boolean).join(' ');
  const photo = items.find(i => i.image)?.image || '';

  // data / orario / bigliettino: prima dagli attributi, poi dal testo libero delle note
  const note = o.note || '';
  let date = guess(o, /(data|consegn|delivery|date|quando|fecha|datum|livraison)/i);
  let time = guess(o, /(orar|ora\b|time|fascia|slot|hora|uhr|heure)/i);
  let cardMessage = guess(o, /(bigliet|dedica|messagg|message|card|frase|testo|tarjeta|karte|carte)/i);
  if (!date) { const m = note.match(/(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/); if (m) date = m[1]; }
  if (!time) { const m = note.match(/(\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}(?:[:.]\d{2})?|\bore?\s*\d{1,2}(?:[:.]\d{2})?)/i); if (m) time = m[0]; }
  if (!cardMessage) cardMessage = note;

  return {
    found: true,
    brand,
    orderName: o.name,
    createdAt: o.createdAt,
    financialStatus: o.displayFinancialStatus,
    recipient,
    address,
    phone: sa.phone || cust.phone || '',
    amountPaid: parseFloat(o.totalPriceSet?.shopMoney?.amount || '0'),
    currency: o.totalPriceSet?.shopMoney?.currencyCode || 'EUR',
    note,
    date, time, cardMessage,
    photoUrl: photo,
    items,
    attributes: o.customAttributes || [],
  };
}

// registra il check nello Storico richieste (best effort: mai bloccare la risposta).
// `quando` arriva dal browser (query ts) — niente new Date() nelle funzioni serverless.
async function logCheck(utente, quando, brand, numero, esito, valore) {
  try {
    const raw = await kvCmd(['GET', 'storico:v1']);
    let eventi = [];
    if (raw) { try { eventi = JSON.parse(raw) || []; } catch (e) { eventi = []; } }
    eventi.unshift({
      tipo: 'check', quando: String(quando || '').slice(0, 40), utente,
      canale: 'shopify', esito: String(esito).slice(0, 80),
      negozio: { nome: '', telefono: '', email: '', citta: '', provincia: '' },
      ordine: { numero: String(numero).slice(0, 20), valore: String(valore || '').slice(0, 20), brand: String(brand).slice(0, 40) },
    });
    if (eventi.length > 500) eventi = eventi.slice(0, 500);
    await kvCmd(['SET', 'storico:v1', JSON.stringify(eventi)]);
  } catch (e) { /* lo storico non deve mai far fallire il recupero ordine */ }
}

export default async function handler(req, res) {
  // CORS (utile se il front-end sta su un dominio diverso, es. github.io)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const brand = String(req.query.brand || '');
    const number = String(req.query.number || '');

    const auth = await authUser(req);   // pass code principale o utenza dell'app
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    if (!brand) return res.status(400).json({ error: 'Brand mancante.' });
    if (!number) return res.status(400).json({ error: 'Numero ordine mancante.' });
    const numNoHash = number.replace(/^#/, '').trim();
    const ts = String(req.query.ts || '');   // timestamp del check, dal browser

    // 1) prima cerca fra gli ordini ricevuti via webhook (nessun token necessario)
    const cached = await kvGet(`order:${brand}:${numNoHash}`);
    if (cached) {
      const data = JSON.parse(cached);
      // Il payload del webhook Shopify NON include le immagini dei prodotti: se manca la foto
      // la recuperiamo dall'Admin API (che la sa) e ri-salviamo l'ordine arricchito in KV.
      if (!data.photoUrl) {
        try {
          const store = await storeFor(brand);
          if (store) {
            const order = await findOrder(store.shop, store.token, numNoHash);
            if (order) {
              const full = normalize(brand, order);
              if (full.photoUrl) {
                data.photoUrl = full.photoUrl;
                data.photoSource = 'admin';
                // riporta anche le immagini sulle singole righe, se combaciano per titolo
                (data.items || []).forEach(it => {
                  const m = (full.items || []).find(x => x.title === it.title);
                  if (m && m.image) it.image = m.image;
                });
                await kvSet(`order:${brand}:${numNoHash}`, JSON.stringify(data), 60 * 60 * 24 * 60);
              } else {
                data.photoNote = 'Il prodotto non ha immagine su Shopify.';
              }
            }
          } else {
            data.photoNote = 'Foto non disponibile: il webhook non la include e manca il token Shopify di questo negozio (collegalo dalle Impostazioni).';
          }
        } catch (e) {
          data.photoNote = 'Foto non recuperata da Shopify: ' + (e.message || String(e));
        }
      }
      await logCheck(auth.utente, ts, brand, numNoHash, 'ordine trovato (magazzino webhook)', data.amountPaid);
      return res.status(200).json(data);
    }

    // 2) altrimenti, se in cassaforte c'è un token Shopify per questo negozio, prova l'API Admin
    const store = await storeFor(brand);
    if (store) {
      const order = await findOrder(store.shop, store.token, number);
      if (order) {
        const data = normalize(brand, order);
        await logCheck(auth.utente, ts, brand, numNoHash, 'ordine trovato (Shopify)', data.amountPaid);
        return res.status(200).json(data);
      }
      await logCheck(auth.utente, ts, brand, numNoHash, 'ordine NON trovato', '');
      if (req.query.debug) {
        const recent = await recentOrderNames(store.shop, store.token);
        return res.status(404).json({ found: false, error: `Ordine ${number} non trovato su ${brand}.`, shop: store.shop, recentOrderNames: recent });
      }
      return res.status(404).json({ found: false, error: `Ordine ${number} non trovato su ${brand}.` });
    }

    // 3) niente webhook né token
    await logCheck(auth.utente, ts, brand, numNoHash, 'ordine NON trovato (nessun webhook/token)', '');
    return res.status(404).json({ found: false, error: `Ordine ${number} non ancora ricevuto via webhook (o attiva il token Shopify, oppure usa "Compila a mano").` });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
