// Crea il primo utente amministratore. Idempotente: se l'email esiste già,
// non tocca nulla (la password non viene sovrascritta).
//
//   node prisma/seed.mjs
//
// Email e password si impostano con SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.

import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "deluxy.delivery@gmail.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    console.error("SEED_ADMIN_PASSWORD non impostata. Aggiungila a .env e riprova.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("SEED_ADMIN_PASSWORD troppo corta: servono almeno 8 caratteri.");
    process.exit(1);
  }

  const esistente = await prisma.utente.findUnique({ where: { email } });
  if (esistente) {
    console.log(`Utente ${email} già presente: nessuna modifica.`);
    return;
  }

  await prisma.utente.create({
    data: {
      email,
      nome: "Amministratore",
      ruolo: "admin",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Creato amministratore ${email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
