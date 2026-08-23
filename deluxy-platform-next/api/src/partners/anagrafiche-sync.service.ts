import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.module';

// Sincronizza i partner della piattaforma verso Deluxy Anagrafiche
// (deluxy-anagrafiche, il registro centralizzato B2B). La piattaforma consegne
// e' l'unica app con chiave di scrittura: ogni partner creato o modificato qui
// viene inviato al registro con il proprio id come platformId (upsert lato registro).
//
// La sync e' best-effort e non blocca mai l'operazione sulla piattaforma:
// se il registro e' spento o la chiave manca, si logga e si prosegue.

// Shape del partner restituito dal registro (serializzaPartner lato anagrafiche).
export type AnagraficaPartner = {
  id: string;
  nome: string;
  ragioneSociale?: string | null;
  categoria?: string | null;
  stato?: string | null;
  citta?: string | null;
  provincia?: string | null;
  regione?: string | null;
  indirizzo?: string | null;
  email?: string | null;
  telefono?: string | null;
  pIva?: string | null;
  codiceFiscale?: string | null;
  note?: string | null;
  contatti?: { ruolo?: string | null; nome?: string | null; telefono?: string | null; email?: string | null }[];
  platformId?: string | null;
  attivo?: boolean;
};

type PartnerPiattaforma = {
  id: string;
  insegna: string;
  businessName?: string | null;
  email?: string | null;
  vatNumber?: string | null;
  fiscalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  contactName?: string | null;
  notes?: string | null;
  active: boolean;
  categories?: { category?: { name?: string | null } | null }[];
};

@Injectable()
export class AnagraficheSyncService {
  constructor(private readonly settings: SettingsService) {}

  private readonly logger = new Logger(AnagraficheSyncService.name);

  /** Chiave letta dalla cassaforte Hub, con scadenza (TTL). */
  private chiaveCache: { valore: string; scade: number } | null = null;
  private static readonly TTL_MS = 10 * 60 * 1000;

  /**
   * Indirizzo del registro. L'ordine è: impostazioni dell'app (modificabili da
   * schermo, senza un deploy) → variabile d'ambiente → localhost per lo sviluppo.
   */
  private async getBaseUrl(): Promise<string> {
    const daImpostazioni = await this.settings.get('anagraficheUrl').catch(() => null);
    return daImpostazioni ?? process.env.ANAGRAFICHE_URL ?? 'http://localhost:3060';
  }

