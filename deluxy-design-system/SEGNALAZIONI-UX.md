# Segnalazioni UX&UI

Registro delle segnalazioni di interfaccia, per tutte le app dell'ecosistema Deluxy.
Chi trova un difetto di layout o propone un cambiamento **non lo risolve in autonomia**: lo scrive qui,
e il custode (`architetto-ux`) decide se è una correzione locale, una regola nuova del Libro valida per
tutte le app, o una deroga da annotare nel README dell'app.

Ogni voce porta: data, app, cosa non va, chi l'ha vista, stato.

---

## 2026-09-11 · Piattaforma consegne · L'ordinamento delle tabelle non viene controllato in revisione

**Segnalata da**: l'utente, guardando la sezione «Merce in sede» appena costruita.
**Stato**: da decidere (regola già nel Libro, il controllo manca).

**Il fatto.** La sezione «Merce in sede» (`web/src/app/pages/merce-in-sede.component.ts`) è nata con
tabelle **non ordinabili**: nessun click sull'intestazione, nessuna freccia di direzione. È passata da
una revisione critica completa del custode, che ha prodotto quattordici rilievi puntuali — e
l'ordinamento non era fra quelli.

**Perché è grave.** Non è una regola nuova: sta **già** nel Libro UX&UI, §8 riga 189, «ordinamento dal
click sull'intestazione con freccia di direzione, preservando i filtri (componente riferimento: Finance
`ThSort.tsx`)», e alla riga 211 c'è pure la regola gemella per il mobile. Una regola scritta che una
revisione non controlla è, in pratica, una regola che non esiste.

**Cosa si chiede al custode.**
1. Mettere l'ordinamento nella **lista di controllo fissa** di ogni revisione di una tabella, accanto a:
   intestazioni sticky, stati di vuoto/errore/caricamento, conteggio dei record, filtri, mobile,
   tastiera. Una revisione che non nomina l'ordinamento è incompleta.
2. Valutare se le voci del §8 che oggi sono prosa debbano diventare un **elenco di collaudo** numerato,
   così che una revisione possa dichiarare punto per punto cosa ha verificato e cosa no.

**Nel frattempo**: l'ordinamento è stato aggiunto alla sezione «Merce in sede» (tutte le colonne, click
sull'intestazione, freccia, e i numeri ordinati come numeri).

---

## 2026-09-11 · Piattaforma consegne · Manca il pulsante «indietro» quando si scende di livello

**Segnalata da**: l'utente, guardando «Merce in sede».
**Stato**: da decidere (regola già nel Libro, il controllo manca).

**Il fatto.** In «Merce in sede» l'ufficio entra dentro un detentore e passa dall'elenco dei partner ai
suoi prodotti. Per tornare indietro c'era solo un «← Tutti» **dentro la barra dei filtri**, cioè in mezzo
ai controlli, non dove si cerca un ritorno. Il tasto «indietro» del browser, poi, usciva dalla pagina
invece di risalire di un livello, perché il detentore scelto viveva solo in memoria e non nell'indirizzo.

**Perché è grave.** Vale lo stesso ragionamento dell'ordinamento: non è una regola nuova. Il §2 del Libro
dice che si torna al punto esatto da cui si è partiti, e il §8 chiede lo stato della vista
nell'indirizzo. Una navigazione a livelli senza un ritorno dichiarato lascia chi guarda senza uscita
evidente, e il gesto che tutti provano per primo — il tasto indietro — fa la cosa sbagliata.

**Cosa si chiede al custode.** Mettere nella lista di controllo fissa di ogni revisione, accanto
all'ordinamento, queste due domande: **c'è un ritorno visibile in alto quando si scende di livello?** e
**lo stato della vista sta nell'indirizzo, così che «indietro» e un link condiviso funzionino?**

**Nel frattempo**: aggiunto un «← Indietro» in cima alla pagina, fuori dai filtri, e il detentore scelto
è stato messo nell'indirizzo, così il tasto del browser risale di un livello.

---

## 2026-09-11 · Piattaforma consegne · La zona filtri dell'elenco consegne è quattro volte il tetto

