import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Chiavi di impostazione riconosciute (Configurazione → Impostazioni, solo admin).
 * I valori vivono SOLO nel database (mai in file o commit — regola 3).
 *
 * - googleMapsApiKey: chiave SEGRETA usata SOLO lato server (geocodifica). Mai esposta al client.
 * - googleMapsBrowserKey: chiave per la mappa JS nel BROWSER (per natura pubblica);
 *   va ristretta per referrer HTTP e limitata alla Maps JavaScript API. Esposta al frontend.
 * - anagraficheUrl / anagraficheApiKey: registro centralizzato dei partner.
 *   Stanno qui e non nelle variabili d'ambiente perché così si cambiano
 *   dall'app, senza un deploy. Le env restano come scorciatoia d'emergenza e
 *   hanno la precedenza (vedi AnagraficheSyncService.getApiKey).
 * - merchandisingUrl / merchandisingApiKey: il PLM (deluxy-merchandising).
 * - mailUrl / mailApiKey / mailUtente: AI Mail, da cui parte il recap al
 *   partner. La piattaforma non ha credenziali SMTP proprie.
 *   Serve nelle DUE direzioni: si tirano i prodotti nati la', e si mandano la'
 *   quelli che un partner carica qui.
 * - ordersUrl / ordersApiKey: registro ordini Shopify (deluxy-orders, porta 3150).
 *   Serve a tirare dentro gli ordini e smistarli. È una chiave di SOLA LETTURA:
 *   la piattaforma legge da Orders, non ci scrive mai.
 */
