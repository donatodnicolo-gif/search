import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Lo schema Postgres di questa app (standard Deluxy: un database condiviso, uno
// schema per app — qui `orders`). Prisma lo mette da sé nelle query dei modelli,
// ma NON nelle query grezze: quelle si appoggiano al search_path della
// connessione, e col pooler in modalità transazione capita una connessione che
// non ce l'ha. Sintomo: «relation "Ordine" does not exist» a intermittenza, su
// una query che il minuto prima funzionava. Quindi nelle $queryRaw la tabella
// si qualifica sempre con questo helper.
export const SCHEMA =
  /[?&]schema=([^&]+)/.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "public";

export function tabella(nome: string): Prisma.Sql {
  return Prisma.raw(`"${SCHEMA}"."${nome}"`);
}
