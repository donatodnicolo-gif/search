// Autenticazione condivisa delle funzioni API (il prefisso _ = non è un endpoint).
// Due modi per entrare:
//  - pass code principale (env APP_PASSWORD) → amministratore ("admin" o il nome passato)
//  - utenza creata in ⚙️ Impostazioni (config KV, campo utenti: [{nome, salt, passHash}])
// Il browser manda gli header x-app-password e x-app-user.
//
// Le password delle utenze NON sono salvate in chiaro: nella cassaforte c'è solo
// { salt, passHash } (scrypt). Le utenze vecchie col campo `pass` in chiaro vengono
// migrate da sole: al primo login riuscito la voce viene riscritta hashata.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const CONFIG_KEY = 'config:v1';

export function newSalt() { return randomBytes(16).toString('hex'); }
export function hashPass(pass, salt) {
  return scryptSync(String(pass), String(salt), 32).toString('hex');
}
function safeEq(aHex, bHex) {
  try {
    const a = Buffer.from(String(aHex), 'hex'), b = Buffer.from(String(bHex), 'hex');
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  } catch (e) { return false; }
}
// confronto password → true/false (hash se presente, altrimenti legacy in chiaro)
export function checkPass(u, pass) {
  if (u.passHash && u.salt) return safeEq(hashPass(pass, u.salt), u.passHash);
  if (u.pass) return u.pass === pass;   // voce legacy non ancora migrata
  return false;
}

export async function kvCmd(cmd) {
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

export async function readConfig() {
  const raw = await kvCmd(['GET', CONFIG_KEY]);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

// -> { utente, admin, cfg } oppure { error, status }
export async function authUser(req) {
  if (!process.env.APP_PASSWORD) return { error: 'Backend non configurato: manca APP_PASSWORD.', status: 500 };
  const pass = String(req.headers['x-app-password'] || '');
  const nome = String(req.headers['x-app-user'] || '').trim();
  if (pass && pass === process.env.APP_PASSWORD) {
    return { utente: nome || 'admin', admin: true, cfg: null };
  }
  if (pass && nome) {
    const cfg = await readConfig();
    const u = (cfg.utenti || []).find(x => x && x.nome
      && String(x.nome).toLowerCase() === nome.toLowerCase() && checkPass(x, pass));
    if (u) {
      // migrazione pigra: se la voce è ancora in chiaro, riscrivila hashata
      if (u.pass && !u.passHash) {
        try {
          u.salt = newSalt();
          u.passHash = hashPass(pass, u.salt);
          delete u.pass;
          await kvCmd(['SET', CONFIG_KEY, JSON.stringify(cfg)]);
        } catch (e) { /* se la migrazione fallisce, il login resta valido */ }
      }
      return { utente: u.nome, admin: false, cfg };
    }
  }
  return { error: 'Utente o pass code errati.', status: 401 };
}
