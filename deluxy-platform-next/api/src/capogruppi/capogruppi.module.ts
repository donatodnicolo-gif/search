import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * IL CAPOGRUPPO: CHI PAGA PER UN PARTNER (10/09/2026, regola utente: «crea anche qui su app una
 * entità capogruppo che indica per ogni partner chi paga — sono gli esempi dei negozi Chanel e
 * Diptyque — e comunica questa cosa anche con Anagrafiche»).
 *
 * Il concetto, in tre righe:
 *  · un PARTNER della piattaforma è un PUNTO VENDITA (Diptyque Brera, Chanel Montenapoleone);
 *  · un CAPOGRUPPO è la SOCIETÀ che fattura per uno o più punti vendita (OLFATTORIO SRL);
 *  · `Partner.capogruppoId` dice a quale entità appartiene, `Partner.pagaDaSe` se il punto
 *    vendita si fattura da solo (true, default) o se fattura il capogruppo (false).
 *
 * Chi è la casa del dato: il registro Anagrafiche ha lo stesso concetto (`Capogruppo` +
 * `pagaDaSe`), e Finance legge da lì. Qui il capogruppo si DECIDE (è l'ufficio che lo sa,
 * dalla scheda partner) e si COMUNICA al registro a ogni scrittura (`registroId` è l'id del
 * capogruppo di là); dal registro torna quando un partner viene confrontato e di là ha già un
 * capogruppo che qui manca. Le due copie si parlano; non si contraddicono perché il
 * registro è scritto solo da qui per questo campo.
 */
export type CapogruppoDto = {
  nome: string;
  pIva?: string | null;
  codiceFiscale?: string | null;
  codiceSdi?: string | null;
  pec?: string | null;
  email?: string | null;
  note?: string | null;
};

@Injectable()
export class CapogruppiService {
  constructor(private readonly prisma: PrismaService) {}

  elenco() {
    return this.prisma.capogruppo.findMany({
      orderBy: { nome: 'asc' },
      include: { partners: { where: { deleted: false }, select: { id: true, insegna: true, pagaDaSe: true, active: true }, orderBy: { insegna: 'asc' } } },
    });
  }

  async uno(id: string) {
    const c = await this.prisma.capogruppo.findUnique({ where: { id }, include: { partners: { where: { deleted: false }, select: { id: true, insegna: true, pagaDaSe: true, active: true } } } });
    if (!c) throw new NotFoundException('Capogruppo non trovato');
    return c;
  }

  /** Trova per nome (senza maiuscole) o crea. Il nome è l'identità: una società, un capogruppo. */
  async trovaOCrea(dto: CapogruppoDto) {
    const nome = (dto.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Il capogruppo ha bisogno di un nome (la ragione sociale).');
    const gia = await this.prisma.capogruppo.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } });
    if (gia) return gia;
    return this.prisma.capogruppo.create({
      data: { nome, pIva: dto.pIva?.trim() || null, codiceFiscale: dto.codiceFiscale?.trim() || null, codiceSdi: dto.codiceSdi?.trim() || null, pec: dto.pec?.trim() || null, email: dto.email?.trim() || null, note: dto.note?.trim() || null },
    });
  }

  async aggiorna(id: string, dto: Partial<CapogruppoDto> & { registroId?: string | null }) {
    await this.uno(id);
    const data: Record<string, unknown> = {};
    for (const k of ['nome', 'pIva', 'codiceFiscale', 'codiceSdi', 'pec', 'email', 'note', 'registroId'] as const) {
      if (dto[k] !== undefined) data[k] = k === 'nome' ? String(dto[k]).trim() : (dto[k] == null ? null : String(dto[k]).trim() || null);
    }
    if (data['nome'] === '') throw new BadRequestException('Il nome non può essere vuoto.');
    return this.prisma.capogruppo.update({ where: { id }, data });
  }
}

@ApiTags('capogruppi')
@ApiBearerAuth()
@Controller('capogruppi')
export class CapogruppiController {
  constructor(private readonly service: CapogruppiService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  @ApiOperation({ summary: 'I capogruppi (chi paga per uno o più partner) coi loro punti vendita' })
  elenco() { return this.service.elenco(); }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERATION, Role.PROJECT_MANAGER)
  uno(@Param('id') id: string) { return this.service.uno(id); }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATION)
  @ApiOperation({ summary: 'Crea un capogruppo (o restituisce quello con lo stesso nome)' })
  crea(@Body() dto: CapogruppoDto) { return this.service.trovaOCrea(dto); }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATION)
  aggiorna(@Param('id') id: string, @Body() dto: Partial<CapogruppoDto>) { return this.service.aggiorna(id, dto); }
}

@Module({
  controllers: [CapogruppiController],
  providers: [CapogruppiService],
  exports: [CapogruppiService],
})
export class CapogruppiModule {}
