# Regole per Brand — data e ora di consegna

Fonte di verità delle regole di business sulla consegna. Ogni modifica ai temi deve rispettare
queste regole; se l'utente ne detta di nuove, **aggiorna prima questo file**, poi il codice.

Tutti gli orari sono in **ora italiana (Europe/Rome)**.

## deluxyflowers.com

> 10/09/2026: queste regole sono scritte anche nel Customer Service (Orari negozi, preset «Flowers»:
> **drop-off 16:00**, di notte dalle 08, dalle 22 domani dalle 12). Il tema di Flowers NON legge ancora
> l'API del Customer Service: quando lo farà (stesso modulo `DeluxyConsegna` di deluxy.it), la fonte
> sarà quella. Da lì si può anche **chiudere il negozio per oggi** con un bottone.

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

## deluxy.it (e business.deluxy.it)

> ⭐ **Dal 10/09/2026 la FONTE di queste regole è il Customer Service** (deluxy-messaging,
> pagina «Orari negozi», tabella `OrarioNegozio`, motore in `src/lib/orari-regole.ts`).
> Il tema le LEGGE da `GET https://deluxy-messaging.vercel.app/api/pubblico/consegna?dominio=deluxygifts.myshopify.com`
> e costruisce calendari e tendina delle fasce da lì. Le regole cablate nel tema restano solo
> come ripiego se l'API non risponde. Per cambiare una regola: si cambia nel Customer Service,
> non nel tema. Le stesse regole valgono per **business.deluxy.it** (`90bfeb-f5.myshopify.com`).

Regole dettate dall'utente il 10/09/2026 e confermate dall'architetto UX (punti A–F):

- consegne **in giornata (oggi) = fasce di 2 ore** (08-10 … 20-22), **a partire dalla seconda
  fascia dopo quella in corso**: alle 10:30 la fascia in corso è 10-12, si salta 12-14, la prima
  proponibile è **14-16**;
- **dalle 20:00** per oggi non si ordina più: si ordina per domani. Eccezione esplicita
  (confermata): **dalle 18:00 alle 19:59 resta ordinabile la sola 20-22**;
- **di notte (00:00–07:59)** l'anticipo si conta dall'apertura (08:00): prima fascia **10-12**;
- **domani = fasce di UN'ORA** dall'orario minimo del carrello (08-09, 09-10 … 21-22; un prodotto
  dalle 9 → dalle 09-10). Ordinando **dopo le 20:00** la **prima fascia di domani dura due ore** e
  parte dall'orario minimo del carrello (senza vincoli **08-10**, dalle 9 → **09-11**), le ore
  restanti tornano orarie (10-11, 11-12 … / 11-12, 12-13 …). Nessuna fascia fissa da saltare
  (decisione dell'utente, 10/09 notte; scartate la 10-12 fissa dell'architetto e la griglia a 2 ore
  su tutto il giorno);
- **dopodomani e oltre = fasce di 1 ora** (08-09 … 21-22);
- finestra della giornata **08:00–22:00**;
- l'**orario di disponibilità minima** dei prodotti in carrello (massimo dei `custom.minimo_orario`)
  toglie le fasce che cominciano prima, su ogni giorno; il **preavviso** (massimo dei
  `prodotto.consegna`, variante prima del prodotto) toglie i giorni troppo vicini;
- i **giorni di apertura** e i **giorni di chiusura** del negozio (Customer Service → Orari negozi)
  spengono le date, col motivo a video; un giorno senza fasce si spegne, mai tendina vuota.

| Ora dell'ordine (Rome) | OGGI (2h) | DOMANI (1h; dopo le 20 la prima di 2h) | DOPODOMANI+ (1h) |
|---|---|---|---|
| 00:00–07:59 | da 10-12 a 20-22 | 08-09 … 21-22 | 08-09 … 21-22 |
| 08:00–17:59 | dalla 2ª fascia dopo quella in corso (10:30 → 14-16) fino a 20-22 | tutte | tutte |
| 18:00–19:59 | solo 20-22 (eccezione) | tutte | tutte |
| 20:00–23:59 | nessuna | 08-10 poi 10-11 … 21-22 (prima fascia di 2 ore dall'orario minimo, poi orarie) | tutte |

Parametri nel Customer Service (`REGOLE_DELUXY`): finestra 08:00–22:00; oggi durata 2, salta 2,
limite 20:00, ultima fascia fino al limite, notte dalle 10; domani durata 1, salta 0, dopo le 20 la prima fascia dura 2 (`primaFasciaOre`); oltre durata 1.

Note:
- I `value` delle option restano `HH-HH` (`08-10`, `14-15`: lo consuma il resto del tema e
  l'attributo `Fascia_Oraria_Consegna`); l'etichetta per il cliente è `08:00–10:00`.
- Il tema scrive sul carrello l'attributo `Fasce_Fonte` («customer-service (api|cache)») quando le
  fasce vengono dal Customer Service: così a valle si sa da dove viene la scelta.
- Storia: le regole precedenti (implementate il 10/7/2026 nel tema, con «domani orario» e «dopo le
  20 domani da 08-10») restano nel codice come ripiego e in `TEMA_DELUXY_IT.md`.

## cakedesign.me

> 10/09/2026: regole scritte anche nel Customer Service (preset «Cake»: **drop-off 14:00**, di notte
> dalle 12, dalle 20 domani dalle 12). Il tema di Cake NON legge ancora l'API: vale quanto detto per Flowers.

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
