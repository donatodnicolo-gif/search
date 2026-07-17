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
 */
export const SETTING_KEYS = ['googleMapsApiKey', 'googleMapsBrowserKey'] as const;

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
