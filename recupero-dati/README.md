# Recupero Dati

App desktop (Windows) che, **dato un dispositivo attaccato** — chiavetta USB, scheda SD, disco esterno o interno, e best‑effort i telefoni — **ripesca i file persi o cancellati**, con motore proprietario verificato e aggancio a PhotoRec/TestDisk per i casi difficili.

> Tutto avviene **in locale** e in **sola lettura**: il dispositivo da recuperare non viene mai toccato. I file recuperati si salvano in **un'altra** cartella.

---

## La verità su cosa è recuperabile (leggere prima)

Nessun programma serio recupera *qualsiasi* dato. I limiti sono fisici, non di software:

| Situazione | Recuperabile? |
|---|---|
| File cancellato da chiavetta/SD/disco, spazio **non ancora riscritto** | **Sì**, spesso al 100% |
| File di cui restano i byte ma non i metadati (formattazione veloce) | **Sì** via carving (senza il nome originale) |
| File **sovrascritto** da altri dati | No |
| **SSD / chiavette con TRIM**, dopo la cancellazione | Quasi mai (il controller azzera le celle) |
| **iPhone** collegato al PC | Solo foto/media via MTP. Niente recupero profondo senza jailbreak |
| **Android** collegato al PC | Solo i file presenti via MTP. Niente cancellati senza root |

Chi promette “recupero garantito anche dei file sovrascritti” mente. Questa app fa **il massimo possibile** dentro questi limiti — e lo dice chiaro.

---

## Cosa fa, in pratica

**Passo 0 — Prima controlla se il file esiste ancora.** Spesso il file "perso" vive
ancora da un'altra parte: un'altra cartella, un'altra unità, il Cestino, le copie di
OneDrive/Dropbox. L'app cerca per nome fra i file **esistenti** su tutte le unità e nel
Cestino, in pochi secondi e senza permessi speciali — prima di scomodare il recupero
profondo. E dopo un recupero, per i file ritrovati col nome, un bottone controlla se ne
esistono ancora **copie vive** altrove.

Poi, per i file davvero persi, due strategie complementari eseguite in sequenza:

1. **Undelete via filesystem** — legge le tabelle del filesystem e recupera i file cancellati **con il loro nome**.
   - **FAT32** e **exFAT** (chiavette, SD): verificati.
   - **NTFS** (dischi Windows): sperimentale (vedi sotto).
2. **Carving a firma** — scandisce i byte grezzi cercando l'inizio riconoscibile dei file (JPEG, PNG, PDF, ZIP/DOCX, MP4, SQLite, …) e li ricostruisce **anche quando il filesystem non c'è più** (formattazioni, cancellazioni vecchie). Recupera il contenuto senza il nome originale.

Per i casi ostici c'è l'aggancio a **PhotoRec/TestDisk** (se installati), il gold standard open‑source del carving e del recupero di partizioni.

---

## Verifica reale (non a parole)

`npm test` costruisce immagini‑disco di prova e dimostra il recupero:

- **Carving**: 8 file (PNG, PDF, ZIP, BMP, WAV, GIF, SQLite, JPEG) nascosti a offset arbitrari **senza alcun filesystem**, ripescati **identici byte‑per‑byte**.
- **Undelete FAT32**: file cancellati (marcatore `0xE5` + cluster liberati) recuperati con **nome lungo ricostruito** (`foto delle vacanze.jpg`) e contenuto identico; file a nome corto recuperato segnalando il primo carattere perso (`_EGRETO.PDF`).
- **Parser NTFS**: record `FILE` con fixup, `$FILE_NAME` e `$DATA` residente correttamente interpretati.

```bash
npm test
```

---

## Come si usa

### 1) Interfaccia grafica

Per leggere i dischi grezzi servono i permessi di **amministratore**.

- **Come app desktop (Electron):**
  ```bash
  npm install
  npm run electron
  ```
- **Come pagina locale nel browser:**
  ```bash
  npm start
  ```
  poi apri http://127.0.0.1:4653

