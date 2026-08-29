# Come funziona il motore

Documento per chi mantiene il codice. La regola d'oro attraversa tutto: **si legge, non si scrive mai** sulla sorgente.

## 1. Lettura a blocchi (`src/reader.js`)

Due sorgenti dietro la stessa interfaccia `read(offset, length) -> Buffer`:

- **ImageReader**: un file immagine (`.img/.dd/.vhd raw`). Lettura a qualsiasi offset.
- **RawDeviceReader**: un device Windows (`\\.\PhysicalDriveN` o `\\.\X:`). Qui ReadFile pretende offset **e** lunghezza allineati al settore: il reader allinea in giù l'offset, in su la fine, legge il blocco allineato e **ritaglia** il pezzo richiesto. La `size` va passata da chi enumera (su `\\.\` lo `stat` torna 0). Un settore illeggibile (disco rovinato) ritorna vuoto invece di far fallire tutto.

## 2. Carving a firma (`src/engine/carver.js` + `signatures.js`)

Ripesca file senza filesystem, in due fasi:

1. **Scansione degli inizi**: si legge tutto a blocchi di 4 MB (con 64 byte di sovrapposizione per le firme a cavallo dei blocchi) e con `Buffer.indexOf` si trovano tutte le occorrenze delle *magic bytes* di ogni tipo.
2. **Estrazione**: per ogni inizio si calcola la fine secondo la strategia del tipo:
   - `scanFooter` — cerca la sequenza di chiusura (JPEG `FF D9`, PNG `IEND`+CRC…).
   - `headerSizeLE` / `riff` / `sqlite` / `mp4box` — la dimensione è scritta nell'intestazione/nei box.
   - `zip` — trova l'*End Of Central Directory* e ne legge il commento.
   - `pdf` — ultima occorrenza di `%%EOF`.
   - `max` — nessun marcatore affidabile: si taglia alla **firma successiva** (`bound`), così una firma falsa non si ingoia i file dopo.

   Dopo un file con fine *certa* si salta lo spazio già preso (`carvedUntil`), per non ripescare come file a sé i flussi annidati (es. la miniatura dentro un JPEG).

Aggiungere un tipo = una riga in `signatures.js` (magic in esadecimale, eventuale seconda magic per disambiguare, strategia di fine, dimensioni min/max).

**Limite noto**: un JPEG con miniatura incorporata può essere tagliato all'`FF D9` della miniatura. PhotoRec gestisce questi casi con euristiche più fini: è per questo che c'è l'aggancio.

## 3. Undelete FAT32 / exFAT (`src/engine/fat.js`)

Si legge il boot sector per la geometria (settore, cluster, inizio area dati), si cammina l'albero delle directory e si raccolgono le voci **cancellate**:

- **FAT32**: voce da 32 byte; cancellata = primo byte `0xE5`. Restano intatti primo cluster e dimensione. Il nome lungo si ricostruisce dalle voci **LFN** (attributo `0x0F`) che precedono la voce corta, in ordine inverso. Il **primo carattere** del nome corto è perso (rimpiazzato da `0xE5`): si mette `_`.
- **exFAT**: insieme di voci — File (`0x85`, cancellata `0x05`), Stream Extension (`0xC0`/`0x40`, con `NoFatChain` e prima‑cluster/dimensione), File Name (`0xC1`/`0x41`). Nome in UTF‑16.

**Assunzione chiave**: alla cancellazione la catena dei cluster nella FAT viene azzerata, quindi si assume che il file fosse **contiguo** dal primo cluster per `dimensione/clusterSize` cluster. Se il file era frammentato, il recupero può essere parziale — è un limite fisico dell'undelete FAT, non un bug.

I volumi si trovano provando l'offset 0 (superfloppy) e le partizioni della **tabella MBR**.

## 4. Undelete NTFS (`src/engine/ntfs.js`) — sperimentale

Si individua la `$MFT`, si scorrono i record `FILE` (1024 byte tipici): si applicano i **fixup** della Update Sequence Array, si legge il flag “in uso” (azzerato = cancellato), si estrae il nome da `$FILE_NAME` e il contenuto da `$DATA`:

- **residente**: il contenuto è dentro il record (file piccoli).
- **non residente**: si decodificano i **data run** (coppie lunghezza/offset relativi) per leggere i cluster reali — così la **frammentazione è gestita**, a differenza di FAT.

Il parser dei record è verificato con un record costruito a mano (`npm test`). La scansione dell'intera MFT su un volume reale è ancora da collaudare: intanto il **carving** recupera comunque il *contenuto* dei file NTFS.

## 4b. Ricerca fra i file esistenti (`src/search.js`)

Il "passo 0" dell'app: prima del recupero profondo si controlla se il file vive ancora
da qualche parte. Due sorgenti:

- **Dischi**: camminata di tutte le unità (`C:`–`Z:`) con `readdirSync`, saltando le
  cartelle che non contengono file dell'utente (`Windows`, `Program Files`,
  `ProgramData`, `node_modules`, `.git`, `$Recycle.Bin`…) e i symlink/junction (evita i
  cicli). Il confronto è per sottostringa del nome, senza distinzione di maiuscole.
  **Attenzione**: la camminata è sincrona per velocità, quindi **deve** cedere il passo
  all'event loop (`await breathe()` ogni 25 cartelle), altrimenti il server si blocca e
  gli eventi SSE non partono — è un bug già pagato.
- **Cestino**: PowerShell + `Shell.Application` namespace 10 (nome, cartella d'origine,
  data di cancellazione). Lanciato con `spawn` asincrono, mai `spawnSync`.

Stessa infrastruttura eventi del recupero (`match` / `search-progress` / `done` via SSE).
Dopo un recupero, l'interfaccia propone il controllo delle **copie vive** dei file
ritrovati col nome (una sola camminata, confrontata con l'insieme dei nomi, max 100).

## 5. Dispositivi (`src/devices.js`)

- **Dischi**: PowerShell `Get-Disk`/`Get-Partition`/`Get-Volume` → JSON. Danno percorso grezzo, dimensione (che serve al reader), settore logico, bus (USB/NVMe/SD), volumi.
- **Telefoni**: `Shell.Application` (namespace 17). MTP **non** è un disco a blocchi: si copiano solo i file presenti, nessun recupero profondo.
- **Ricerca nel telefono** (`phoneSearch`): camminata ricorsiva dello spazio-nomi shell del
  dispositivo con PowerShell (`spawn` asincrono, output a righe `MATCH|`/`PROG|`/`DONE|`
  parsato in streaming), confronto per sottostringa del nome, copia opzionale con
  `CopyHere` (che è **asincrona**: dopo la camminata si aspetta che i file arrivino
  davvero nella destinazione). Trappole: se il telefono è bloccato o l'USB è in "Solo
  ricarica", il dispositivo compare ma espone **zero** item (`files=0` → messaggio
  dedicato); i nomi visti via shell possono nascondere l'estensione, quindi il match va
  fatto sulla parte di nome, non sull'estensione. Endpoint: `POST /api/phone-search`
  (stessi eventi SSE della ricerca); CLI: `phone "<nome>" <pattern> [dest]`.

## 6. Orchestrazione e interfaccia

`engine/index.js` esegue undelete‑con‑nome poi carving, emettendo eventi (`phase`/`progress`/`file`/`done`). `server.js` li inoltra al browser via **SSE**; `electron/main.js` apre la stessa interfaccia in una finestra desktop. Il recupero può essere fermato con un `AbortController`.
