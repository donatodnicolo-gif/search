// Entrypoint serverless per Vercel.
//
// Differenze rispetto a main.ts (che resta l'avvio locale/Docker):
//  - niente app.listen(): Vercel invoca l'handler, non apre una porta;
//  - niente CORS: web e API sono sullo stesso dominio (vedi vercel.json);
//  - niente useStaticAssets('/uploads'): su serverless il filesystem e'
//    effimero, gli allegati vanno su object storage (vedi HANDOFF).
//
// L'app Nest viene creata una sola volta e riusata dalle invocazioni
// successive che finiscono sulla stessa istanza calda: bootstrap e pool
// Prisma si pagano solo a freddo.
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import { AppModule } from './app.module';

const server = express();
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  // rawBody: serve al webhook di Deluxy Transactions (HMAC sul corpo grezzo).
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule, new ExpressAdapter(server), { rawBody: true },
  );
  // ⚠️ 02/09 («request entity too large» del valet): firma + foto DDT in
  // base64 sfondano il limite di default (100 KB). Vedi main.ts; qui vale il
  // tetto Vercel (~4,5 MB), 6 MB copre tutto il possibile.
  app.useBodyParser('json', { limit: '6mb' });
  app.useBodyParser('urlencoded', { limit: '6mb', extended: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
}

export default async function handler(req: Request, res: Response) {
  bootstrapped ??= bootstrap();
  await bootstrapped;
  server(req, res);
}
