// Segnala al commerciale — propone il negozio al registro anagrafiche seguendo le
// regole d'ingaggio del registro (deluxy-anagrafiche/README.md): un solo POST
// upsert-merge con sistema+idEsterno+asOf; l'anti-doppioni, l'append delle note e
// il merge per campo li fa il registro. Niente stato: le nuove nascono "prospect".
// La chiave di SCRITTURA sta nella config su KV (campo anagWriteKey, impostata da
// ⚙️ Impostazioni) e NON arriva mai al browser, come i token Shopify.
//
// POST /api/segnala   header x-app-password + x-app-user
//   body { nome, categoria, citta, provincia, indirizzo, telefono, email, sito, note,
//          idEsterno (place_id Google), quando (ISO, dal browser),
//          ordine: { numero, valore, brand } }
//   -> { ok, creato:true, partner }                      nuovo prospect nel registro
//   -> { ok, esistente:true, aggiornato:true, partner }  già censito: merge (note in
//        append, ultimaVisita/campi più freschi aggiornati dal registro)

import { authUser, readConfig } from './_auth.js';

const ANAG_URL_DEFAULT = 'https://deluxy-anagrafiche.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const nome = String(body.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Manca il nome del negozio.' });

    const cfg = await readConfig();
    const base = (cfg.anagUrl || ANAG_URL_DEFAULT).replace(/\/$/, '');
    const writeKey = (cfg.anagWriteKey || '').trim();
    if (!writeKey) return res.status(400).json({ error: 'Manca la chiave di scrittura del registro: impostala in ⚙️ Impostazioni.' });

    // riga di nota sull'ordine per cui il negozio è stato contattato
    const ord = body.ordine || {};
    const ordTxt = (ord.numero || ord.valore)
      ? 'Ordine' + (ord.numero ? ' #' + ord.numero : '') + (ord.valore ? ' valore € ' + ord.valore : '')
      : '';
    const quando = (typeof body.quando === 'string' && body.quando) ? body.quando : '';
    const dataStr = quando.slice(0, 10);

    const record = {
      nome,
      categoria: String(body.categoria || '').toUpperCase() || undefined,
      citta: body.citta ? String(body.citta).toUpperCase() : undefined,
      provincia: body.provincia ? String(body.provincia).toUpperCase() : undefined,
      indirizzo: body.indirizzo || undefined,
      telefono: body.telefono || undefined,
      email: body.email || undefined,
      // il registro accoda le note: una riga per ogni segnalazione, con data e utenza
      note: [
        (dataStr ? '[' + dataStr + '] ' : '') + 'Segnalato dall\'app search/supplier (' + auth.utente + ').',
        ordTxt, body.sito ? ('Sito: ' + body.sito) : '', body.note || '',
      ].filter(Boolean).join(' '),
      // identità stabile per il registro: ci riconosce alla prossima segnalazione
      sistema: 'deluxy-suppliers',
      idEsterno: body.idEsterno ? String(body.idEsterno) : undefined,
      asOf: quando || undefined,
      ultimaVisita: quando || undefined,
    };

    const cr = await fetch(base + '/api/v1/partners', {
      method: 'POST',
      headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok) return res.status(502).json({ error: 'Registro: ' + (cj.errore || ('HTTP ' + cr.status)) });

    // 201/"creato" = nuovo prospect; 200/"merged" = già censito, il registro ha fatto il merge
    const merged = cj.esito === 'merged' || (cj.esito !== 'creato' && cr.status === 200);
    if (merged) return res.status(200).json({ ok: true, esistente: true, aggiornato: true, partner: cj });
    return res.status(200).json({ ok: true, creato: true, partner: cj });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
