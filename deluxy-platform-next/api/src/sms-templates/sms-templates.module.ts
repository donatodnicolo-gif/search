import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Brand, Role, SmsTrigger } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmsTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Il partner (se abilitato) vede i template globali + i propri. */
  async findAll(user: JwtUser) {
    // L'insegna serve alla colonna «Partner» della pagina: senza, un modello
    // del partner sarebbe indistinguibile da uno globale.
    const include = { partner: { select: { id: true, insegna: true } } };
    if (user.role === Role.PARTNER) {
      return this.prisma.smsTemplate.findMany({
        where: { OR: [{ partnerId: null }, { partnerId: user.partnerId ?? '-' }] },
        orderBy: [{ brand: 'asc' }, { trigger: 'asc' }],
        include,
      });
    }
    return this.prisma.smsTemplate.findMany({
      orderBy: [{ brand: 'asc' }, { trigger: 'asc' }],
      include,
    });
  }

  async create(
    user: JwtUser,
    body: { brand: Brand; trigger: SmsTrigger; name: string; text: string; partnerId?: string },
  ) {
    let partnerId = body.partnerId ?? null;
    if (user.role === Role.PARTNER) {
      const partner = await this.prisma.partner.findUnique({
        where: { id: user.partnerId ?? '-' },
      });
      if (!partner?.smsTemplatesEnabled) {
        throw new ForbiddenException('Modelli SMS non abilitati per questo partner');
      }
      partnerId = partner.id;
    }
    return this.prisma.smsTemplate.create({
      data: { ...body, partnerId },
    });
  }
}

@ApiTags('sms-templates')
@ApiBearerAuth()
// ⚠️ Il guard dei ruoli, SENZA `@Roles`, lascia passare chiunque sia
// autenticato (roles.guard.ts). Questo controller non ne aveva nessuno: un
// VALET leggeva tutto. Provato con un token vero il 27/08/2026. I ruoli qui
// sono gli stessi che il frontend applica alla pagina (app.routes.ts).
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
@Controller('sms-templates')
export class SmsTemplatesController {
  constructor(private readonly smsTemplatesService: SmsTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Modelli SMS per brand (Deluxy, DeluxyFlowers, CakeDesign.Me, ...)' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.smsTemplatesService.findAll(user);
  }

  @Post()
  @ApiOperation({ summary: 'Crea modello SMS (partner solo se abilitato)' })
  create(@CurrentUser() user: JwtUser, @Body() body: any) {
    return this.smsTemplatesService.create(user, body);
  }
}

@Module({
  controllers: [SmsTemplatesController],
  providers: [SmsTemplatesService],
})
export class SmsTemplatesModule {}
