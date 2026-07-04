// Vercel Serverless Function — recupero ordine Shopify (lato server, token al sicuro)
// Endpoint: GET /api/order?brand=deluxy.it&number=1042   header: x-app-password
//
// Variabili d'ambiente da impostare su Vercel (Settings -> Environment Variables):
//   APP_PASSWORD           password che l'operatore digita nell'app (protegge i dati ordine)
//   SHOP_DELUXY            es. deluxy.myshopify.com        TOKEN_DELUXY            (Admin API access token)
//   SHOP_DELUXYFLOWERS     es. deluxyflowers.myshopify.com TOKEN_DELUXYFLOWERS
//   SHOP_CAKEDESIGN        es. cakedesign.myshopify.com    TOKEN_CAKEDESIGN

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
        title quantity
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
  for (const q of [`name:#${raw}`, `name:${raw}`]) {
    const node = await gql(shop, token, q);
    if (node) return node;
  }
  return null;
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
    note: o.note || '',
    // campi personalizzati "indovinati" (modificabili nell'app)
    date: guess(o, /(data|consegn|delivery|date|quando)/i),
    time: guess(o, /(orar|ora\b|time|fascia|slot)/i),
    cardMessage: guess(o, /(bigliet|dedica|message|messaggio|card|frase|testo)/i),
    photoUrl: photo,
    items,
    attributes: o.customAttributes || [],
  };
}

export default async function handler(req, res) {
  // CORS (utile se il front-end sta su un dominio diverso, es. github.io)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const brand = String(req.query.brand || '');
    const number = String(req.query.number || '');
    const pass = req.headers['x-app-password'] || '';

    if (!process.env.APP_PASSWORD) return res.status(500).json({ error: 'Backend non configurato: manca APP_PASSWORD.' });
    if (pass !== process.env.APP_PASSWORD) return res.status(401).json({ error: 'Password operatore errata.' });

    const cfg = BRANDS[brand];
    if (!cfg) return res.status(400).json({ error: 'Brand non valido.' });
    if (!cfg.shop || !cfg.token) return res.status(500).json({ error: `Backend non configurato per ${brand}: mancano SHOP_/TOKEN_.` });
    if (!number) return res.status(400).json({ error: 'Numero ordine mancante.' });

    const order = await findOrder(cfg.shop, cfg.token, number);
    if (!order) return res.status(404).json({ found: false, error: `Ordine ${number} non trovato su ${brand}.` });

    return res.status(200).json(normalize(brand, order));
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
