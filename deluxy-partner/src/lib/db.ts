import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Riusiamo la stessa istanza ANCHE in produzione: su Vercel i bundle di pagine e
// route sono separati e, senza questo, ognuno aprirebbe le proprie connessioni al
// pooler pagando l'handshake a ogni invocazione (latenza inutile a ogni pagina).
globalForPrisma.prisma = prisma;
