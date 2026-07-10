# Regole per Brand — data e ora di consegna

Fonte di verità delle regole di business sulla consegna. Ogni modifica ai temi deve rispettare
queste regole; se l'utente ne detta di nuove, **aggiorna prima questo file**, poi il codice.

Tutti gli orari sono in **ora italiana (Europe/Rome)**.

## deluxyflowers.com

Fasce orarie standard: `08:00-12:00`, `12:00-16:00`, `16:00-20:00`.

**Prima data selezionabile sul calendario (carrello, header, pagina prodotto, home):**

| Ora dell'ordine | Prima data di consegna |
|---|---|
| fino alle 15:59 | **oggi** |
| dalle 16:00 | **domani** |

**Fasce disponibili per il giorno selezionato:**

| Ora dell'ordine | Consegna OGGI | Consegna DOMANI | Dopodomani e oltre |
|---|---|---|---|
| < 8:00 | tutte le fasce | tutte | tutte |
| 8:00–11:59 | dalle 12:00 (no 08-12) | tutte | tutte |
| 12:00–15:59 | dalle 16:00 (solo 16-20) | tutte | tutte |
| 16:00–21:59 | ✕ non disponibile | tutte | tutte |
| dalle 22:00 | ✕ non disponibile | **dalle 12:00** (no 08-12) | tutte |

Note:
- Il lead time del prodotto (`prodotto.consegna` > 0) sposta comunque in avanti la prima data
  (es. consegna=1 → prima data domani anche di mattina). Il cutoff delle 16:00 si applica solo
  ai prodotti con consegna in giornata (consegna=0).
- Implementate nel tema il 9/7/2026 (tema "Version to work on"). Dettagli tecnici in
  `TEMA_DELUXYFLOWERS.md`.

## deluxy.it

A differenza degli altri due, deluxy.it usa **fasce granulari** (non 3 fasce standard):
- consegne **in giornata (oggi) = fasce di 2 ore**: 08-10, 10-12, 12-14, 14-16, 16-18, 18-20, 20-22
- consegne **dal giorno dopo = fasce di 1 ora**: 08-09, 09-10, … 21-22 (consegne fino alle 22:00)

**Prima data selezionabile sul calendario (carrello, header, prodotto, home):**

| Ora dell'ordine | Prima data di consegna |
|---|---|
| fino alle 19:59 | **oggi** |
| dalle 20:00 | **domani** |

**Fasce disponibili per il giorno selezionato:**

| Ora dell'ordine | Consegna OGGI (fasce 2h) | Consegna DOMANI (fasce 1h) |
|---|---|---|
| 00:00–07:59 | dalle 10:00 (10-12, 12-14, … 20-22) | tutte (08-09 … 21-22) |
| 08:00–17:59 | fasce con inizio ≥ ora+2 (anticipo 2h), fino a 20-22 | tutte |
| 18:00–19:59 | solo ultima fascia 20-22 | tutte |
| 20:00–23:59 | ✕ non disponibile | prima fascia **08-10** poi orarie (10-11 … 21-22) |

Note:
- **Anticipo minimo 2h** per le consegne in giornata: una fascia 2h `[a, a+2]` è offerta se
  `a ≥ ora_attuale + 2`. Eccezione: l'ultima fascia **20-22** resta ordinabile fino alle 20:00.
- Notte (00:00–08:00): consegne in giornata solo **dalle 10:00** in poi (prima fascia 10-12).
- Ordine serale (20:00–24:00): consegna solo il giorno dopo, con prima fascia **08:00-10:00**
  (2h) e poi fasce orarie — regola esplicita del brand.
- Il metafield `custom.minimo_orario` del prodotto filtra le fasce con inizio < quel valore.
- `prodotto.consegna` (lead time) sposta in avanti la prima data; il cutoff 20:00 vale solo
  per consegna in giornata (consegna=0).
- Implementate il 10/7/2026 sul tema "Version to work on". Dettagli in `TEMA_DELUXY_IT.md`.

## cakedesign.me

Fasce orarie standard: `08:00-12:00`, `12:00-16:00`, `16:00-20:00`.

**Prima data selezionabile sul calendario (carrello, header, pagina prodotto, home):**

| Ora dell'ordine | Prima data di consegna |
|---|---|
| fino alle 13:59 | **oggi** |
| dalle 14:00 | **domani** |

**Fasce disponibili per il giorno selezionato:**

| Ora dell'ordine | Consegna OGGI | Consegna DOMANI | Dopodomani e oltre |
|---|---|---|---|
| 00:00–7:59 | dalle 12:00 (no 08-12) | tutte | tutte |
| 8:00–13:59 | dalle 16:00 (solo 16-20) | tutte | tutte |
| 14:00–19:59 | ✕ non disponibile | tutte | tutte |
| dalle 20:00 | ✕ non disponibile | **dalle 12:00** (no 08-12) | tutte |

Note:
- La riga 00:00–7:59 deriva dalla regola "ordini dalle 20:00 alle 8:00 → consegna il giorno
  successivo (alla serata) dalle 12:00": alle 6 di mattina quel "giorno successivo" è oggi.
- La riga 8:00–13:59 mantiene il comportamento pre-esistente del tema (consegna in giornata
  dalle 16:00); prima il cutoff era alle 13:00, ora esteso alle 14:00.
- Il lead time prodotto (`prodotto.consegna` > 0) sposta in avanti la prima data; il cutoff
  delle 14:00 vale solo per prodotti con consegna in giornata (consegna=0).
- Implementate nel tema "Version to work on" il 10/7/2026. Dettagli in `TEMA_CAKEDESIGN.md`.
