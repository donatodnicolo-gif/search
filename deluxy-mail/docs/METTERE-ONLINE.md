# Mettere AI Mail online

Guida per pubblicare `deluxy-mail` su Vercel e usarla da qualsiasi dispositivo.
Aggiornata al 17 luglio 2026.

> **Le tre cose in questa guida le devi fare tu**, non Claude: creare account,
> incollare segreti e pubblicare verso l'esterno sono azioni che richiedono le
> tue credenziali e la tua decisione.

---

## Prima di tutto: la password

**AI Mail non parte online senza `APP_PASSWORD`.** Non è una raccomandazione: il
middleware risponde 503 e l'app non si apre.

Il motivo è che qui dentro non ci sono "dati": c'è una casella di posta intera,
con la password IMAP salvata e lo SMTP pronto a spedire. Senza login, chiunque
indovini o riceva l'URL legge tutta la tua posta e può scrivere a tuo nome. Un
indirizzo difficile da indovinare non è una protezione.

In locale (`npm run dev` sulla tua macchina) l'app resta aperta: ci arrivi solo tu.

---

## 1. Il database

Serve un Postgres raggiungibile da internet: il `prisma dev` locale non vale.
Su Supabase, progetto dedicato ad AI Mail → **Project Settings → Database →
Connection string**:

- variante **Transaction pooler** (porta 6543), con `?pgbouncer=true` in fondo → `DATABASE_URL`
- variante **Session** (porta 5432) → `DIRECT_URL`

Poi, una volta sola, dalla cartella `deluxy-mail` con quelle due nel `.env`:

```bash
npm run db:push
```

## 2. Il progetto su Vercel

Il repo è un monorepo: AI Mail è una sottocartella.

1. [vercel.com/new](https://vercel.com/new) → importa il repo `donatodnicolo-gif/search`
2. **Root Directory:** `deluxy-mail` ← il passaggio che si dimentica sempre
3. Framework: Next.js (lo riconosce da solo)

## 3. Le variabili d'ambiente su Vercel

In **Settings → Environment Variables**, per Production e Preview:

| Variabile | Valore |
|---|---|
| `DATABASE_URL` | stringa pooler di Supabase |
| `DIRECT_URL` | stringa session di Supabase |
| `OPENAI_API_KEY` | la chiave OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `APP_SECRET` | **lo stesso del `.env` locale** (vedi sotto) |
| `APP_PASSWORD` | la password per entrare |
| `CRON_SECRET` | token per il cron (lo genera Vercel se lo lasci vuoto) |

> **`APP_SECRET` non è un valore qualsiasi:** cifra le password IMAP/SMTP nel
> database. Se online ne metti uno diverso da quello con cui hai collegato la
> casella, le password salvate non si decifrano più e la casella va ricollegata.
> Se il database online è nuovo e vuoto, invece, puoi metterne uno nuovo e
> collegare la casella da lì.

## 4. Sincronizzazione automatica

`vercel.json` chiede un cron ogni 15 minuti su `/api/sync`. Vercel lo chiama con
`Authorization: Bearer $CRON_SECRET`, e la rotta accetta quell'header.

⚠️ **Sul piano Hobby i cron girano una volta al giorno.** Per l'aggiornamento ogni
15 minuti serve il piano Pro. Senza, restano il pulsante "Aggiorna posta" e
l'automatico ogni 5 minuti mentre l'app è aperta.

## 5. Il Hub

Su `deluxy-hub`, variabile `APP_URL_MAIL` = l'URL Vercel di AI Mail: l'icona
compare nel portale. Senza, in produzione l'app resta nascosta.

## 6. Sul telefono

Aperto l'URL con Chrome su Android: menù → **Installa app**. La PWA è già
configurata (`public/manifest.webmanifest`), mancano solo le icone
`icon-192.png` e `icon-512.png` in `public/`.

---

## Cosa NON è ancora pronto per l'online

- **Icone PWA:** mancano, l'installazione su Android funziona ma senza icona.
- **Un solo utente:** `APP_PASSWORD` è una password condivisa, non ci sono utenti
  separati. Chi entra vede tutto.
- **Tauri (desktop):** non ancora impacchettato.
- **Durata delle funzioni:** su Vercel una richiesta serverless ha un limite di
  tempo. Uno scarico di 100 messaggi con analisi AI può superarlo: `/api/sync`
  dichiara `maxDuration = 300`, che il piano Hobby non concede. In caso, scarica
  blocchi più piccoli.
