// Cassaforte centrale: i segreti "di business" vengono presi da deluxy-hub
// (endpoint /api/chiavi) invece di essere duplicati come secret in ogni app.
//
// Un solo secret bootstrap serve a Scout: HUB_CHIAVI_TOKEN — un token di servizio
// PER-PROGETTO generato dalla pagina /chiavi del hub (sezione "Token di servizio",
// con scope sul progetto deluxy-scout). Tutto il resto (chiavi Anagrafiche,
// OpenAI, Partner, HubSpot…) vive nel hub.
//
// Precedenza: se HUB_CHIAVI_TOKEN è impostato, vince il valore dal hub (fonte di
// verità), con fallback a Deno.env; se non è impostato, si usa Deno.env (fase di
// transizione / sviluppo locale). Cache in memoria (i valori ruotano di rado).
const HUB = (Deno.env.get('HUB_KEYS_URL') ?? 'https://deluxy-hub.vercel.app').replace(/\/$/, '');
const PROGETTO = 'deluxy-scout';
const TTL = 5 * 60 * 1000;
const cache = new Map<string, { valore: string; scad: number }>();

/**
 * Ritorna il valore di un segreto: dal hub se il vault è configurato, altrimenti
 * dalla variabile d'ambiente locale. Non lancia mai: in caso di problema ripiega
 * sull'env, così le funzioni degradano con grazia.
 */
export async function chiaveHub(nome: string): Promise<string | undefined> {
  const token = Deno.env.get('HUB_CHIAVI_TOKEN');
  const locale = Deno.env.get(nome);
  if (!token) return locale; // vault non configurato → env

  const c = cache.get(nome);
  if (c && c.scad > Date.now()) return c.valore || locale;

  try {
    const res = await fetch(`${HUB}/api/chiavi?progetto=${PROGETTO}&nome=${encodeURIComponent(nome)}`, {
      headers: { 'x-api-key': token },
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      const v = body?.chiavi?.[nome];
      if (typeof v === 'string' && v) {
        cache.set(nome, { valore: v, scad: Date.now() + TTL });
        return v;
      }
    }
  } catch {
    /* rete/hub non raggiungibile → fallback env */
  }
  return locale;
}
