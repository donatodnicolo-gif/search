import crypto from "node:crypto";

// Le chiavi API servono **in chiaro** al momento della chiamata, quindi non
// basta un hash: vanno cifrate e poi decifrate. AES-256-GCM con chiave derivata
// da APP_SECRET, che vive solo nell'ambiente del server — nel database resta una
// stringa che senza quel segreto non dice niente.
//
// Stessa infrastruttura di deluxy-merchandising (token Shopify) e
// deluxy-messaging (token Meta): un solo modo di cifrare in tutto l'ecosistema,
// così non si inventa un meccanismo per app.

// Da quale variabile d'ambiente si deriva la chiave, in ordine.
//
// `APP_SECRET` è quella giusta: dedicata, si ruota senza toccare altro. Ma
// pretendere *solo* quella significa che finché nessuno la aggiunge su Vercel
// la pagina Chiavi è disabilitata in produzione — cioè la funzione esiste e non
// si può usare, che è il modo peggiore di avere una funzione. Quindi si ripiega
// su segreti che in produzione ci sono già, come fa la cassaforte del Hub
// (`HUB_CHIAVI_SECRET` → `HUB_SESSION_SECRET`) e come fa qui `sessione.ts`.
//
// Il prezzo, e va detto invece che scoperto: **cambiare il segreto in uso rende
// illeggibili le chiavi già salvate**. Non si rompe niente — una chiave che non
// si decifra viene trattata come «non impostata» e si riscrive — ma sparisce. E
// se un giorno si aggiunge `APP_SECRET` dove prima si usava il ripiego, il
// primo posto della lista cambia e vale la stessa cosa: le chiavi vanno
// reinserite. Per questo la pagina dice sempre quale segreto le sta proteggendo.
const SEGRETI = ["APP_SECRET", "HUB_KEYS_TOKEN", "BUDGETS_APP_PASSWORD"] as const;

// Il nome della variabile che sta proteggendo le chiavi, o null se non ce n'è
// nessuna. Serve alla pagina: «cifrate con APP_SECRET» è un'informazione, «sono
// cifrate» non lo è.
export function segretoInUso(): string | null {
  return SEGRETI.find((n) => (process.env[n] || "").trim().length >= 8) ?? null;
}

function chiaveCifratura(): Buffer {
  const nome = segretoInUso();
  if (!nome) {
    throw new Error(
      "Nessun segreto per cifrare le chiavi: imposta APP_SECRET (almeno 8 caratteri) fra le variabili d'ambiente."
    );
  }
  // scrypt normalizza qualsiasi lunghezza di segreto a 32 byte.
  return crypto.scryptSync((process.env[nome] || "").trim(), "deluxy-budgets", 32);
}

export function cifraturaConfigurata(): boolean {
  return segretoInUso() !== null;
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
