// Ricevitore Webhook Shopify — salva gli ordini su Vercel KV (nessun token Admin richiesto per ricevere).
// Accetta DUE formati:
//
//  A) HTTPS diretto (Impostazioni → Notifiche → Webhook, evento "Creazione ordine", formato JSON):
//     URL:  https://search-deluxy.vercel.app/api/webhook?brand=deluxyflowers.com
//
//  B) Google Cloud Pub/Sub (push subscription che punta a questo endpoint):
//     - Crea un topic su GCP, concedi a delivery@shopify-pubsub-webhooks.iam.gserviceaccount.com
//       il ruolo "Pub/Sub Publisher" sul topic.
//     - Crea l'iscrizione lato Shopify con la mutation Admin: webhookSubscriptionCreate
//       (topic ORDERS_CREATE, webhookSubscription { pubSubProject, pubSubTopic, format: JSON }).
//     - Crea una subscription PUSH del topic che invii a:
//         https://search-deluxy.vercel.app/api/webhook?brand=deluxyflowers.com
//       Questo endpoint decodifica automaticamente l'envelope { message: { data(base64), attributes } }.
//
// (facoltativo, se imposti WEBHOOK_SECRET su Vercel:  ...&key=IL_TUO_SEGRETO )
//
// Env richiesti (Vercel → Storage → KV: si impostano da soli):
//   KV_REST_API_URL, KV_REST_API_TOKEN
// Env facoltativo: WEBHOOK_SECRET

const BRAND_BY_SHOP = {
  'fb72b1-2.myshopify.com': 'deluxyflowers.com',
  // aggiungeremo qui gli altri due negozi (dominio .myshopify.com : brand)
};

async function kvSet(key, value, ttlSeconds) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) throw new Error('Vercel KV non configurato (manca KV_REST_API_URL/TOKEN).');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value, 'EX', ttlSeconds]),
  });
  const j = await r.json();
  return j.result;
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

function attr(pools, re) {
  const hit = (pools || []).find(a => a && (a.name || a.key) && re.test(a.name || a.key));
  return hit ? hit.value : '';
}

function normalize(brand, o) {
  const sa = o.shipping_address || {};
  const cust = o.customer || {};
  const pools = [...(o.note_attributes || [])];
  (o.line_items || []).forEach(li => pools.push(...(li.properties || [])));

  const items = (o.line_items || []).map(li => ({
    title: li.title,
    quantity: li.quantity,
    // immagine prodotto: presente se arriva da Shopify Flow o se aggiunta come proprietà
    image: (li.image && (li.image.url || li.image)) || li.product_image || li.image_url || '',
    properties: (li.properties || []).filter(p => p.name && !String(p.name).startsWith('_')),
  }));

  const address = [sa.address1, sa.address2, [sa.zip, sa.city].filter(Boolean).join(' '), sa.province, sa.country]
    .filter(Boolean).join(', ');
  const recipient = sa.name || [sa.first_name, sa.last_name].filter(Boolean).join(' ')
    || [cust.first_name, cust.last_name].filter(Boolean).join(' ');

  // foto: prima dalle righe, poi da eventuali campi Flow, poi da una proprietà che è un URL immagine
  let photo = items.find(i => i.image)?.image || o.image || o.image_url || o._image || '';
  if (!photo) {
    const p = pools.find(a => /^https?:\/\/\S+\.(jpg|jpeg|png|webp)(\?|$)/i.test(a.value || ''));
    if (p) photo = p.value;
  }

  return {
    found: true,
    brand,
    orderName: o.name || ('#' + (o.order_number || o.number || '')),
    createdAt: o.created_at,
    financialStatus: o.financial_status,
    recipient,
    address,
    phone: sa.phone || cust.phone || '',
    amountPaid: parseFloat(o.total_price || '0'),
    currency: o.currency || 'EUR',
    note: o.note || '',
    date: attr(pools, /(data|consegn|delivery|date|quando|fecha|datum|livraison)/i),
    time: attr(pools, /(orar|ora\b|time|fascia|slot|hora|uhr|heure)/i),
    cardMessage: attr(pools, /(bigliet|dedica|messagg|message|card|frase|testo|tarjeta|karte|carte)/i),
    photoUrl: photo,
    items,
    attributes: (o.note_attributes || []).map(a => ({ key: a.name, value: a.value })),
    source: 'webhook',
  };
}

export const config = { api: { bodyParser: false } }; // ci serve il body grezzo

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  try {
    if (process.env.WEBHOOK_SECRET) {
      const k = req.query.key || req.headers['x-webhook-key'];
      if (k !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: 'Chiave webhook errata' });
    }

    const raw = await readRaw(req);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'JSON non valido' }); }

    // Rileva se arriva da Google Cloud Pub/Sub (push): { message: { data(base64), attributes } }
    let order = body;
    let attrs = {};
    if (body && body.message && typeof body.message.data === 'string') {
      attrs = body.message.attributes || {};
      const decoded = Buffer.from(body.message.data, 'base64').toString('utf8');
      try { order = JSON.parse(decoded); }
      catch (e) { return res.status(400).json({ error: 'Pub/Sub: data non è JSON valido' }); }
    }

    // dominio negozio: da header (HTTPS diretto) o da attributi Pub/Sub
    const shopDomain = req.headers['x-shopify-shop-domain'] || attrs['X-Shopify-Shop-Domain'] || attrs['x-shopify-shop-domain'] || '';
    const brand = req.query.brand || BRAND_BY_SHOP[shopDomain] || 'sconosciuto';
    const data = normalize(brand, order);
    const num = String(data.orderName).replace(/^#/, '').trim();
    if (!num) return res.status(200).json({ ok: true, skipped: 'nessun numero ordine (probabile messaggio di test)' });

    await kvSet(`order:${brand}:${num}`, JSON.stringify(data), 60 * 60 * 24 * 60); // 60 giorni
    return res.status(200).json({ ok: true, stored: `order:${brand}:${num}` });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