export const SETTING_KEYS = [
  'googleMapsApiKey',
  'googleMapsBrowserKey',
  'anagraficheUrl',
  'anagraficheApiKey',
  'ordersUrl',
  'ordersApiKey',
  'merchandisingUrl',
  'merchandisingApiKey',
  // AI Mail: il canale SMTP appartiene a quell'app (Standard §5.3), qui si
  // tiene solo come raggiungerla. `mailUtente` e' la casella da cui parte.
  'mailUrl',
  'mailApiKey',
  'mailUtente',
] as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const key of SETTING_KEYS) map[key] = '';
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  /** Upsert di tutte le chiavi presenti nel body (solo chiavi riconosciute). */
  async save(values: Record<string, string>) {
    for (const key of SETTING_KEYS) {
      const value = values[key];
      if (value === undefined) continue;
      await this.prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value).trim() },
        create: { key, value: String(value).trim() },
      });
    }
    return this.findAll();
  }

  async get(key: (typeof SETTING_KEYS)[number]): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value?.trim() || null;
  }

  /**
   * Prova la connessione a Deluxy Orders.
   *
   * Gemella di `provaAnagrafiche()`: l'esito distingue «chiave assente» da
   * «chiave rifiutata» da «non raggiungibile», perché sono tre problemi diversi
   * e un unico «non funziona» li confonderebbe.
   *
   * ⚠️ Orders risponde in ITALIANO come il registro: il conteggio sta in
   * `totale`. Leggere un nome inglese darebbe «0 ordini» a fronte di 14.385 —
   * uno zero che sembra un problema di dati ed è un errore di lettura.
   */
  async provaOrders(): Promise<{
    esito: 'ok' | 'senza-chiave' | 'chiave-rifiutata' | 'irraggiungibile';
    url: string;
    messaggio: string;
    ordiniTrovati?: number;
  }> {
    const url = (await this.get('ordersUrl')) ?? process.env.ORDERS_URL ?? '';
    const chiave = (await this.get('ordersApiKey')) ?? process.env.ORDERS_API_KEY ?? '';
    if (!url) return { esito: 'irraggiungibile', url, messaggio: 'Indirizzo di Orders non impostato.' };
    if (!chiave) return { esito: 'senza-chiave', url, messaggio: 'Chiave non impostata.' };
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/ordini?limit=1`, {
        headers: { 'x-api-key': chiave },
      });
      if (res.status === 401 || res.status === 403) {
        return { esito: 'chiave-rifiutata', url, messaggio: `Orders rifiuta la chiave (HTTP ${res.status}).` };
      }
      if (!res.ok) {
        return { esito: 'irraggiungibile', url, messaggio: `Orders risponde HTTP ${res.status}.` };
      }
      const body = (await res.json()) as { totale?: number; ordini?: unknown[]; dati?: unknown[] };
      const quanti = body.totale ?? body.ordini?.length ?? body.dati?.length ?? 0;
      return { esito: 'ok', url, messaggio: `Collegato: Orders ha ${quanti} ordini.`, ordiniTrovati: quanti };
    } catch (err) {
      return { esito: 'irraggiungibile', url, messaggio: `Orders non raggiungibile: ${(err as Error).message}` };
    }
  }

  /**
   * Prova la connessione al registro Anagrafiche e riporta che cosa è andato
   * storto, invece di un generico "non funziona".
   *
   * ⚠️ Non basta un 200: una chiave di SOLA LETTURA supera questa prova ma poi
   * non permette di collegare i partner (serve `scritturaPartner`). Lo si dice
   * esplicitamente, perché è già stato un problema: su 943 anagrafiche una sola
   * ha il `platformId`, proprio per una chiave senza quel permesso.
   */
  async provaAnagrafiche(): Promise<{
    esito: 'ok' | 'senza-chiave' | 'chiave-rifiutata' | 'irraggiungibile';
    url: string;
    messaggio: string;
    partnerTrovati?: number;
  }> {
    const url = (await this.get('anagraficheUrl')) ?? process.env.ANAGRAFICHE_URL ?? '';
    const chiave = (await this.get('anagraficheApiKey')) ?? process.env.ANAGRAFICHE_API_KEY ?? '';
    if (!url) return { esito: 'irraggiungibile', url, messaggio: 'Indirizzo del registro non impostato.' };
    if (!chiave) return { esito: 'senza-chiave', url, messaggio: 'Chiave non impostata.' };
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/partners?stato=attivo&pageSize=1`, {
        headers: { 'x-api-key': chiave },
      });
      if (res.status === 401 || res.status === 403) {
        return { esito: 'chiave-rifiutata', url, messaggio: `Il registro rifiuta la chiave (HTTP ${res.status}).` };
      }
      if (!res.ok) {
        return { esito: 'irraggiungibile', url, messaggio: `Il registro risponde HTTP ${res.status}.` };
      }
      // ⚠️ Il registro risponde in ITALIANO: `totale` e `dati`, non `total` e
      // `items`. Leggendo i nomi inglesi la prova diceva «0 partner attivi»
      // mentre il registro ne ha 51: uno zero che sembrava un problema di dati
      // ed era un errore di lettura.
      const body = (await res.json()) as { totale?: number; dati?: unknown[] };
      const n = body.totale ?? body.dati?.length ?? 0;
      return {
        esito: 'ok', url, partnerTrovati: n,
        messaggio: `Collegato: il registro riporta ${n} partner attivi. `
          // ⚠️ Verificato leggendo il codice del registro: il permesso che conta
          // è `scrittura`. La colonna `scritturaPartner` esiste nel database ma
          // NON è letta da nessuna parte, quindi non va indicata come requisito.
          + 'Con una chiave di sola lettura si vedono le differenze ma non si può collegare.',
      };
    } catch (err) {
      return { esito: 'irraggiungibile', url, messaggio: `Registro non raggiungibile: ${(err as Error).message}` };
    }
  }

  /**
   * Geocodifica un indirizzo con Google Geocoding API (chiave SEGRETA lato server)
   * e restituisce provincia (administrative_area_level_2) + coordinate lat/lng.
   * Senza chiave o in caso di errore i valori sono null: il client ripiega sul
   * riconoscimento testuale della provincia e la mappa ignora il punto.
   */
  async geocode(address: string): Promise<{
    provinceCode: string | null;
    formattedAddress: string | null;
    lat: number | null;
    lng: number | null;
    source: string;
    status?: string;
  }> {
    const key = await this.get('googleMapsApiKey');
    if (!key) return { provinceCode: null, formattedAddress: null, lat: null, lng: null, source: 'none' };
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(address) +
      '&region=it&language=it&key=' +
      encodeURIComponent(key);
    try {
      const res = await fetch(url);
      const data = (await res.json()) as {
        status?: string;
        results?: {
          formatted_address?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
          address_components?: { short_name?: string; types?: string[] }[];
        }[];
      };
      const first = data.results?.[0];
      if (data.status !== 'OK' || !first) {
        return { provinceCode: null, formattedAddress: null, lat: null, lng: null, source: 'google', status: data.status ?? 'ERROR' };
      }
      const province = first.address_components?.find((c) =>
        (c.types ?? []).includes('administrative_area_level_2'),
      );
      return {
        provinceCode: province?.short_name ?? null,
        formattedAddress: first.formatted_address ?? null,
        lat: first.geometry?.location?.lat ?? null,
        lng: first.geometry?.location?.lng ?? null,
        source: 'google',
        status: 'OK',
      };
    } catch {
      return { provinceCode: null, formattedAddress: null, lat: null, lng: null, source: 'google', status: 'UNREACHABLE' };
    }
  }

  /** Solo le coordinate (per salvarle sulla consegna). null se non geocodificabile. */
  async geocodeCoords(address: string): Promise<{ lat: number; lng: number } | null> {
    const r = await this.geocode(address);
    return r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Impostazioni applicative (solo admin)' })
  findAll() {
    return this.service.findAll();
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Salva le impostazioni (upsert, solo admin)' })
  save(@Body() body: Record<string, string>) {
    return this.service.save(body ?? {});
  }

  @Get('geocode')
  @ApiOperation({
    summary: 'Provincia + coordinate di un indirizzo via Google Geocoding (chiave dalle impostazioni)',
  })
  geocode(@Query('address') address?: string) {
    if (!address?.trim()) return { provinceCode: null, formattedAddress: null, lat: null, lng: null, source: 'none' };
    return this.service.geocode(address.trim());
  }

  /**
   * Prova la connessione al registro Anagrafiche con quanto è configurato,
   * e dice PERCHÉ non funziona invece di limitarsi a fallire.
   */
  @Get('anagrafiche/prova')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verifica indirizzo e chiave del registro Anagrafiche (solo admin)' })
  provaAnagrafiche() {
    return this.service.provaAnagrafiche();
  }

  @Get('orders/prova')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verifica indirizzo e chiave di Deluxy Orders (solo admin)' })
  provaOrders() {
    return this.service.provaOrders();
  }

  @Get('public')
  @ApiOperation({ summary: 'Impostazioni pubbliche per il client (solo la chiave browser Maps)' })
  async publicSettings() {
    // La chiave browser è per natura pubblica (referrer-restricted): esposta a
    // qualsiasi utente autenticato per caricare la mappa JS.
    return { googleMapsBrowserKey: await this.service.get('googleMapsBrowserKey') };
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
