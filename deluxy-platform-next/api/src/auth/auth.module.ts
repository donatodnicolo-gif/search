import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    // registerAsync: il segreto viene letto DOPO il caricamento del .env
    // (ConfigModule), non a import-time.
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-secret-non-usare-in-produzione',
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
