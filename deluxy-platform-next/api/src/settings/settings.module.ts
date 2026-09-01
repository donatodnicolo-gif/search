import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Autenticato, Roles } from '../common/decorators';
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
  // Chiave Anthropic (SEGRETA, solo lato server): abilita il caricamento
  // delle consegne via AI — si incolla un testo libero (mail, WhatsApp) e
  // l'estrazione compila il form.
  'aiApiKey',
  // Numero WhatsApp di Deluxy per i PARTNER (domande, richieste, preventivi):
  // formato internazionale senza + né spazi (es. 393331234567). E' un numero
  // pubblico per natura: esposto in /settings/public a chi e' autenticato.
  'whatsappNumero',
  // LINEE COMMERCIALI: Scout ne e' il MASTER (edge function `linee`).
  // La vetrina dei servizi richiedibili dal partner si legge da li', mai
  // ricopiata (Standard §7: cache TTL breve si', tabelle-copia no).
  'lineeUrl',
  'lineeApiKey',
  // Deluxy Transactions (28/08/2026): il collettore unico dei pagamenti.
  // Chiave e segreto HMAC con cui la piattaforma CHIEDE i pagamenti dei valet
  // e verifica gli esiti che tornano sul webhook. Le env hanno la precedenza.
  'transactionsUrl',
  'transactionsApiKey',
  'transactionsHmacSecret',
  // DELUXY HUB — casella di posta prestata (POST /api/posta), 31/08/2026.
  // Le notifiche via email (nuovo servizio al partner, assegnazione al valet)
  // partono dalla casella del portale: le credenziali SMTP hanno UNA casa sola,
  // la cassaforte del Hub (Standard §7). Qui serve solo l'indirizzo del Hub e
  // un token di servizio del Hub con lo scope «posta» (SEGRETO). Le env
  // (HUB_URL / HUB_POSTA_TOKEN, con ripiego su HUB_KEYS_TOKEN) hanno la
  // precedenza; se il token è vuoto, non parte nessuna mail (fail-closed).
  'hubUrl',
  'hubPostaToken',
  // FINANCE (deluxy-partner), 31/08/2026: «Genera fattura» consegna le righe a
  // FINANCE come BOZZA pro-forma (POST /api/proforma), che compare in /fatture e
  // una persona emette su FattureInCloud (Standard §7: l'emissione ha casa lì).
  // Serve l'indirizzo di FINANCE e una chiave con scope «scrittura» (SEGRETO).
  // Le env (FINANCE_API_URL / FINANCE_API_KEY) hanno la precedenza; senza chiave
  // la bozza non parte e «Genera» lo dice (fail-closed, ritentabile).
  'financeUrl',
  'financeApiKey',
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
   * Manda un'email dalla CASELLA DEL HUB (POST /api/posta): le credenziali SMTP
   * hanno una casa sola, la cassaforte del portale (Standard §7). Qui serve solo
   * l'indirizzo del Hub e un token di servizio con lo scope «posta».
   * Configurabile da /settings (hubUrl, hubPostaToken) o via env (HUB_URL /
   * HUB_POSTA_TOKEN, con ripiego su HUB_KEYS_TOKEN). Ritorna un esito parlante
   * (non lancia): lo usano sia le notifiche best-effort sia la prova manuale.
   */
  async inviaViaHub(a: string, oggetto: string, testo: string): Promise<{ ok: boolean; motivo: string; mittente?: string }> {
    const url = ((await this.get('hubUrl')) || process.env.HUB_URL || 'https://deluxy-hub.vercel.app').replace(/\/+$/, '');
    const token = (await this.get('hubPostaToken')) || process.env.HUB_POSTA_TOKEN || process.env.HUB_KEYS_TOKEN || '';
    if (!token) return { ok: false, motivo: 'Hub non configurato: manca il token di posta (hubPostaToken).' };
    try {
      const res = await fetch(`${url}/api/posta`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, oggetto, testo }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mittente?: string };
      if (!res.ok || body.ok === false) {
        return { ok: false, motivo: body.error ?? `Hub /api/posta risponde HTTP ${res.status}` };
      }
      return { ok: true, motivo: 'inviata', mittente: body.mittente };
    } catch (err) {
      return { ok: false, motivo: `Hub non raggiungibile: ${(err as Error).message}` };
    }
  }

  /**
   * Manda un'email da AI Mail (`POST /api/v1/invia`) — LA STESSA VIA DEL RECAP
   * ai partner, che è già configurata e funziona (regola utente 31/08: «la mail
   * di recap esiste già, usa quella per le notifiche»). Config `mailUrl` +
   * `mailApiKey` + `mailUtente` (env in precedenza). Ritorna un esito parlante
   * (non lancia): lo usano le notifiche best-effort. `corpo` accetta HTML: le
   * righe di testo si convertono in `<br>` così vanno a capo come nel recap.
   */
  async inviaViaAiMail(a: string, oggetto: string, testo: string): Promise<{ ok: boolean; motivo: string }> {
    const url = ((await this.get('mailUrl')) || process.env.MAIL_URL || 'https://deluxy-mail.vercel.app').replace(/\/+$/, '');
    const chiave = (await this.get('mailApiKey')) || process.env.MAIL_API_KEY || '';
    const utente = (await this.get('mailUtente')) || process.env.MAIL_UTENTE || '';
    if (!chiave || !utente) {
      const manca = [!chiave && 'chiave', !utente && 'casella'].filter(Boolean).join(' e ');
      return { ok: false, motivo: `AI Mail non configurato: manca la ${manca} (mailApiKey/mailUtente).` };
    }
    const corpo = testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    try {
      const res = await fetch(`${url}/api/v1/invia`, {
        method: 'POST',
        headers: { 'x-api-key': chiave, 'x-utente': utente, 'Content-Type': 'application/json' },
        body: JSON.stringify({ a, oggetto, corpo }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errore?: string };
      if (!res.ok || body.ok === false) {
        return { ok: false, motivo: body.error ?? body.errore ?? `AI Mail risponde HTTP ${res.status}` };
      }
      return { ok: true, motivo: 'inviata' };
    } catch (err) {
      return { ok: false, motivo: `AI Mail non raggiungibile: ${(err as Error).message}` };
    }
  }

  /**
   * Prova end-to-end della posta: manda un messaggio di test all'indirizzo
   * indicato (di norma quello dell'admin che sta configurando). Dice PERCHÉ non
   * funziona invece di un generico "non parte".
   */
  async provaPosta(a: string): Promise<{ ok: boolean; messaggio: string }> {
    const dest = (a ?? '').trim();
    if (!dest) return { ok: false, messaggio: 'Indica un indirizzo email di prova.' };
    const corpo = ['Questa è una mail di prova dalla piattaforma consegne Deluxy.', '',
      'Se la leggi, le notifiche via email (nuovo servizio ai partner, assegnazione ai valet) funzionano.',
      '', 'Deluxy'].join('\n');
    // ⭐ 31/08: le notifiche vere partono da AI Mail (la via del recap). La prova
    // testa la STESSA via — AI Mail prima, casella Hub come ripiego — così il
    // pulsante dice davvero se le notifiche funzionano, non se funziona il Hub.
    const viaMail = await this.inviaViaAiMail(dest, 'Prova notifiche · piattaforma consegne Deluxy', corpo);
    if (viaMail.ok) {
      return { ok: true, messaggio: `Inviata a ${dest} via AI Mail. Controlla la casella.` };
    }
    const viaHub = await this.inviaViaHub(dest, 'Prova posta · piattaforma consegne Deluxy', corpo);
    return {
      ok: viaHub.ok,
      messaggio: viaHub.ok
        ? `Inviata a ${dest}${viaHub.mittente ? ` da ${viaHub.mittente}` : ''} via Hub (ripiego). Controlla la casella.`
        : `Non inviata. AI Mail: ${viaMail.motivo} · Hub: ${viaHub.motivo}`,
    };
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
  /**
   * DISTANZA STRADALE fra due indirizzi (Google Directions), in km con un
   * decimale. È la distanza che prezza gli extra km (regola utente 31/08:
   * stradale, non in linea d'aria). `null` = non calcolabile (chiave assente,
   * indirizzo non risolto, percorso non trovato): chi chiama NON inventa.
   */
  async distanzaStradaleKm(origine: string, destinazione: string): Promise<number | null> {
    const key = await this.get('googleMapsApiKey');
    if (!key || !origine?.trim() || !destinazione?.trim()) return null;
    const url =
      'https://maps.googleapis.com/maps/api/directions/json?origin=' +
      encodeURIComponent(origine.trim()) +
      '&destination=' +
      encodeURIComponent(destinazione.trim()) +
      '&region=it&language=it&key=' +
      encodeURIComponent(key);
    try {
      const res = await fetch(url);
      const data = (await res.json()) as {
        status?: string;
        routes?: { legs?: { distance?: { value?: number } }[] }[];
      };
      const metri = data.routes?.[0]?.legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0;
      if (data.status !== 'OK' || metri <= 0) return null;
      return Math.round(metri / 100) / 10; // km, un decimale
    } catch {
      return null;
    }
  }

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
  // ⚠️ 27/08: senza `@Roles` qualunque utente autenticato — anche un valet o un
  // CUSTOMER — faceva chiamate illimitate a Google Geocoding con la nostra
  // chiave SEGRETA, a nostre spese. Misurato: 200 con un token di valet.
  @Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
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

  @Post('posta/prova')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Manda una mail di prova dalla casella del Hub (solo admin)' })
  provaPosta(@Body() body: { a?: string }) {
    return this.service.provaPosta(body?.a ?? '');
  }

  @Autenticato()
  @Get('public')
  @ApiOperation({ summary: 'Impostazioni pubbliche per il client (solo la chiave browser Maps)' })
  async publicSettings() {
    // La chiave browser è per natura pubblica (referrer-restricted): esposta a
    // qualsiasi utente autenticato per caricare la mappa JS. Il numero
    // WhatsApp serve al bottone «Scrivici» dei partner.
    return {
      googleMapsBrowserKey: await this.service.get('googleMapsBrowserKey'),
      whatsappNumero: await this.service.get('whatsappNumero'),
      // ⚠️ Il BOOLEANO, mai la chiave: serve solo a non mostrare un bottone
      // «compila con l'AI» che fallirebbe sempre. Un comando che non può
      // funzionare è peggio di un comando assente.
      aiAttiva: Boolean((await this.service.get('aiApiKey'))?.trim()),
    };
  }
}

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
