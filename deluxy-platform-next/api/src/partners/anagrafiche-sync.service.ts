import { Injectable, Logger } from '@nestjs/common';

// Sincronizza i partner della piattaforma verso Deluxy Anagrafiche
// (deluxy-anagrafiche, il registro centralizzato B2B). La piattaforma consegne
// e' l'unica app con chiave di scrittura: ogni partner creato o modificato qui
// viene inviato al registro con il proprio id come platformId (upsert lato registro).
//
// La sync e' best-effort e non blocca mai l'operazione sulla piattaforma:
// se il registro e' spento o la chiave manca, si logga e si prosegue.

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

  private get baseUrl(): string {
    return process.env.ANAGRAFICHE_URL ?? 'http://localhost:3060';
  }

  private get apiKey(): string | undefined {
    return process.env.ANAGRAFICHE_API_KEY;
  }

  // Fire-and-forget: da chiamare senza await dopo create/update/deactivate.
  sincronizza(partner: PartnerPiattaforma): void {
    if (!this.apiKey) {
      this.logger.debug('ANAGRAFICHE_API_KEY non impostata: sync anagrafiche saltata');
      return;
    }

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

    fetch(`${this.baseUrl}/api/v1/partners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const testo = await res.text().catch(() => '');
          this.logger.warn(
            `Sync anagrafiche fallita per partner ${partner.id}: HTTP ${res.status} ${testo}`,
          );
        } else {
          this.logger.log(`Partner ${partner.insegna} sincronizzato su Anagrafiche`);
        }
      })
      .catch((err) => {
        this.logger.warn(`Registro anagrafiche non raggiungibile: ${err.message}`);
      });
  }
}
