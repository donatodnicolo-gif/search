// Contatti dal sito ufficiale del negozio (email + Instagram), lato SERVER.
// Google Places non restituisce l'email: la ricaviamo leggendo il sito del
// negozio. Farlo qui (non nel browser) evita i limiti CORS e non richiede
// alcun proxy configurato — così le email compaiono sempre, best effort.
//
// GET /api/contatti?url=<sito>   header x-app-password | x-app-user | x-api-key | x-app-session
//   -> { ok, emails:[...max 3], instagram:{handle,url}|null }
//
// NB: è un helper di sola lettura; qualunque errore di rete → liste vuote,
// non blocca la ricerca lato client.

import { authUser } from './_auth.js';
import { lookup } from 'node:dns/promises';

// Anti-SSRF: l'URL del sito lo sceglie l'utente, quindi prima di fetchare
// risolviamo l'host e rifiutiamo gli indirizzi interni (loopback, rete privata,
// link-local/metadata cloud). Ricontrollato a ogni redirect (redirect manuale).
function isPrivateIp(ip) {
  const v = String(ip || '');
  if (/^127\./.test(v) || v === '0.0.0.0' || /^10\./.test(v) || /^192\.168\./.test(v)) return true;
  if (/^169\.254\./.test(v)) return true;                                   // link-local / metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;                    // 172.16.0.0/12
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v)) return true;      // CGNAT 100.64/10
  const low = v.toLowerCase();
  if (low === '::1' || low === '::' ) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(low)) return true;                          // ULA fc00::/7
  if (/^fe80:/.test(low)) return true;                                      // link-local IPv6
  if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7));          // IPv4-mapped
  return false;
}
async function hostConsentito(hostname) {
  // un IP letterale privato è rifiutato subito; altrimenti si risolve il DNS
  if (isPrivateIp(hostname)) return false;
  try {
    const ips = await lookup(hostname, { all: true });
    if (!ips.length) return false;
    return ips.every(r => !isPrivateIp(r.address));
  } catch (e) { return false; }
}

const BAD_EMAIL = /\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i;
const JUNK = /(sentry|wixpress|example\.com|@2x|domain\.com|email@|yourname|nome@)/i;
const IG_SKIP = /^(p|reel|reels|explore|stories|accounts|about|developer|legal|directory|tv|web|help|privacy|terms)$/i;

function extractEmails(html) {
  const set = new Set();
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m;
  while ((m = re.exec(html))) {
    const e = m[0].toLowerCase();
    if (!BAD_EMAIL.test(e) && !JUNK.test(e)) set.add(e);
  }
  return [...set].slice(0, 3);
}
function extractInstagram(html) {
  const re = /instagram\.com\/([A-Za-z0-9._]{2,30})/ig;
  let m;
  while ((m = re.exec(html))) {
    const h = m[1].replace(/\.$/, '');
    if (!IG_SKIP.test(h)) return { handle: h, url: 'https://instagram.com/' + h };
  }
  return null;
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    // redirect MANUALE: ogni hop va rivalidato (un sito pubblico può redirigere a un IP interno)
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      let u;
      try { u = new URL(cur); } catch (e) { return ''; }
      if (!/^https?:$/.test(u.protocol)) return '';
      if (!(await hostConsentito(u.hostname))) return '';   // anti-SSRF
      const r = await fetch(cur, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeluxySupplierBot/1.0)' },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (!loc) return '';
        cur = new URL(loc, cur).href;                       // risolve i redirect relativi, poi rivalida al giro dopo
        continue;
      }
      if (!r.ok) return '';
      const ct = r.headers.get('content-type') || '';
      if (ct && !/text|html|xml/i.test(ct)) return '';
      return (await r.text()).slice(0, 500000);   // basta l'inizio: gli indirizzi email stanno nell'header/footer
    }
    return '';   // troppi redirect
  } catch (e) {
    return '';
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-app-password, x-app-user, x-api-key, x-app-session, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const auth = await authUser(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const website = String(req.query.url || '').trim();
    if (!website) return res.status(400).json({ error: 'Manca il parametro url (sito del negozio).' });
    let origin;
    try {
      const u = new URL(website.startsWith('http') ? website : 'https://' + website);
      if (!/^https?:$/.test(u.protocol)) throw new Error('protocollo');
      origin = u.origin;
    } catch (e) {
      return res.status(400).json({ error: 'URL del sito non valido.' });
    }

    // homepage + pagine di contatto tipiche (fino a trovare email E instagram)
    const pages = [website, origin + '/contatti', origin + '/contact', origin + '/contattaci', origin + '/contact-us'];
    let emails = [], instagram = null;
    for (const page of pages) {
      const html = await fetchPage(page);
      if (!html) continue;
      if (!emails.length) emails = extractEmails(html);
      if (!instagram) instagram = extractInstagram(html);
      if (emails.length && instagram) break;
    }
    return res.status(200).json({ ok: true, emails, instagram });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + (err.message || String(err)) });
  }
}
