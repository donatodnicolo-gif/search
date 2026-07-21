# Richiesta a Deluxy Partner (FINANCE) — riepilogo finanziario per cliente

Deluxy Scout mostra sulla scheda di un cliente **quanto sta facendo**: fatturato
dell'anno e andamento mensile. I dati vivono in Deluxy Partner (`riepilogoPartner`
in `src/lib/queries.ts` calcola già mesi + rolling). Serve un endpoint pubblico
che Scout possa interrogare **per nome cliente** (Scout non conosce il vostro
`partnerId`).

## Endpoint richiesto
```
GET /api/riepilogo-finanziario?partner=<nome o id>
Header:  X-API-Key: <chiave>        (la stessa di /api/proforma, /api/verifiche)
```
Risoluzione del partner **come in /api/proforma** (`trovaPartner`: per id, poi per
nome; se ambiguo tornate `candidati`).

### Risposta attesa (200)
```json
{
  "trovato": true,
  "partner": "Bonpoint",
  "anno": 2026,
  "fatturato": 48250.00,        // totale anno corrente (servizi + vendite, come nel rolling)
  "fatturatoPrec": 39100.00,    // totale anno precedente
  "variazionePct": 23.4,        // (fatturato-fatturatoPrec)/fatturatoPrec*100, null se prec=0
  "mesi": [                     // andamento anno corrente, 1..12 (0 se nessun dato)
    { "mese": 1, "valore": 3200 },
    { "mese": 2, "valore": 4100 }
  ],
  "aggiornato": "2026-07-21T…Z"
}
```
Se il partner non è nel FINANCE: **`200 { "trovato": false }`** (non 404, così Scout
distingue "cliente senza dati" da "endpoint assente"). Partner non trovato per nome
ambiguo: `404 { errore, candidati: [...] }` come /api/proforma.

### Note
- `fatturato`/`mesi.valore` = il totale che considerate "fatturato" nel riepilogo
  (indicativamente `rolling` / somma mensile di fatture servizi + vendite vendor).
  Ditemi voi quale aggregato è quello giusto da esporre.
- Sola lettura. Nessun dato sensibile oltre gli importi aggregati.

## Lato Scout: già pronto
- Edge Function `proforma`, azione **`riepilogo`** → `GET /api/riepilogo-finanziario`
  con la chiave (dal vault hub, fallback env).
- `lib/partner.ts` → `riepilogoFinanziario(nome)` (tollerante).
- Card **Finance** sulla scheda del cliente: fatturato anno, variazione % vs anno
  precedente, mini-grafico dell'andamento mensile. Compare **solo** quando l'endpoint
  risponde con dati; finché non esiste, semplicemente non si vede (nessun errore).

Appena l'endpoint è live, la card si popola da sola — nessun'altra modifica a Scout.
