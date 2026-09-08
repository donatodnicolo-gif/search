import { Body, Controller, Get, Injectable, Module, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ⭐ 06/09/2026 sera — IL LISTINO DEI FIORI DEL FIORAIO (regola utente: «crea una pagina Listino da
 * compilare al primo accesso da parte di un fioraio, che chiede di riempire il prezzo dei singoli
 * fiori principali»).
 *
 * Il prezzo di un fiore singolo è un prodotto UNICO del partner nella categoria «Fiori a stelo»
 * (sku `STELO-<FIORE>-<partnerId>`): la stessa cosa che il 06/09 abbiamo caricato dallo storico
 * delle consegne. Qui il fioraio la conferma o la corregge, e aggiunge i fiori che quello storico
 * non aveva. Non è una tabella nuova: **il prezzo ha una casa sola**, il catalogo (Standard §7).
 *
 * ⚠️ Prezzo vuoto = «questo fiore non lo faccio»: il prodotto si disattiva, non si cancella — le
 * consegne passate continuano a puntarci.
 */

/**
 * ⭐ 08/09/2026 (regola utente: «chiedi anche di impostare le varianti colore per le rose
 * espandendo la tabella in orizzontale») — I COLORI CHE SI CHIEDONO.
 *
 * ⚠️ Non è un vezzo: a catalogo «Rosa a stelo» aveva UN prezzo per partner, ma nelle
 * consegne vere il colore cambia il prezzo quasi sempre. Misurato l'08/09 su 1.461 steli
 * ricavati dallo storico: **12 partner su 14** con almeno due colori li pagano diverso, e
 * lo schema è costante — la rossa costa di più, la rosa 1-2 € meno, la bianca in mezzo.
 * Il prezzo unico era quasi sempre quello della rossa, quindi su ogni fiore non-rosso si
 * pagava in eccesso.
 *
 * Si chiedono cinque colori, non tutti quelli visti: oltre il quinto la tabella diventa
 * illeggibile e le occorrenze nello storico si contano sulle dita.
 */
export const COLORI_ROSA: { chiave: string; nome: string }[] = [
  { chiave: 'ROSSA', nome: 'Rossa' },
  { chiave: 'BIANCA', nome: 'Bianca' },
  { chiave: 'ROSA', nome: 'Rosa' },
  { chiave: 'GIALLA', nome: 'Gialla' },
  { chiave: 'BLU', nome: 'Blu' },
];

/** Di quali fiori si chiede il colore. Per ora la rosa: è quella con lo storico che lo dimostra. */
export const FIORI_CON_COLORE = new Set(['ROSA']);

/** I fiori che si chiedono a tutti: l'ordine è quello con cui si mostrano. */
export const FIORI_PRINCIPALI: { chiave: string; nome: string }[] = [
  { chiave: 'ROSA', nome: 'Rosa' },
  { chiave: 'TULIPANO', nome: 'Tulipano' },
  { chiave: 'GIRASOLE', nome: 'Girasole' },
  { chiave: 'ORTENSIA', nome: 'Ortensia' },
  { chiave: 'PEONIA', nome: 'Peonia' },
  { chiave: 'ORCHIDEA', nome: 'Orchidea' },
  { chiave: 'GIGLIO', nome: 'Giglio' },
  { chiave: 'CALLA', nome: 'Calla' },
  { chiave: 'RANUNCOLO', nome: 'Ranuncolo' },
  { chiave: 'ANEMONE', nome: 'Anemone' },
  { chiave: 'GERBERA', nome: 'Gerbera' },
  { chiave: 'GAROFANO', nome: 'Garofano' },
  { chiave: 'LISIANTHUS', nome: 'Lisianthus' },
  { chiave: 'GYPSOPHILA', nome: 'Gypsophila' },
  { chiave: 'MARGHERITA', nome: 'Margherita' },
  { chiave: 'MIMOSA', nome: 'Mimosa' },
];

const CATEGORIA = 'Fiori a stelo';

@Injectable()
export class ListinoService {
  constructor(private readonly prisma: PrismaService) {}

  private sku(chiave: string, partnerId: string) {
    return `STELO-${chiave}-${partnerId}`;
  }

  /** La categoria «Fiori a stelo», creata alla prima scrittura se non c'è. */
  private async categoria(creaSeManca: boolean) {
    let cat = await this.prisma.category.findFirst({ where: { name: CATEGORIA }, select: { id: true } });
    if (!cat && creaSeManca) {
      const fiorista = await this.prisma.mestiere.findFirst({ where: { nome: 'Fiorista' }, select: { id: true } });
      cat = await this.prisma.category.create({ data: { name: CATEGORIA, mestiereId: fiorista?.id ?? null }, select: { id: true } });
    }
    return cat;
  }

  /**
   * Il listino di un partner: una riga per fiore principale (col prezzo se c'è) più i fiori a stelo
   * che ha già e che non sono nell'elenco. `daCompilare` = il fioraio non l'ha ancora confermato.
   */
  async leggi(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, insegna: true, listinoFioriCompilatoIl: true, mestieri: { select: { mestiere: { select: { nome: true } } } } },
    });
    if (!partner) throw new NotFoundException('Partner non trovato');
    const cat = await this.categoria(false);
    const suoi = cat
      ? await this.prisma.product.findMany({
          where: { partnerId, categoryId: cat.id, deletedAt: null },
          // ⭐ 08/09/2026: le VARIANTI DI COLORE viaggiano con la riga del fiore.
          select: { id: true, name: true, sku: true, price: true, active: true, description: true, updatedAt: true,
                    variants: { select: { id: true, name: true, price: true, active: true } } },
        })
      : [];
    const perSku = new Map(suoi.map((p) => [p.sku ?? '', p]));
    const righe = FIORI_PRINCIPALI.map((f) => {
      const p = perSku.get(this.sku(f.chiave, partnerId));
      // ⚠️ Il colore si chiede solo dove ha senso, e solo se il fiore lo fa: una colonna
      // vuota su otto fiori sarebbe rumore. La variante che non esiste torna con prezzo
      // `null`, cioè «questo colore non lo faccio» — come per il fiore intero.
      const colori = FIORI_CON_COLORE.has(f.chiave)
        ? COLORI_ROSA.map((c) => {
            const v = (p?.variants ?? []).find((x) => x.name.trim().toLowerCase() === c.nome.toLowerCase());
            return { chiave: c.chiave, nome: c.nome, prezzo: v && v.active ? v.price : null };
          })
        : null;
      return {
        chiave: f.chiave,
        nome: f.nome,
        prezzo: p && p.active ? p.price : null,
        nota: p?.description ?? null,
        aggiornatoIl: p?.updatedAt ?? null,
        // Il prezzo caricato dall'ufficio dallo storico è una PROPOSTA finché il fioraio non conferma.
        daConfermare: !!p && !partner.listinoFioriCompilatoIl,
        colori,
      };
    });
    const altri = suoi
      .filter((p) => !FIORI_PRINCIPALI.some((f) => this.sku(f.chiave, partnerId) === (p.sku ?? '')))
      .map((p) => ({ chiave: '', nome: p.name.replace(/ a stelo$/i, ''), prezzo: p.active ? p.price : null, nota: p.description, aggiornatoIl: p.updatedAt, daConfermare: false }));
    return {
      partner: { id: partner.id, insegna: partner.insegna },
      eFiorista: partner.mestieri.some((m) => m.mestiere.nome === 'Fiorista'),
      compilatoIl: partner.listinoFioriCompilatoIl,
      daCompilare: !partner.listinoFioriCompilatoIl,
      righe: [...righe, ...altri],
    };
  }

  /**
   * Salva il listino: un prezzo per fiore. Vuoto o zero = «non lo faccio» (prodotto disattivato).
   * Segna il listino come compilato: da lì in poi l'avviso del primo accesso non compare più.
   */
  async salva(
    partnerId: string,
    righe: { chiave?: string; nome?: string; prezzo?: number | null;
             colori?: { chiave?: string; nome?: string; prezzo?: number | null }[] | null }[],
  ) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partner non trovato');
    const cat = await this.categoria(true);
    let scritti = 0, spenti = 0;
    for (const r of righe ?? []) {
      const f = FIORI_PRINCIPALI.find((x) => x.chiave === (r.chiave ?? '').toUpperCase());
      if (!f) continue; // si scrivono solo i fiori dell'elenco: il resto passa dai Prodotti
      const sku = this.sku(f.chiave, partnerId);
      const prezzo = r.prezzo === null || r.prezzo === undefined || (r.prezzo as unknown) === '' ? null : Number(r.prezzo);
      const valido = prezzo !== null && Number.isFinite(prezzo) && prezzo > 0;
      const gia = await this.prisma.product.findFirst({ where: { sku }, select: { id: true } });
      if (!valido) {
        if (gia) { await this.prisma.product.update({ where: { id: gia.id }, data: { active: false } }); spenti++; }
        continue;
      }
      const dati = {
        name: `${f.nome} a stelo`,
        price: prezzo,
        type: 'UNICO',
        partnerId,
        categoryId: cat!.id,
        active: true,
        approved: true,
        hasVariants: false,
        notEditable: false,
        deletedAt: null,
        description: `Prezzo per stelo dichiarato dal fioraio nel suo Listino (${new Date().toISOString().slice(0, 10)}).`,
      };
      const prodotto = gia
        ? await this.prisma.product.update({ where: { id: gia.id }, data: dati, select: { id: true, sku: true } })
        : await this.prisma.product.create({ data: { ...dati, sku, createdFrom: 'listino-fiorista' }, select: { id: true, sku: true } });
      scritti++;

      /**
       * ⭐ 08/09/2026 — I COLORI, come VARIANTI del fiore.
       *
       * ⚠️ Un colore senza prezzo si DISATTIVA, non si cancella: le consegne passate
       * puntano a quella variante, e cancellarla lascerebbe righe che dicono «rossa»
       * senza più nulla dietro. Stessa regola del fiore intero.
       */
      if (FIORI_CON_COLORE.has(f.chiave) && Array.isArray(r.colori)) {
        for (const c of r.colori) {
          const col = COLORI_ROSA.find((x) => x.chiave === (c.chiave ?? '').toUpperCase());
          if (!col) continue;
          const pc = c.prezzo === null || c.prezzo === undefined || (c.prezzo as unknown) === '' ? null : Number(c.prezzo);
          const ok = pc !== null && Number.isFinite(pc) && pc > 0;
          const esiste = await this.prisma.productVariant.findFirst({
            where: { productId: prodotto.id, name: col.nome },
            select: { id: true },
          });
          if (!ok) {
            if (esiste) { await this.prisma.productVariant.update({ where: { id: esiste.id }, data: { active: false } }); spenti++; }
            continue;
          }
          const datiV = {
            name: col.nome,
            price: pc,
            active: true,
            note: `Prezzo per stelo dichiarato dal fioraio nel suo Listino (${new Date().toISOString().slice(0, 10)}).`,
          };
          if (esiste) await this.prisma.productVariant.update({ where: { id: esiste.id }, data: datiV });
          else {
            const quante = await this.prisma.productVariant.count({ where: { productId: prodotto.id } });
            await this.prisma.productVariant.create({
              data: { ...datiV, productId: prodotto.id, sku: `${prodotto.sku}-${String(quante + 1).padStart(2, '0')}` },
            });
          }
        }
      }
    }
    await this.prisma.partner.update({ where: { id: partnerId }, data: { listinoFioriCompilatoIl: new Date() } });
    return { scritti, spenti, ...(await this.leggi(partnerId)) };
  }
}

