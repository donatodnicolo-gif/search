// Riconcilia un fornitore trovato su Google con un contatto già nel registro
// anagrafiche: comunica al registro che sono la stessa realtà. Il registro
// registra il riferimento esterno (sistema 'deluxy-suppliers' + place_id) — così
// da quel momento risolve il negozio con by-ref — e fa il merge per campo dei
// dati freschi (telefono, sito, indirizzo) secondo le sue regole d'ingaggio.
//
// Come: il POST upsert del registro non accetta un id esplicito, ma risolve
// l'identità in cascata (riferimento → platformId → P.IVA → nome+città). Quindi:
// 1. GET del record scelto (per avere nome+città ESATTI del registro);
// 2. POST con QUELL'identità + idEsterno Google → il registro aggancia il record
//    giusto, salva il riferimento e fonde i campi.
// 3. Rete di sicurezza: se il registro risponde "creato" (aggancio fallito →
//    doppione) lo disattiviamo subito (DELETE = soft delete) e segnaliamo
//    l'errore; se fa merge su un ALTRO record, lo diciamo senza fingere successo.
//
// POST /api/riconcilia   auth: utenza o chiave API
//   body { partnerId, quando, ordine?:{numero,valore,brand},
//          place: { idEsterno(place_id), nome, categoria, citta, provincia,
//                   indirizzo, telefono, email, sito } }
//   -> { ok, riconciliato:true, partner }        riferimento creato + merge fatto
//   -> { error }                                  con spiegazione onesta

import { authUser, readConfig } from './_auth.js';

const ANAG_URL_DEFAULT = 'https://deluxy-anagrafiche.vercel.app';
const s = (v, max) => (v == null ? '' : String(v).slice(0, max || 200));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, x-app-session, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const partnerId = s(body.partnerId, 60).trim();
    const place = body.place || {};
    const idEsterno = s(place.idEsterno, 120).trim();
    if (!partnerId) return res.status(400).json({ error: 'Manca partnerId (il contatto del registro).' });
    if (!idEsterno) return res.status(400).json({ error: 'Manca place.idEsterno (place_id Google).' });

    const cfg = await readConfig();
    const base = (cfg.anagUrl || ANAG_URL_DEFAULT).replace(/\/$/, '');
    const writeKey = (cfg.anagWriteKey || '').trim();
    if (!writeKey) return res.status(400).json({ error: 'Manca la chiave di scrittura del registro: impostala in ⚙️ Impostazioni.' });

    // 1) il record scelto, con nome+città ESATTI (sono la sua identità nel POST)
    const gr = await fetch(base + '/api/v1/partners/' + encodeURIComponent(partnerId), {
      headers: { 'x-api-key': writeKey },
    });
    const reg = await gr.json().catch(() => ({}));
    if (!gr.ok) return res.status(gr.status === 404 ? 404 : 502).json({ error: 'Registro: contatto ' + partnerId + ' non trovato (' + (reg.errore || gr.status) + ').' });

    const quando = s(body.quando, 40);
    const dataStr = quando.slice(0, 10);
    const ord = body.ordine || {};
    const ordTxt = (ord.numero || ord.valore)
      ? ' Ordine' + (ord.numero ? ' #' + ord.numero : '') + (ord.valore ? ' valore € ' + ord.valore : '') + '.'
      : '';

    // 2) upsert con l'identità del record del registro + riferimento Google
    const record = {
      nome: reg.nome,                                       // identità → aggancia il record scelto
      citta: reg.citta || undefined,
      sistema: 'deluxy-suppliers',
      idEsterno,                                            // place_id: il registro salva il riferimento
      asOf: quando || undefined,
      // dati freschi dalla scheda Google (il registro fonde per campo)
      categoria: s(place.categoria, 40).toUpperCase() || undefined,
      provincia: s(place.provincia, 40).toUpperCase() || undefined,
      indirizzo: s(place.indirizzo, 200) || undefined,
      telefono: s(place.telefono, 40) || undefined,
      email: s(place.email, 120) || undefined,
      note: (dataStr ? '[' + dataStr + '] ' : '')
        + 'Riconciliato con la scheda Google «' + s(place.nome, 120) + '» (place_id ' + idEsterno + ') '
        + 'dall\'app search/supplier (' + auth.utente + ').'
        + (place.sito ? ' Sito: ' + s(place.sito, 160) + '.' : '') + ordTxt,
    };
    const cr = await fetch(base + '/api/v1/partners', {
      method: 'POST',
      headers: { 'x-api-key': writeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok) return res.status(502).json({ error: 'Registro: ' + (cj.errore || ('HTTP ' + cr.status)) });

    const outId = cj.id || (cj.partner && cj.partner.id);
    const creato = cj.esito === 'creato' || cr.status === 201;

    // 3) reti di sicurezza
    if (creato && outId) {
      // il registro NON ha agganciato il record scelto: ha creato un doppione → disattivalo subito
      await fetch(base + '/api/v1/partners/' + encodeURIComponent(outId), {
        method: 'DELETE', headers: { 'x-api-key': writeKey },
      }).catch(() => {});
      return res.status(409).json({ error: 'Il registro non ha riconosciuto «' + reg.nome + '» (' + (reg.citta || 'senza città') + ') e ha creato un doppione: l\'ho disattivato. Riconciliazione NON avvenuta — segnala il caso al commerciale.' });
    }
    if (outId && outId !== partnerId) {
      return res.status(409).json({ error: 'Il registro ha agganciato un ALTRO contatto (' + outId + '): probabile omonimia nome+città. Il merge è finito su quel record — verifica nel registro prima di riprovare.' });
    }

    return res.status(200).json({ ok: true, riconciliato: true, partner: cj });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
