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
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import { AppModule } from './app.module';

const server = express();
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
}

export default async function handler(req: Request, res: Response) {
  bootstrapped ??= bootstrap();
  await bootstrapped;
  server(req, res);
}
