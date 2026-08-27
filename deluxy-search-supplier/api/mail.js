// Invio richiesta ordine via EMAIL passando da AI Mail (deluxy-mail).
// La mail parte dalla casella vera dell'operatore e la copia finisce negli
// «Inviati» del server (standard Deluxy §5.3): meglio che un mailto: che apre
// il client locale. La chiave di AI Mail (MAIL_API_KEY) resta sul SERVER, in
// cassaforte (config:v1.mailApiKey), esattamente come i token Shopify e la
// chiave di scrittura del registro — non arriva mai al browser.
//
// POST /api/mail   header x-app-password (+ x-app-user) | x-api-key | x-app-session
//   body { a, cc?, oggetto, corpo, corpoHtml?,
//          allegati?: [{ nome, contenuto (base64 SENZA prefisso data:), tipo }] }
//   -> { ok: true }                 mail partita
//   -> { ok: false, errore }        con spiegazione onesta (400/502)
//
// L'allegato (la foto del bouquet) arriva già in base64 dal browser, che ha
// scaricato l'immagine per gli appunti WhatsApp: così il server non deve
// scaricare un URL arbitrario (niente SSRF) e la foto viaggia come vero file.

import { authUser, readConfig } from './_auth.js';

const MAIL_URL_DEFAULT = 'https://deluxy-mail.vercel.app';
const MAX_ALLEGATI_BYTE = 8 * 1024 * 1024;   // AI Mail accetta fino a 8 MB in tutto
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function s(v, max) { return v == null ? '' : String(v).slice(0, max || 200); }

// stima dei byte reali da una stringa base64 (3 byte ogni 4 caratteri)
function base64Byte(b64) {
  const n = String(b64 || '').replace(/=+$/, '').length;
  return Math.floor(n * 3 / 4);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, x-app-session, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ ok: false, errore: auth.error });

    const cfg = await readConfig();
    const key = (cfg.mailApiKey || '').trim();
    const utente = (cfg.mailUtente || '').trim();
    const base = (cfg.mailUrl || MAIL_URL_DEFAULT).replace(/\/$/, '');
    if (!key || !utente) {
      return res.status(400).json({
        ok: false,
        errore: 'Invio email non configurato: imposta la casella e la chiave di AI Mail in ⚙️ Impostazioni. '
          + 'Il token si genera da AI Mail → Impostazioni App → «Token API di AI Mail».',
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const a = s(body.a, 160).trim();
    const cc = s(body.cc, 320).trim();
    const oggetto = s(body.oggetto, 300).trim();
    const corpo = s(body.corpo, 20000);
    const corpoHtml = body.corpoHtml ? s(body.corpoHtml, 40000) : undefined;
    if (!EMAIL_RE.test(a)) return res.status(400).json({ ok: false, errore: 'Indirizzo email del destinatario mancante o non valido.' });
    if (!oggetto) return res.status(400).json({ ok: false, errore: "Manca l'oggetto della mail." });
    if (!corpo.trim()) return res.status(400).json({ ok: false, errore: 'Il corpo della mail è vuoto.' });

    // allegati: validazione minima + tetto complessivo di 8 MB (come AI Mail)
    let allegati;
    if (Array.isArray(body.allegati) && body.allegati.length) {
      let totale = 0;
      allegati = [];
      for (const al of body.allegati.slice(0, 5)) {
        const contenuto = String((al && al.contenuto) || '').replace(/^data:[^;]*;base64,/, '').trim();
        if (!contenuto) continue;
        if (!/^[A-Za-z0-9+/=\s]+$/.test(contenuto)) {
          return res.status(400).json({ ok: false, errore: 'Allegato non valido (atteso base64).' });
        }
        totale += base64Byte(contenuto);
        if (totale > MAX_ALLEGATI_BYTE) {
          return res.status(400).json({ ok: false, errore: 'Allegati troppo pesanti (massimo 8 MB in tutto).' });
        }
        allegati.push({ nome: s((al && al.nome) || 'allegato', 120), contenuto, tipo: s((al && al.tipo) || 'application/octet-stream', 80) });
      }
      if (!allegati.length) allegati = undefined;
    }

    const r = await fetch(base + '/api/v1/invia', {
      method: 'POST',
      headers: { 'x-api-key': key, 'x-utente': utente, 'Content-Type': 'application/json' },
      body: JSON.stringify({ a, cc: cc || undefined, oggetto, corpo, corpoHtml, allegati }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,   // l'SMTP vero può metterci qualche secondo
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) {
      return res.status(502).json({ ok: false, errore: (j && (j.errore || j.messaggio)) || ('AI Mail risponde ' + r.status + '.') });
    }
    return res.status(200).json({ ok: true, via: 'ai-mail' });
  } catch (err) {
    return res.status(500).json({ ok: false, errore: 'Errore server: ' + (err.message || String(err)) });
  }
}
