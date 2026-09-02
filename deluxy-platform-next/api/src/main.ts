import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: il webhook di Deluxy Transactions verifica l'HMAC sul corpo
  // GREZZO — il JSON riserializzato non combacerebbe mai con la firma.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // ⚠️ 02/09 («request entity too large» del valet): la chiusura consegna
  // porta firma PNG + foto DDT in base64 e il limite di default del body
  // parser è 100 KB. 6 MB basta con margine (la foto è già compressa nel
  // browser a ~1280px JPEG); oltre i 4,5 MB taglierebbe comunque Vercel.
  // useBodyParser (e non un json() a mano) conserva il rawBody dei webhook.
  app.useBodyParser('json', { limit: '6mb' });
  app.useBodyParser('urlencoded', { limit: '6mb', extended: true });

  app.setGlobalPrefix('api/v1');
  // File caricati (es. ricevute firmate) serviti staticamente da /uploads.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Deluxy Platform API')
    .setDescription(
      'API della piattaforma Deluxy (logistica consegne in guanti bianchi). Versione v1.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Deluxy API in ascolto su http://localhost:${port}/api/v1 (docs: /api/docs)`);
}

bootstrap();