**Segnalata da**: il custode, durante la revisione di «Merce in sede».
**Stato**: da decidere. **Priorità alta** (pagina aperta ogni giorno).

Il §8 fissa il tetto della zona filtri a **2 righe, circa 70-90px**, con la misura di collaudo «a 375×812
la prima riga dell'elenco compare nella prima schermata». In `deliveries-list.component.ts` fra titolo,
tre righe di filtri, legenda e conteggio si superano i **400px**.

Conseguenza misurata: il contenitore della tabella, alto `100vh - 240px`, finiva **sotto il bordo dello
schermo**, e con lui la barra di scorrimento orizzontale. Per raggiungerla si scorreva la pagina e la
prima consegna usciva di scena. È stato messo un cerotto (`AltezzaViewportDirective`, che misura invece
di indovinare), ma la causa resta la zona filtri fuori misura.

---

## 2026-09-11 · Piattaforma consegne · Un reso che il partner non accetta mai non ha via d'uscita

**Segnalata da**: il custode, durante la revisione di «Merce in sede».
**Stato**: da fare. Il custode la considera **la più grave** fra le cose non costruite.

Il flusso «merce riportata in boutique → il partner accetta il reso» non ha una chiusura d'ufficio. Se il
partner non accetta mai, la riga resta appesa per sempre e il contatore dei resi in attesa diventa
inservibile. Serve: l'età in giorni scritta nella riga, una coda di lavoro per l'ufficio, e una
«chiusura d'ufficio» con motivo obbligatorio e nome di chi chiude. **Un timer non chiude mai da solo un
fatto fisico**: può sollecitare, non testimoniare.

Collegata: `GET /deliveries/resi-da-accettare` esiste e nessuno la chiama dal web. Un'API viva senza
schermata è la promessa di una pagina che non c'è: o nasce la schermata, o si toglie la rotta.

---

## 2026-09-11 · Tutte le app · Il contatore di lavoro non deve contare l'archivio

**Segnalata da**: il custode, durante la revisione di «Merce in sede».
**Stato**: proposta di voce per il Libro (§6, Avvertenze sul dato).

Un badge o una pillola che dichiara «c'è del lavoro qui» deve contare **solo record ancora azionabili**.
Se la stessa tabella contiene un archivio importato, il contatore porta il taglio scritto accanto
(«49 pezzi · ultimi 90 giorni») oppure non si mostra. Un numero che non può mai scendere smette di essere
letto, e trascina con sé tutti gli altri segnali dell'app.

Caso reale: «destinazione da stabilire» nasceva a 2.174 pezzi mescolando il 2019 con i 14 casi vivi degli
ultimi trenta giorni. Con il taglio dichiarato sono 49.

---

## 2026-09-11 · Tutte le app · Il numero e il suo elenco devono avere lo stesso perimetro

**Segnalata da**: il custode, durante la revisione di «Merce in sede».
**Stato**: proposta di voce per il Libro (§8).

Una cifra aggregata che si apre su un dettaglio deve costruire l'elenco con **le stesse condizioni** che
hanno generato la cifra: stesso raggruppamento, stesso filtro di attribuzione, stessa variante, stesso
periodo. Un link che atterra su un insieme più largo è una bugia, non una scorciatoia.

Caso reale: la tabella diceva «in sospeso 3», il dettaglio ne sommava quaranta, perché i due livelli
attribuivano la merce con due regole diverse. Corretto.

---

## 2026-09-11 · Tutte le app · Una deroga alle schede su mobile vive nel foglio globale

**Segnalata da**: il custode, durante la revisione di «Merce in sede».
**Stato**: proposta di voce per il Libro (§8, blocco mobile).

Se una tabella ha bisogno su telefono di una forma diversa dalle schede etichettate, quella forma nasce
come **classe nel foglio globale** (riusando `data-label`) e la deroga si annota nel README dell'app.
Mai come media query dentro il componente: il blocco globale è `!important` per costruzione, quindi la
media query locale non vince, e lascia una schermata a metà fra due disegni.

Caso reale: su telefono i quattro numeri della merce uscivano **senza etichetta**, perché l'unica regola
del componente che vinceva scriveva il nome da un attributo che nessuno scriveva. Rimossa.
