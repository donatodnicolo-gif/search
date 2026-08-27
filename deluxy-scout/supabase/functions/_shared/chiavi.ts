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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HUB = (Deno.env.get('HUB_KEYS_URL') ?? 'https://deluxy-hub.vercel.app').replace(/\/$/, '');
const PROGETTO = 'deluxy-scout';
const TTL = 5 * 60 * 1000;
const cache = new Map<string, { valore: string; scad: number }>();

/**
 * Da quale riga di `chiavi_app` viene un segreto — cioè quale app di **Profilo
 * → Impostazioni → App collegate** lo custodisce.
 *
 * ⚠️ Senza questa mappa quella schermata era una cassaforte che nessuno apriva:
 * si incollavano le chiavi, comparivano le spunte «collegata», e le Edge
 * Function continuavano a leggere altrove. Segnalato dall'utente il 29/07/2026
 * («mi confermi che ora tutti gli utenti potranno chiamare le funzioni?» — no,
 * non potevano).
 */
const DA_APP: Record<string, string> = {
  ANAGRAFICHE_API_KEY: 'anagrafiche',
  ANAGRAFICHE_WRITE_KEY: 'anagrafiche',
  ANAGRAFICHE_PARTNER_KEY: 'anagrafiche',
  ORDERS_API_KEY: 'orders',
  PARTNER_API_KEY: 'partner',
  PIATTAFORMA_API_KEY: 'piattaforma',
  TASKS_API_KEY: 'tasks',
  CALENDARIO_API_KEY: 'calendario',
  SCRIPTS_API_KEY: 'scripts',
  MARKETING_API_KEY: 'marketing',
  MAIL_API_TOKEN: 'mail',
};

/** La chiave salvata dall'admin nella schermata App collegate, se c'è. */
async function daChiaviApp(nome: string): Promise<string | undefined> {
  const app = DA_APP[nome];
  if (!app) return undefined;
  try {
    // `chiavi_app` ha una RLS riservata all'amministratore: da qui si legge
    // solo col service_role, mai col token dell'utente.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await admin.from('chiavi_app').select('chiave').eq('app', app).maybeSingle();
    const v = (data?.chiave ?? '').trim();
    return v || undefined;
  } catch {
    return undefined; // tabella assente o irraggiungibile: si prosegue
  }
}

/**
 * Ritorna il valore di un segreto. Tre posti, in quest'ordine:
 *   1. la tabella `chiavi_app` — quella che l'admin riempie dall'app;
 *   2. la cassaforte del hub, se `HUB_CHIAVI_TOKEN` è configurato;
 *   3. la variabile d'ambiente locale.
 *
 * L'ordine non è casuale: vince il posto **che si può correggere dall'app**,
 * senza riga di comando. Gli altri due restano perché spegnere quello che già
 * funziona non è una migrazione, è un guasto programmato.
 *
 * Non lancia mai: in caso di problema si ripiega, così le funzioni degradano
 * con grazia invece di rompersi.
 */
export async function chiaveHub(nome: string): Promise<string | undefined> {
  const c = cache.get(nome);
  if (c && c.scad > Date.now()) return c.valore;

  const daApp = await daChiaviApp(nome);
  if (daApp) {
    cache.set(nome, { valore: daApp, scad: Date.now() + TTL });
    return daApp;
  }

  const token = Deno.env.get('HUB_CHIAVI_TOKEN');
  const locale = Deno.env.get(nome);
  if (!token) return locale; // vault non configurato → env

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
