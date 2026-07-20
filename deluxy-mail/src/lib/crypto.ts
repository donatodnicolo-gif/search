import crypto from 'node:crypto'

// Le password IMAP/SMTP servono in chiaro al momento della connessione, quindi
// non basta un hash: vanno cifrate e poi decifrate. AES-256-GCM con una chiave
// derivata da APP_SECRET, che sta solo nell'ambiente del server.

function chiave(): Buffer {
  const segreto = process.env.APP_SECRET
  if (!segreto) {
    throw new Error(
      'APP_SECRET mancante: impossibile cifrare le password delle caselle. Vedi .env.example.'
    )
  }
  // scrypt normalizza qualsiasi lunghezza di segreto a 32 byte.
  return crypto.scryptSync(segreto, 'deluxy-mail', 32)
}

export function cifra(testo: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', chiave(), iv)
  const dati = Buffer.concat([cipher.update(testo, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, dati].map((b) => b.toString('base64')).join('.')
}

export function decifra(cifrato: string): string {
  const [ivB64, tagB64, datiB64] = cifrato.split('.')
  if (!ivB64 || !tagB64 || !datiB64) throw new Error('Password cifrata in formato non valido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', chiave(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(datiB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
