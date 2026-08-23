# Import dei dati dal database originario (app.deluxy.it, MySQL)

Questa cartella riceve gli **export di phpMyAdmin** del database legacy.
È il punto di partenza per portare i dati veri nel nuovo ambiente.

> 🔒 **I file di dati non vengono mai committati.** Il `.gitignore` del repo ignora
> tutto quello che c'è qui dentro tranne questo README: sono dati di clienti reali.
> Non incollarli in chat, non metterli in un commit, non caricarli altrove.

## Cosa esportare, e in che ordine

Non serve tutto il database in un colpo solo. **Prima si misura, poi si progetta.**
Per il primo giro bastano queste sei tabelle:

| Tabella legacy | Diventerà | Perché serve per prima |
|---|---|---|
| `provinces` | `Province` | piccola, senza dipendenze: è la prova del nove del formato |
| `partner` | `Partner` | tutto il resto si aggancia qui |
| `expert` | `Valet` | «expert» nel legacy = valet nel nuovo |
| `customer` | `Customer` | destinatari delle consegne |
| `product` | `Product` | catalogo |
| `delivery` | `Delivery` | la più grossa e la più diversa (~90 colonne contro ~20) |

### Come si esporta da phpMyAdmin

1. Seleziona il database → scheda **Esporta**
2. Metodo **Personalizzato**, così puoi scegliere le tabelle
3. Formato **SQL** (va bene anche **CSV**, un file per tabella)
4. In *Opzioni di generazione dati*: lascia **struttura e dati**
5. Salva i file **in questa cartella**

💡 Se il database è grosso, per il primo giro esporta pure **solo la struttura più
poche centinaia di righe** per tabella (in phpMyAdmin: *Esporta* → `LIMIT`). Serve a
capire com'è fatta la realtà, non a caricare ancora niente.

## Poi

```bash
node C:/Users/nicol/app/deluxy-platform-next/scripts/profila-export-legacy.mjs
```

Il profilatore **non importa niente e non tocca nessun database**: legge i file e
riporta, tabella per tabella, quante righe ci sono, quanto è piena ogni colonna e
quali valori distinti contiene.

Serve a rispondere alle domande che la documentazione **non** può rispondere:

- quali colonne delle ~90 di `delivery` sono davvero popolate, e quali sono
  **sempre vuote** (quelle non vanno mappate: nel nuovo schema sarebbero campi finti);
- quali stati esistono per davvero, contro i 14 dichiarati in
  [../docs/ANALISI-BACKEND-LEGACY.md](../docs/ANALISI-BACKEND-LEGACY.md);
- dove il legacy contraddice la propria documentazione.

Solo dopo si scrive la mappatura campo-per-campo, e solo dopo ancora l'importatore.

## Perché in quest'ordine

`docs/ANALISI-BACKEND-LEGACY.md` descrive 76 entità lette dal **codice**, non dai
**dati**. Il 21/08/2026 la produzione è rimasta giù 26 giorni perché un'inferenza
scritta in un documento è stata letta come un fatto per tre sessioni di fila.
Qui la regola è la stessa: **si misura, non si deduce**.

Vale anche la regola di casa sui dati critici: consegna, stato, biglietto e simili
**non si ricavano dal testo libero**. Se un campo non c'è, il nuovo record dice
«non indicato» — non inventa un valore plausibile.
