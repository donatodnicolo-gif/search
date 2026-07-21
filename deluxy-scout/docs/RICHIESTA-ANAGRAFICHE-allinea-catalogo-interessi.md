# Richiesta a Deluxy Anagrafiche — catalogo interessi IDENTICO alle linee di Scout

Gli interessi devono essere **identici** tra il registro e le app: oggi non lo sono
(es. Scout "Eventi & Catering" vs registro "catering"+"eventi"; Scout "Regali
aziendali"→"Gifting"). **Scout è il master delle linee di interesse**: chiediamo di
rendere il vostro **catalogo interessi identico** al nostro.

## Catalogo canonico (linee master di Scout — oggi)
Usate **esattamente questi nomi** (label), sostituendo/allineando il vostro catalogo:

| # | Linea (label canonica) |
|---|---|
| 1 | Affiliazioni |
| 2 | Clientelling |
| 3 | Concierge |
| 4 | Consegne |
| 5 | Eventi & Catering |
| 6 | Food Supplier |
| 7 | Gifting |
| 8 | Magazzino |
| 9 | Re-seller |

Corrispondenze col vostro catalogo attuale (per la migrazione dei dati esistenti):
- `consegne` → **Consegne**
- `affiliazione` → **Affiliazioni**
- `gifting` → **Gifting**
- `catering` **+** `eventi` → **Eventi & Catering** (unite i due nei dati storici)
- `vendor` → **Food Supplier** (confermate: è il fornitore B2B?)
- `in_store` → **Clientelling** (confermate)
- `pr_activation` → **Concierge**? (da decidere insieme: se PR è cosa a sé, ditecelo
  e la aggiungo alle linee master)
- (nessun equivalente registro) → **Magazzino**, **Re-seller**

## Sorgente unica: l'API `linee` di Scout (consigliato)
Per non disallinearvi mai più, leggete il catalogo dal master invece di tenerne una
copia statica:
```
GET https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/linee?soloAttive=1
Header: x-api-key: <LINEE_API_KEY>      (consegnata a parte)
```
Risposta: `{ linee: [{ id, nome, icona, attiva, ordine, sottolinee: [...] }] }`.
Usate `nome` come label canonica (e `id` per riferimenti stabili). Con questo, ogni
volta che l'admin aggiunge/rinomina una linea in Scout, il registro resta allineato.

## Come conservare il match negli invii di Scout
Quando Scout crea/aggiorna un partner (`POST /api/v1/partners`, `sistema=scout`),
manda `interessi: ["Consegne", "Gifting", …]` con i **nomi canonici** qui sopra.
Oggi i nomi fuori catalogo li scartate: dopo l'allineamento **combaceranno tutti**,
così gli interessi salvati e mostrati saranno identici nelle due app.

## Da decidere insieme (2 minuti)
1. Confermate le corrispondenze sopra (soprattutto `vendor`, `in_store`, `pr_activation`).
2. Se una vostra categoria non ha equivalente tra le linee master (es. PR come voce
   distinta), ditemelo: la **aggiungo io alle linee di Scout** (siamo il master), così
   resta comunque un catalogo unico.

Lato Scout non serve nessuna modifica: le linee sono già esposte via API.