Per avviare da amministratore: apri **PowerShell come amministratore** e lancia lì il comando (oppure, per l'exe impacchettato, tasto destro → *Esegui come amministratore*).

Nell'interfaccia: **1** scegli il dispositivo (o un volume, o un file immagine), **2** scegli la cartella di destinazione e la modalità, **3** avvia. I file ritrovati compaiono in tempo reale.

### 2) Riga di comando

```bash
node src/cli.js list                                   # elenca dischi e telefoni
node src/cli.js search WA0011                          # il file esiste ancora? (dischi + Cestino)
node src/cli.js recover \\.\PhysicalDrive2 D:\Recuperati       # recupero completo
node src/cli.js recover immagine.img D:\Recuperati --carve     # solo carving
node src/cli.js recover \\.\E: D:\Recuperati --filesystem --live
node src/cli.js phone "realme 14 5G" WA0011 D:\DalTelefono     # cerca (e copia) nel telefono
node src/cli.js photorec \\.\PhysicalDrive2 D:\Recuperati      # usa PhotoRec
```

### Telefoni: cosa si puo' fare davvero
Il telefono non espone la memoria come disco (MTP + cifratura): niente scansione profonda dei cancellati senza root/jailbreak. L'app pero' **cerca per nome fra i file che il telefono espone** (cestini nascosti `.trashed` inclusi, se visibili) e li **copia sul PC** — dall'interfaccia (clic sul telefono nell'elenco) o da CLI. Serve telefono **sbloccato** con USB in modalita' **"Trasferimento file"**, altrimenti il telefono compare ma espone zero file. Per le foto cancellate, prima di tutto: Galleria → *Eliminati di recente* (30 giorni), Google Foto → *Cestino* (60 giorni, o ancora nel cloud se il backup era attivo), e per le foto WhatsApp riaprire la chat (spesso si riscaricano). Se le foto stavano su **microSD**: estrarla e farle la scansione profonda vera con questa app.

### Buona pratica sui dischi che stanno morendo
Se il disco fa rumori o dà errori di lettura, **prima cloni** (con `ddrescue` o simili) in un file immagine, **poi** recuperi dall'immagine. Così non stressi ulteriormente il disco.

---

## Sicurezza

- Il dispositivo sorgente si apre **solo in lettura** (`fs.open(..., 'r')`), mai in scrittura.
- La destinazione **non può stare sulla stessa unità** da recuperare (l'app lo impedisce): scrivere sulla sorgente sovrascriverebbe proprio i dati da salvare.
- Nessun dato lascia il computer.

---

## Struttura

```
recupero-dati/
  src/
    reader.js            lettura a blocchi (immagine o device grezzo), sola lettura
    devices.js           elenco dischi/telefoni (PowerShell, MTP)
    server.js            server locale + API + streaming eventi (SSE)
    cli.js               riga di comando
    engine/
      signatures.js      database delle firme per il carving
      carver.js          motore di carving
      fat.js             undelete FAT32 + exFAT
      ntfs.js            undelete NTFS (sperimentale)
      photorec.js        aggancio a PhotoRec/TestDisk
      index.js           orchestratore (unisce filesystem + carving)
  public/                interfaccia (Deluxy design system)
  electron/main.js       guscio desktop
  test/                  immagini di prova + verifica del motore
```

Dettaglio tecnico del motore: [docs/COME-FUNZIONA.md](docs/COME-FUNZIONA.md).

---

## Stato

- ✅ Carving (30+ tipi di file) — verificato
- ✅ Undelete FAT32 / exFAT — verificato (FAT32 con test end‑to‑end)
- ✅ Enumerazione dischi/volumi + rilevazione telefoni MTP
- ✅ Interfaccia + CLI + aggancio PhotoRec
- 🧪 Undelete NTFS — parser verificato; scansione MFT su volume reale da collaudare
- 🧪 Copia file da telefono MTP — best‑effort, da collaudare su dispositivo reale

### Impacchettare come .exe (opzionale)
Con `electron-builder` (`requestedExecutionLevel: requireAdministrator` nel target Windows) si ottiene un installer che chiede da solo i permessi di amministratore.
