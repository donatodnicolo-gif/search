import {
  Controller,
  Get,
  Header,
  HttpCode,
  Injectable,
  Options,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * «La città è coperta?» — la domanda che i siti Shopify fanno prima di
 * mettere un prodotto nel carrello.
 *
 * ⚠️ 03/09/2026 — Il tema di deluxy.it, per i prodotti NON unici (rose,
 * bouquet, champagne, set…), chiama da sempre
 * `GET https://app.deluxy.it/api/province-cities/{PROV}/{Città}` e legge un
 * booleano: era una rotta del backend LEGACY. Spento il legacy (31/08) il
 * dominio è passato a questa piattaforma, che serviva solo `/api/v1/*`: la
 * chiamata riceveva l'index.html della SPA, il preflight CORS falliva e il
 * tema — che intercetta l'errore con un `catch` muto — chiudeva tutto senza
 * mettere nulla nel carrello. Dal 31/08 al 03/09 nessun prodotto non unico
 * era acquistabile.
 *
 * La rotta rinasce QUI, allo STESSO indirizzo (fuori dal prefisso `api/v1`,
 * vedi `setGlobalPrefix(... exclude)` in main.ts/vercel.ts e la riga in
 * vercel.json), così il tema non va toccato. Risponde `true` se la città è
 * nella tabella `City` della provincia (le 46 città importate dal legacy:
 * Milano e hinterland, Como, Monza, Roma, Firenze…), `false` altrimenti —
 * fedele al legacy; il tema con `false` apre «nessun prodotto disponibile».
 *
 * Confronto insensibile a maiuscole e accenti («Cantù» = «cantu»): il nome
 * arriva dal geocoder Google, non da una tendina nostra.
 *
 * Sicurezza (registrata in SEGNALAZIONI-SICUREZZA il 03/09): rotta pubblica
 * in SOLA LETTURA che risponde un booleano; CORS aperto solo agli origin dei
 * siti Deluxy (lista sotto + `CORS_SITI_ORIGINS`), mai `*`, mai credenziali.
 */

const ORIGIN_SITI_DELUXY = [
  'https://deluxy.it',
  'https://www.deluxy.it',
  'https://deluxygifts.myshopify.com',
];

function originAmmessi(): Set<string> {
  const extra = (process.env.CORS_SITI_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...ORIGIN_SITI_DELUXY, ...extra]);
}

/** Intestazioni CORS solo se l'origin è un sito Deluxy; altrimenti nulla. */
function cors(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (!origin || !originAmmessi().has(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

/** minuscole, senza accenti, spazi collassati: «Cantù » → «cantu» */
export function normalizzaNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class ProvinceCitiesPubblicoService {
  constructor(private readonly prisma: PrismaService) {}

  /** true se `city` è fra le città coperte della provincia `code`. */
  async cittaCoperta(code: string, city: string): Promise<boolean> {
    const codice = code.trim().toUpperCase();
    const cercata = normalizzaNome(city);
    if (!codice || !cercata) return false;
    const citta = await this.prisma.city.findMany({
      where: { province: { code: codice } },
      select: { name: true },
    });
    return citta.some((c) => normalizzaNome(c.name) === cercata);
  }
}

@ApiExcludeController()
@Controller('api/province-cities')
export class ProvinceCitiesPubblicoController {
  constructor(private readonly service: ProvinceCitiesPubblicoService) {}

  /** Preflight del browser (il tema manda `Content-Type: application/json`). */
  @Public()
  @Options(':code/:city')
  @HttpCode(204)
  preflight(@Req() req: Request, @Res() res: Response): void {
    cors(req, res);
    res.status(204).end();
  }

  @Public()
  @Get(':code/:city')
  // La risposta cambia solo quando cambia la tabella delle città: un minuto
  // nel browser, un'ora sul bordo Vercel (s-maxage) — con Vary: Origin.
  @Header('Cache-Control', 'public, max-age=60, s-maxage=3600')
  // Un booleano nudo Express lo manderebbe come text/html: il tema fa .json().
  @Header('Content-Type', 'application/json; charset=utf-8')
  async cittaCoperta(
    @Param('code') code: string,
    @Param('city') city: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<boolean> {
    cors(req, res);
    return this.service.cittaCoperta(code, city);
  }
}
