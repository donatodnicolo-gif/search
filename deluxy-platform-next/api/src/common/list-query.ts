import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Contratto comune delle liste: ricerca globale + ordinamento + paginazione
 * (+ intervallo di date dove ha senso).
 *
 * Convenzione decisa col committente:
 * - `q` cerca in TUTTI i campi testuali dell'entita' (un solo campo di ricerca);
 * - data e ora hanno filtri propri (`dateFrom` / `dateTo`), non entrano in `q`;
 * - ogni campo e' ordinabile, asc o desc.
 */
export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Ricerca globale su tutti i campi testuali' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Campo di ordinamento (whitelist per risorsa)' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, description: 'Elementi per pagina (max 500, come app reale)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Data da (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Data a (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

/** Risposta paginata standard di tutte le liste. */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 500; // come l'app reale (10..500)
const DEFAULT_PAGE_SIZE = 50;

/** skip/take dalla pagina richiesta, con tetto massimo di sicurezza. */
export function paginate(query: ListQueryDto): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/**
 * Ricerca globale: OR di `contains` su tutti i campi testuali indicati.
 * Supporta i campi annidati con la notazione "relazione.campo"
 * (es. "partner.insegna" -> { partner: { insegna: { contains } } }).
 *
 * NOTA SQLite (dev): `contains` diventa LIKE, che e' gia' case-insensitive
 * sull'ASCII. Su PostgreSQL (produzione) LIKE e' case-sensitive: la',
 * per lo stesso comportamento, serve `mode: 'insensitive'`.
 */
export function textSearch(q: string | undefined, fields: string[]): Record<string, unknown> | undefined {
  const term = (q ?? '').trim();
  if (!term || fields.length === 0) return undefined;
  return {
    OR: fields.map((field) => {
      const parts = field.split('.');
      // Costruisce l'oggetto annidato partendo dalla foglia
      let node: Record<string, unknown> = { contains: term };
      for (let i = parts.length - 1; i >= 0; i--) {
        node = { [parts[i]]: node };
      }
      return node;
    }),
  };
}

/**
 * orderBy Prisma dal `sort`/`dir` richiesti. Il campo deve essere nella
 * whitelist della risorsa: evita di ordinare per colonne arbitrarie.
 * Supporta "relazione.campo".
 */
export function buildOrderBy(
  query: ListQueryDto,
  allowed: string[],
  fallback: Record<string, unknown> | Record<string, unknown>[],
): Record<string, unknown> | Record<string, unknown>[] {
  const { sort } = query;
  const dir = query.dir === 'desc' ? 'desc' : 'asc';
  if (!sort || !allowed.includes(sort)) return fallback;
  const parts = sort.split('.');
  let node: unknown = dir;
  for (let i = parts.length - 1; i >= 0; i--) {
    node = { [parts[i]]: node };
  }
  return node as Record<string, unknown>;
}

/** Filtro su intervallo di date per un campo DateTime. */
export function dateRange(query: ListQueryDto, field = 'date'): Record<string, unknown> | undefined {
  const { dateFrom, dateTo } = query;
  if (!dateFrom && !dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (dateFrom) range['gte'] = new Date(dateFrom);
  // dateTo incluso: fino alla fine della giornata
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    range['lte'] = end;
  }
  return { [field]: range };
}
