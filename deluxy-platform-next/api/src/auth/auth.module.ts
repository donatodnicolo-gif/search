import { SettingsModule } from '../settings/settings.module';
import { PartnersModule } from '../partners/partners.module';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    SettingsModule,
    // La scheda profilo (02/09): i contatti del PARTNER passano dalla rotta
    // dei partner, che stringe i campi E sincronizza le Anagrafiche.
    PartnersModule,
    // registerAsync: il segreto viene letto DOPO il caricamento del .env
    // (ConfigModule), non a import-time.
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        // ⚠️ 27/08/2026 — NIENTE SEGRETO DI RIPIEGO.
        //
        // Prima era `?? 'dev-secret-non-usare-in-produzione'`: se la variabile
        // mancava, l'app partiva lo stesso e firmava con una stringa che sta
        // scritta in questo repo. Chiunque avesse un'utenza poteva rifirmarsi
        // il proprio token con `role: ADMIN` e diventare amministratore.
        //
        // Non è teorico: su questo ambiente è già capitato che una variabile
        // restasse fuori da Vercel per settimane. Meglio un'app che NON PARTE
        // e lo dice, di un'app che parte insicura in silenzio.
        secret: (() => {
          const s = process.env.JWT_SECRET;
          if (!s) {
            throw new Error(
              'JWT_SECRET non è impostata: l\'API non parte. Impostala nell\'ambiente (Vercel → Environment Variables).',
            );
          }
          return s;
        })(),
        // Cast: expiresIn accetta stringhe tipo "8h" (tipo StringValue di `ms`)
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