  /**
   * Ottiene la chiave di scrittura del registro:
   *  1) se `ANAGRAFICHE_API_KEY` è impostata (override/emergenza), usa quella;
   *  2) altrimenti la chiede alla cassaforte dell'Hub (`GET /api/keys?name=anagrafiche`
   *     con `HUB_KEYS_TOKEN`) e la cachea per {@link TTL_MS}.
   * Ritorna undefined se non configurata / Hub non raggiungibile (best-effort).
   */
  private async getApiKey(): Promise<string | undefined> {
    // 1) variabile d'ambiente: scorciatoia d'emergenza, ha la precedenza.
    const override = process.env.ANAGRAFICHE_API_KEY;
    if (override) return override;

    // 2) impostazioni dell'app: è qui che la chiave si inserisce da schermo
    //    (Configurazione → Impostazioni), senza rifare un deploy.
    const daImpostazioni = await this.settings.get('anagraficheApiKey').catch(() => null);
    if (daImpostazioni) return daImpostazioni;

    if (this.chiaveCache && this.chiaveCache.scade > Date.now()) {
      return this.chiaveCache.valore;
    }

    const hubUrl = process.env.HUB_URL ?? 'https://deluxy-hub.vercel.app';
    const hubToken = process.env.HUB_KEYS_TOKEN;
    if (!hubToken) {
      this.logger.debug('HUB_KEYS_TOKEN non impostato e nessuna ANAGRAFICHE_API_KEY: sync/import saltati');
      return undefined;
    }
    try {
      const res = await fetch(`${hubUrl}/api/keys?name=anagrafiche`, {
        headers: { Authorization: `Bearer ${hubToken}` },
      });
      if (!res.ok) {
        this.logger.warn(`Cassaforte Hub: HTTP ${res.status} leggendo la chiave anagrafiche`);
        return undefined;
      }
      const body = (await res.json()) as { value?: string };
      if (!body.value) return undefined;
      this.chiaveCache = { valore: body.value, scade: Date.now() + AnagraficheSyncService.TTL_MS };
      return body.value;
    } catch (err) {
      this.logger.warn(`Cassaforte Hub non raggiungibile: ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Cerca nel registro il record che corrisponde a un partner della piattaforma.
   *
   * La cascata segue quella che il registro usa per l'upsert, dalla piu' certa
   * alla piu' incerta: `platformId` (gia' collegato) → P.IVA → codice fiscale →
   * email → ragione sociale/insegna. Il livello raggiunto viene restituito,
   * perche' «trovato per P.IVA» e «trovato per nome» non danno la stessa
   * fiducia e chi guarda deve poterlo sapere.
   */
  async cerca(partner: {
    id: string; insegna: string; businessName?: string | null;
    vatNumber?: string | null; fiscalCode?: string | null; email?: string | null;
  }): Promise<{ trovato: AnagraficaPartner | null; criterio: string | null; candidati: AnagraficaPartner[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { trovato: null, criterio: null, candidati: [] };
    const base = (await this.getBaseUrl()).replace(/\/+$/, '');

    const chiedi = async (query: string): Promise<AnagraficaPartner[]> => {
      try {
        const res = await fetch(`${base}/api/v1/partners?${query}&attivo=tutti&perPage=20`, {
          headers: { 'x-api-key': apiKey },
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { dati?: AnagraficaPartner[] };
        return body.dati ?? [];
      } catch { return []; }
    };

    const nomi = [partner.businessName, partner.insegna].filter(Boolean) as string[];
    // Il nome cosi' com'e' scritto qui non basta: in piattaforma «BEYOND 142
    // S.R.L.», nel registro «BEYOND 142 SRL». Si ritenta senza forma societaria
    // ne' punteggiatura — ma DOPO i tentativi esatti, perche' e' piu' incerto.
    const semplificati = [...new Set(nomi.map(semplificaNome).filter((n) => n.length >= 3))]
      .filter((n) => !nomi.some((orig) => orig.trim().toLowerCase() === n));

    const tentativi: [string, string][] = [
      ['platformId', `platformId=${encodeURIComponent(partner.id)}`],
      // Una P.IVA segnaposto (11111111111) e' condivisa da decine di schede:
      // cercarla collegherebbe il partner alla prima che capita.
      ...(pivaAttendibile(partner.vatNumber) ? [['P.IVA', `q=${encodeURIComponent(partner.vatNumber!)}`] as [string, string]] : []),
      ...(partner.fiscalCode ? [['codice fiscale', `q=${encodeURIComponent(partner.fiscalCode)}`] as [string, string]] : []),
      ...(partner.email ? [['email', `q=${encodeURIComponent(partner.email)}`] as [string, string]] : []),
      ...(partner.businessName ? [['ragione sociale', `q=${encodeURIComponent(partner.businessName)}`] as [string, string]] : []),
      ['insegna', `q=${encodeURIComponent(partner.insegna)}`],
      ...semplificati.map((n) => ['nome semplificato', `q=${encodeURIComponent(n)}`] as [string, string]),
    ];

    for (const [criterio, query] of tentativi) {
      const trovati = await chiedi(query);
      if (trovati.length === 1) return { trovato: trovati[0], criterio, candidati: [] };
      // Piu' di un risultato: non si sceglie a caso, si mostrano i candidati.
      if (trovati.length > 1) return { trovato: null, criterio, candidati: trovati };
    }
    return { trovato: null, criterio: null, candidati: [] };
  }

  /**
   * Manda un partner al registro e ATTENDE l'esito (a differenza di
   * `sincronizza`, che e' fire-and-forget). Serve al bottone di collegamento:
   * l'utente deve sapere se ha funzionato.
   */
  async sincronizzaOra(
    partner: PartnerPiattaforma,
    anagraficaId?: string | null,
  ): Promise<{ ok: boolean; stato: number; messaggio: string }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { ok: false, stato: 0, messaggio: 'Chiave del registro non configurata.' };
    const base = (await this.getBaseUrl()).replace(/\/+$/, '');

    // 🔴 Se il confronto ha GIÀ trovato il record, si scrive SU QUELLO (PATCH).
    //
    // Con un POST il registro rifà la sua cascata di identità
    // (platformId → P.IVA → codice fiscale → nome+città) e può non ritrovarlo:
    // il 23/08/2026 è successo davvero su 142 RESTAURANT, perché la P.IVA qui
    // è diversa da quella del registro e la città non viene inviata, quindi
    // l'ultimo passo cercava «nome + città vuota». Risultato: un DOPPIONE, e il
    // collegamento finito sul record sbagliato.
    if (anagraficaId) {
      try {
        const res = await fetch(`${base}/api/v1/partners/${anagraficaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ ...this.corpo(partner), platformId: partner.id }),
        });
        const testo = await res.text();
        if (res.status === 403) {
          return { ok: false, stato: 403, messaggio: 'Il registro rifiuta la scrittura: la chiave configurata è di sola lettura.' };
        }
        if (!res.ok) return { ok: false, stato: res.status, messaggio: `Il registro risponde HTTP ${res.status}: ${testo.slice(0, 200)}` };
        return { ok: true, stato: res.status, messaggio: 'Collegato al record esistente del registro.' };
      } catch (err) {
        return { ok: false, stato: 0, messaggio: `Registro non raggiungibile: ${(err as Error).message}` };
      }
    }

    // Nessun record trovato: si crea, ed è il caso in cui il POST è corretto.
    try {
      const res = await fetch(`${base}/api/v1/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(this.corpo(partner)),
      });
      const testo = await res.text();
      if (res.status === 403) {
        return { ok: false, stato: 403, messaggio: 'Il registro rifiuta la scrittura: la chiave è di sola lettura.' };
      }
      if (!res.ok) return { ok: false, stato: res.status, messaggio: `Il registro risponde HTTP ${res.status}: ${testo.slice(0, 200)}` };
      return { ok: true, stato: res.status, messaggio: res.status === 201 ? 'Creato nel registro.' : 'Aggiornato nel registro.' };
    } catch (err) {
      return { ok: false, stato: 0, messaggio: `Registro non raggiungibile: ${(err as Error).message}` };
    }
  }

  /**
   * Legge dal registro tutti i partner ATTIVI (stato=attivo), paginando.
   * Usato dall'import massivo. Ritorna [] se la chiave manca o il registro
   * non risponde (best-effort, non solleva).
   */
  /** Come fetchAttivi ma SENZA filtro di stato: serve a sapere chi è collegato. */
  async fetchTutti(): Promise<AnagraficaPartner[]> {
    return this.leggiTutte('attivo=tutti');
  }

  async fetchAttivi(): Promise<AnagraficaPartner[]> {
    return this.leggiTutte('stato=attivo');
  }

  /** Scorre tutte le pagine del registro con il filtro dato. */
  private async leggiTutte(filtro: string): Promise<AnagraficaPartner[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Chiave anagrafiche non disponibile (né env né Hub): import saltato');
      return [];
    }
    const perPage = 200;
    const tutti: AnagraficaPartner[] = [];
    for (let page = 1; page <= 100; page++) {
      const url = `${await this.getBaseUrl()}/api/v1/partners?${filtro}&perPage=${perPage}&page=${page}`;
      let body: { dati?: AnagraficaPartner[]; totale?: number } | null = null;
      try {
        const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
        if (!res.ok) {
          this.logger.warn(`Lettura anagrafiche fallita (pagina ${page}): HTTP ${res.status}`);
          break;
        }
        body = await res.json();
      } catch (err) {
        this.logger.warn(`Registro anagrafiche non raggiungibile: ${(err as Error).message}`);
        break;
      }
      const dati = body?.dati ?? [];
      tutti.push(...dati);
      if (dati.length < perPage) break; // ultima pagina
    }
    return tutti;
  }

  // Fire-and-forget: da chiamare senza await dopo create/update/deactivate.
  /**
   * Corpo dell'upsert verso il registro. Sta in un metodo perché lo usano sia
   * la sync silenziosa sia il collegamento con esito: se divergessero, il
   * bottone manderebbe una cosa e il salvataggio automatico un'altra.
   */
  private corpo(partner: PartnerPiattaforma): Record<string, unknown> {
    const categoria = partner.categories?.[0]?.category?.name?.toUpperCase();
    return {
      platformId: partner.id,
      nome: partner.insegna,
      ragioneSociale: partner.businessName ?? null,
      email: partner.email ?? null,
      pIva: partner.vatNumber ?? null,
      codiceFiscale: partner.fiscalCode ?? null,
      indirizzo: partner.address ?? null,
      telefono: partner.phone ?? null,
      note: partner.notes ?? null,
      ...(categoria ? { categoria } : {}),
      stato: partner.active ? 'attivo' : 'dismesso',
      attivo: partner.active,
      fonte: 'platform',
      ...(partner.contactName
        ? { contatti: [{ nome: partner.contactName, telefono: partner.phone ?? null, email: partner.email ?? null }] }
        : {}),
    };
  }

  sincronizza(partner: PartnerPiattaforma): void {
    const body = this.corpo(partner);

    // Risolve la chiave (env o cassaforte Hub) e poi fa l'upsert. Tutto
    // fire-and-forget: un problema di sync non blocca l'operazione partner.
    this.getApiKey()
      .then(async (apiKey) => {
        if (!apiKey) {
          this.logger.debug('Chiave anagrafiche non disponibile: sync saltata');
          return;
        }
        return fetch(`${await this.getBaseUrl()}/api/v1/partners`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(body),
        }).then(async (res) => {
          if (!res.ok) {
            const testo = await res.text().catch(() => '');
            this.logger.warn(
              `Sync anagrafiche fallita per partner ${partner.id}: HTTP ${res.status} ${testo}`,
            );
          } else {
            this.logger.log(`Partner ${partner.insegna} sincronizzato su Anagrafiche`);
          }
        });
      })
      .catch((err) => {
        this.logger.warn(`Registro anagrafiche non raggiungibile: ${err.message}`);
      });
  }
}

/**
 * Una P.IVA fatta di una sola cifra ripetuta (11111111111) non identifica
 * nessuno: e' il segnaposto usato quando il dato vero non c'era. In
 * piattaforma la portano decine di schede, quindi cercarla nel registro
 * collegherebbe il partner alla prima che capita.
 */
export function pivaAttendibile(v?: string | null): boolean {
  const p = (v ?? '').trim();
  return p.length >= 8 && !/^(\d)\1+$/.test(p);
}

/** «BEYOND 142 S.R.L.» -> «beyond 142»: via forma societaria e punteggiatura. */
export function semplificaNome(v: string): string {
  return v
    .toLowerCase()
    .replace(/[.,'`"()]/g, ' ')
    .replace(/\b(s\s*r\s*l|srls|s\s*p\s*a|s\s*a\s*s|s\s*n\s*c|societa|soc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
