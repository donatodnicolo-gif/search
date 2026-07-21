# Linee di interesse — Scout è il MASTER

Le linee di interesse Deluxy (con le loro **sottolinee**) sono gestite in **Deluxy
Scout**: l'admin le crea/modifica/archivia da **Profilo → Linee di interesse**.
Le altre app **non le hardcodano più**: le leggono dal master via API.

## Endpoint

```
GET https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/linee
Header:  x-api-key: <LINEE_API_KEY>
Query:   ?soloAttive=1   (opzionale) esclude le linee/sottolinee in standby
```

- **Sola lettura.** Auth con chiave condivisa (`x-api-key`), non serve un JWT Supabase.
- La chiave `LINEE_API_KEY` è un secret del master; è stata consegnata a parte.
  Ogni app la tiene come proprio segreto **server-side** (mai nel browser/bundle).

### Risposta

```json
{
  "linee": [
    {
      "id": "uuid",
      "nome": "Consegne",
      "icona": "cube-outline",
      "attiva": true,
      "ordine": 0,
      "pitch": "Consegne guanti bianchi…",
      "sottolinee": [
        { "id": "uuid", "nome": "Multi-città", "icona": null, "attiva": true, "ordine": 0, "pitch": null }
      ]
    }
  ],
  "totale": 9,
  "aggiornato": "2026-07-21T…Z"
}
```

## Come integrarla (lato altra app)

1. Chiama l'endpoint dal **backend** dell'app (server action / route / edge), mai dal client.
2. Metti in **cache** il risultato (es. 1 ora): le linee cambiano di rado.
3. Usa `nome` come valore memorizzato (i negozi/anagrafiche già salvano il nome della linea).
   `id` serve per riferimenti stabili; `attiva=false` = standby (solo cross-sell).

Esempio (Node/fetch):
```ts
const res = await fetch(`${MASTER}/functions/v1/linee?soloAttive=1`, {
  headers: { 'x-api-key': process.env.LINEE_API_KEY! },
});
const { linee } = await res.json();
```

## Note
- 401 = chiave mancante o errata. 500 = master non configurato.
- Le linee archiviate non compaiono. I negozi già assegnati a una linea archiviata
  **mantengono** il valore storico (non viene toccato).
- Master: progetto Supabase Scout `fdsziebgkljfsugqqbqd`, tabella `lines`
  (colonne `parent_id`, `ordine`, `archiviata`, `icona`; migr. 0034).