@ApiTags('listino')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.OPERATION, Role.PARTNER)
@Controller('listino-fiori')
export class ListinoController {
  constructor(private readonly service: ListinoService) {}

  private chi(user: JwtUser, partnerId?: string) {
    // Il partner vede e scrive SOLO il proprio listino: l'id non lo sceglie lui.
    if (user.role === Role.PARTNER) return user.partnerId ?? '-';
    if (!partnerId) throw new NotFoundException('Serve il partner');
    return partnerId;
  }

  @Get()
  @ApiOperation({ summary: 'Il listino dei fiori a stelo del partner (il proprio, per il PARTNER)' })
  leggi(@CurrentUser() user: JwtUser, @Query('partnerId') partnerId?: string) {
    return this.service.leggi(this.chi(user, partnerId));
  }

  @Post()
  @ApiOperation({ summary: 'Salva i prezzi dei fiori a stelo (vuoto = non lo faccio) e segna il listino come compilato' })
  salva(
    @CurrentUser() user: JwtUser,
    @Body() body: { partnerId?: string; righe?: { chiave?: string; prezzo?: number | null }[] },
  ) {
    return this.service.salva(this.chi(user, body?.partnerId), body?.righe ?? []);
  }
}

@Module({ controllers: [ListinoController], providers: [ListinoService], exports: [ListinoService] })
export class ListinoModule {}
