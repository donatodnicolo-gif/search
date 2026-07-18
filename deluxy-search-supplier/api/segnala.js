// Segnala al commerciale — crea un prospect nel registro anagrafiche.
// La chiave di SCRITTURA del registro sta nella config su KV (campo anagWriteKey,
// impostata da ⚙️ Admin) e NON arriva mai al browser, come i token Shopify.
//
// POST /api/segnala   header x-app-password
//   body { nome, categoria, citta, provincia, indirizzo, telefono, email, sito, note,
//          quando (ISO, dal browser), ordine: { numero, valore, brand } }
//   -> { ok, creato:true, partner }                    prospect creato (note con l'ordine)
//   -> { ok, esistente:true, aggiornato:true, partner } già censito: ultimaVisita
//        («ultimo contatto») aggiornata e nota dell'ordine accodata

import { authUser, readConfig } from './_auth.js';

const ANAG_URL_DEFAULT = 'https://deluxy-anagrafiche.vercel.app';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

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
    if (!writeKey) return res.status(400).json({ error: 'Manca la chiave di scrittura del registro: impostala in ⚙️ Admin.' });

    // riga di nota sull'ordine per cui il negozio è stato contattato
    const ord = body.ordine || {};
    const ordTxt = (ord.numero || ord.valore)
      ? 'Ordine' + (ord.numero ? ' #' + ord.numero : '') + (ord.valore ? ' valore € ' + ord.valore : '')
      : '';
    const quando = (typeof body.quando === 'string' && body.quando) ? body.quando : '';
    const dataStr = quando.slice(0, 10);

    // niente duplicati: cerca per nome e confronta nome normalizzato + città
    const qUrl = base + '/api/v1/partners?perPage=50&q=' + encodeURIComponent(nome);
    const qr = await fetch(qUrl, { headers: { 'x-api-key': writeKey } });
    if (qr.ok) {
      const esistenti = (await qr.json()).dati || [];
      const dup = esistenti.find(p => norm(p.nome) === norm(nome)
        && (!body.citta || !p.citta || norm(p.citta) === norm(body.citta)));
      if (dup) {
        // già censito: aggiorna «ultimo contatto» (ultimaVisita) e accoda la nota dell'ordine
        const nuovaNota = ((dup.note || '') + '\n'
          + (dataStr ? '[' + dataStr + '] ' : '')
          + (ordTxt || 'Ricontattato dall\'app search/supplier.')
          + ' (' + auth.utente + ')').trim();
        const patch = { note: nuovaNota };
        if (quando) patch.ultimaVisita = quando;
        const pr = await fetch(base + '/api/v1/partners/' + dup.id, {
          method: 'PATCH',
          headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const pj = await pr.json().catch(() => null);
        return res.status(200).json({ ok: true, esistente: true, aggiornato: pr.ok, partner: (pr.ok && pj) || dup });
      }
    }

    const record = {
      nome,
      categoria: String(body.categoria || '').toUpperCase() || null,
      stato: 'prospect',
      citta: body.citta ? String(body.citta).toUpperCase() : null,
      provincia: body.provincia ? String(body.provincia).toUpperCase() : null,
      indirizzo: body.indirizzo || null,
      telefono: body.telefono || null,
      email: body.email || null,
      note: ['Segnalato al commerciale dall\'app search/supplier (' + auth.utente + ').', ordTxt, body.sito ? ('Sito: ' + body.sito) : '', body.note || '']
        .filter(Boolean).join(' '),
      fonte: 'manuale',
    };
    if (quando) record.ultimaVisita = quando;
    const cr = await fetch(base + '/api/v1/partners', {
      method: 'POST',
      headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok) return res.status(502).json({ error: 'Registro: ' + (cj.errore || ('HTTP ' + cr.status)) });
    return res.status(200).json({ ok: true, creato: true, partner: cj });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
