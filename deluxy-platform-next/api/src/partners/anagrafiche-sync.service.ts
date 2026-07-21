import { Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger(AnagraficheSyncService.name);

  /** Chiave letta dalla cassaforte Hub, con scadenza (TTL). */
  private chiaveCache: { valore: string; scade: number } | null = null;
  private static readonly TTL_MS = 10 * 60 * 1000;

  private get baseUrl(): string {
    return process.env.ANAGRAFICHE_URL ?? 'http://localhost:3060';
  }

  /**
   * Ottiene la chiave di scrittura del registro:
   *  1) se `ANAGRAFICHE_API_KEY` è impostata (override/emergenza), usa quella;
   *  2) altrimenti la chiede alla cassaforte dell'Hub (`GET /api/keys?name=anagrafiche`
   *     con `HUB_KEYS_TOKEN`) e la cachea per {@link TTL_MS}.
   * Ritorna undefined se non configurata / Hub non raggiungibile (best-effort).
   */
  private async getApiKey(): Promise<string | undefined> {
    const override = process.env.ANAGRAFICHE_API_KEY;
    if (override) return override;

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
   * Legge dal registro tutti i partner ATTIVI (stato=attivo), paginando.
   * Usato dall'import massivo. Ritorna [] se la chiave manca o il registro
   * non risponde (best-effort, non solleva).
   */
  async fetchAttivi(): Promise<AnagraficaPartner[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Chiave anagrafiche non disponibile (né env né Hub): import saltato');
      return [];
    }
    const perPage = 200;
    const tutti: AnagraficaPartner[] = [];
    for (let page = 1; page <= 100; page++) {
      const url = `${this.baseUrl}/api/v1/partners?stato=attivo&perPage=${perPage}&page=${page}`;
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
  sincronizza(partner: PartnerPiattaforma): void {
    const categoria = partner.categories?.[0]?.category?.name?.toUpperCase();

    const body = {
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

    // Risolve la chiave (env o cassaforte Hub) e poi fa l'upsert. Tutto
    // fire-and-forget: un problema di sync non blocca l'operazione partner.
    this.getApiKey()
      .then((apiKey) => {
        if (!apiKey) {
          this.logger.debug('Chiave anagrafiche non disponibile: sync saltata');
          return;
        }
        return fetch(`${this.baseUrl}/api/v1/partners`, {
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
