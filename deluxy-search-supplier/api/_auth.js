// Autenticazione condivisa delle funzioni API (il prefisso _ = non è un endpoint).
// Due modi per entrare:
//  - pass code principale (env APP_PASSWORD) → amministratore ("admin" o il nome passato)
//  - utenza creata in ⚙️ Impostazioni (config KV, campo utenti: [{nome, pass}])
// Il browser manda gli header x-app-password e x-app-user.

const CONFIG_KEY = 'config:v1';

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
      && String(x.nome).toLowerCase() === nome.toLowerCase() && x.pass === pass);
    if (u) return { utente: u.nome, admin: false, cfg };
  }
  return { error: 'Utente o pass code errati.', status: 401 };
}
