import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Verifica delle password nel formato del Deluxy Hub: scrypt "<salt hex>:<hash hex>".
// Solo runtime Node (il middleware Edge non deve importare questo file).

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

export async function verificaPassword(password: string, salvata: string): Promise<boolean> {
  const [saltHex, hashHex] = salvata.split(":");
  if (!saltHex || !hashHex) return false;

  const atteso = Buffer.from(hashHex, "hex");
  if (atteso.length !== KEY_LEN) return false;

  const calcolato = await scryptAsync(password, Buffer.from(saltHex, "hex"), KEY_LEN);
  return timingSafeEqual(atteso, calcolato);
}
