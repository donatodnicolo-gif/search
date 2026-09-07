import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { DeliveriesService } from './deliveries.service';

/**
 * ⭐ 06/09/2026 (regola utente): ogni notte le NON CONSEGNATE senza riconsegna
 * si riportano a oggi, così restano davanti a chi deve gestirle. Chiamato da
 * Vercel (vercel.json, «5 23 * * *» UTC = dopo la mezzanotte di Roma).
 * Identità = `CRON_SECRET`, verificata prima di tutto (come `margini` e `smistamento`).
 */
@ApiTags('cron')
@Controller('cron')
export class NonConsegnateCronController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get('non-consegnate')
  @Public()
  @ApiOperation({ summary: 'Ogni notte: le non consegnate senza riconsegna tornano a oggi (da gestire)' })
  async run(@Headers('authorization') authorization?: string) {
    const segreto = process.env.CRON_SECRET ?? '';
    if (!segreto || authorization !== `Bearer ${segreto}`) throw new UnauthorizedException();
    return this.deliveries.riportaNonConsegnateAOggi();
  }
}
