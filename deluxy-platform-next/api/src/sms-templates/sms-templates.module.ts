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
import { CurrentUser, JwtUser } from '../common/decorators';
import { Brand, Role, SmsTrigger } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmsTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Il partner (se abilitato) vede i template globali + i propri. */
  async findAll(user: JwtUser) {
    if (user.role === Role.PARTNER) {
      return this.prisma.smsTemplate.findMany({
        where: { OR: [{ partnerId: null }, { partnerId: user.partnerId ?? '-' }] },
        orderBy: [{ brand: 'asc' }, { trigger: 'asc' }],
      });
    }
    return this.prisma.smsTemplate.findMany({
      orderBy: [{ brand: 'asc' }, { trigger: 'asc' }],
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
