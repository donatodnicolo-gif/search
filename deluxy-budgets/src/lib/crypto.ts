import crypto from "node:crypto";

// Le chiavi API servono **in chiaro** al momento della chiamata, quindi non
// basta un hash: vanno cifrate e poi decifrate. AES-256-GCM con chiave derivata
// da APP_SECRET, che vive solo nell'ambiente del server — nel database resta una
// stringa che senza quel segreto non dice niente.
//
// Stessa infrastruttura di deluxy-merchandising (token Shopify) e
// deluxy-messaging (token Meta): un solo modo di cifrare in tutto l'ecosistema,
// così non si inventa un meccanismo per app.

function chiaveCifratura(): Buffer {
  const segreto = process.env.APP_SECRET;
  if (!segreto) {
    throw new Error(
      "APP_SECRET mancante: senza non si possono salvare le chiavi API dall'app. Aggiungila alle variabili d'ambiente."
    );
  }
  // scrypt normalizza qualsiasi lunghezza di segreto a 32 byte.
  return crypto.scryptSync(segreto, "deluxy-budgets", 32);
}

export function cifraturaConfigurata(): boolean {
  return Boolean(process.env.APP_SECRET);
}

export function cifra(testo: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chiaveCifratura(), iv);
  const dati = Buffer.concat([cipher.update(testo, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, dati].map((b) => b.toString("base64")).join(".");
}

export function decifra(cifrato: string): string {
  const [ivB64, tagB64, datiB64] = cifrato.split(".");
  if (!ivB64 || !tagB64 || !datiB64) throw new Error("Valore cifrato in formato non valido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", chiaveCifratura(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(datiB64, "base64")), decipher.final()]).toString("utf8");
}

// Anteprima da mostrare in pagina: la chiave non torna MAI al browser per
// intero. «sk-proj-…a1b2» basta a riconoscere quale chiave è impostata.
export function anteprima(valore: string): string {
  const pulito = valore.trim();
  if (pulito.length <= 10) return "•".repeat(pulito.length);
  return `${pulito.slice(0, 7)}…${pulito.slice(-4)}`;
}
