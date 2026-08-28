# Deluxy Design System

**Versione 1.4 — 27 agosto 2026** · *1.1: componente «Avvisi (toast)». 1.2: componente «Scelta data — il «/» dentro un campo». 1.3: la barra vale in QUALUNQUE punto della riga (non solo in fondo) e togliendola il pannello si chiude. 1.4: nasce il **Libro UX&UI** ([LIBRO-UX-UI.md](LIBRO-UX-UI.md)) e arrivano i token: tinte `-soft` dei semantici, `on-ink`, `grey`, `scrim`, `amber` (solo legenda consegne), `surface-sunken`, `touch-min`, coppia del gradiente logo, soglia mobile 900.*

Il linguaggio visivo ufficiale di tutte le app Deluxy. Nato dal redesign di `deluxy-platform-next` (stile Apple), vale d'ora in poi per **ogni app esistente e nuova**: piattaforma web, Deluxy Scout, app fornitori, siti Shopify, landing page.

> Regola d'oro: **prima di disegnare qualsiasi schermata si parte da questo documento**, non dal gusto del momento. Se serve qualcosa che qui non c'è, si aggiunge qui prima, poi si usa nell'app.
>
> **Per i pattern d'uso — navigazione, form, tabelle, stati, feedback, conferme, mobile — la fonte è il [Libro UX&UI](LIBRO-UX-UI.md)** (v1.0, 27/08/2026): questo documento dà i materiali (token e componenti), il Libro dice come si compongono e quale implementazione fa da riferimento. In caso di contrasto su un pattern vince il Libro; su un token vince questo file.

---

## Gerarchia del sistema

```
1. PRINCIPI      → perché (le 4 regole che decidono ogni dubbio)
2. FONDAMENTA    → token: colore, tipografia, spazio, forma, elevazione, motion
3. COMPONENTI    → bottoni, campi, card, tabelle, badge, navigazione
4. PATTERN       → come si compone una pagina, una lista, un form, gli stati
5. PIATTAFORME   → come si applica su web / mobile / Shopify
```

Un livello può usare solo ciò che è definito nel livello sopra: i componenti usano solo token, i pattern usano solo componenti.

---

## 1. Principi

1. **Chiarezza prima di tutto.** Il contenuto è il protagonista: sfondi neutri, testo scuro, un solo accento (l'oro Deluxy). Se un elemento non aiuta a capire o ad agire, si toglie.
2. **Lusso = sottrazione.** Il senso premium nasce da spazio bianco generoso, bordi hairline, ombre soffici e tipografia curata — mai da decorazioni, gradienti forti o colori accesi.
3. **Un accento, usato poco.** L'oro (`#B8963E`) segna identità e punti chiave (logo, icona attiva, focus). Le azioni primarie sono **nere** (ink), non oro: l'oro si consuma se usato ovunque. **L'oro non è mai un colore di stato né di validazione** (Libro, cap. 5).
4. **Tutto risponde.** Ogni elemento interattivo ha hover, active (scale 0.97–0.98) e focus visibile. Le transizioni sono brevi (150–200 ms) e con easing morbido.

## 2. Fondamenta (token)

I valori canonici vivono in [`tokens/tokens.json`](tokens/tokens.json); `tokens.css` (web) e `theme.ts` (React Native) li implementano. **Mai hardcodare un valore che esiste come token.**

### 2.1 Colore

| Token | Valore | Uso |
|---|---|---|
| `bg` | `#F5F5F7` | Sfondo pagina (sempre, mai bianco pieno) |
| `surface` | `#FFFFFF` | Card, tabelle, superfici |
| `surface-translucent` | `rgba(255,255,255,0.72)` + blur 24px | Sidebar, barre, overlay (effetto vetro) |
| `surface-sunken` | `#ECECEF` | **Solo** incassi dentro card: sfondo di segmented/quick-tabs e blocchi codice/chiave. Nient'altro (v1.4) |
| `on-ink` | `#FFFFFF` | Testo e icone su `ink`, `gold` e superfici scure (v1.4) |
| `text` | `#1D1D1F` | Testo primario |
| `text-secondary` | `#6E6E73` | Sottotitoli, caption |
| `text-tertiary` | `#86868B` | Placeholder, label colonne |
| `hairline` | `rgba(0,0,0,0.08)` | Bordi, divisori |
| `hairline-strong` | `rgba(0,0,0,0.14)` | Bordi di campi input |
| `fill` / `fill-hover` / `fill-active` | `rgba(120,120,128,0.08/0.14/0.20)` | Riempimenti neutri (hover, selezione, bottoni secondari) |
| `ink` / `ink-hover` | `#111318` / `#2A2D35` | Azioni primarie, brand scuro (l'hover NON si scrive a mano: è token) |
| `gold` / `gold-strong` | `#B8963E` / `#A07F2C` | Accento brand (icone attive, focus, avatar) |
| `gold-soft` | `rgba(184,150,62,0.12)` | Sfondi tinta oro |
| `blue` / `blue-soft` | `#0071E3` / `rgba(0,113,227,0.10)` | Stato informativo / in corso |
| `green` / `green-soft` | `#248A3D` / `rgba(36,138,61,0.11)` | Successo / completato |
| `orange` / `orange-soft` | `#C93400` / `rgba(201,52,0,0.10)` | Attenzione / da gestire / attende un'azione |
| `red` / `red-soft` | `#D70015` / `rgba(215,0,21,0.09)` | Errore / annullato / richiede intervento adesso |
| `purple` / `purple-soft` | `#6D3FC4` / `rgba(109,63,196,0.10)` | Stato speciale (es. in consegna) |
| `grey` | `#8A8A8E` | Stato neutro/terminato (annullata, archiviata, bozza) — testo del badge neutro (v1.4) |
| `amber` | `#E6B800` | **Solo** legenda storica consegne della piattaforma («In gestione»), sempre accompagnato dal testo dello stato. Vietato altrove (v1.4, Libro cap. 5) |
| `scrim` | `rgba(0,0,0,0.32)` | Velo dietro modali e drawer — un valore solo, mai a mano (v1.4) |
| `logo-dark-a` / `logo-dark-b` | `#1D1F26` / `#3A3D47` | I due capi del gradiente del logo (v1.4) |

Regole: i colori semantici si usano **solo** per stati e feedback, sempre in coppia "tinta `-soft` di sfondo + testo pieno" (es. badge). Il rosso pieno solo per errori e azioni distruttive. Le categorie senza significato di stato (provenienza, tipologia) **non** usano i semantici: v. Libro cap. 5.

### 2.2 Tipografia

Font di sistema, sempre: `-apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI Variable', 'Segoe UI', system-ui, Roboto, sans-serif` (su mobile: San Francisco/Roboto nativi). Niente webfont custom, con un'eccezione: la **"D" del logo** in Georgia/serif.

| Ruolo | Size / weight / tracking | Uso |
|---|---|---|
| `title-xl` | 32px · 600 · −0.025em | Titolo pagina |
| `title-l` | 24px · 600 · −0.022em | Titolo modale/sezione grande |
| `title-m` | 19px · 600 · −0.02em | Titolo card, empty-state |
| `body` | 15px · 400 · 0 | Testo base |
| `body-s` | 13.5–14px · 400 | Tabelle, form, nav |
| `caption` | 12–13px · 400 | Caption sotto i titoli, note |
| `label` | 11px · 600 · +0.06em MAIUSCOLO | Etichette di sezione (es. sidebar) — **non** le label dei campi form (quelle: 12.5px/500, Libro cap. 4) |

Ogni titolo pagina ha sotto una **caption** grigia (`text-secondary`, 14px) che spiega la sezione in una frase.

### 2.3 Spazio

Scala base 4pt: `4, 8, 12, 16, 20, 24, 32, 44`. Padding contenuto pagina: 36–44px desktop, 16–20px mobile. Le card respirano: minimo 24px di padding interno (32+ per empty-state).

### 2.4 Forma (radius)

| Token | Valore | Uso |
|---|---|---|
| `radius-s` | 8px | Elementi piccoli (icone-bottone) |
| `radius-m` | 12px | Campi input, gruppi |
| `radius-l` | 18px | Card, tabelle, modali (24px per card hero/login) |
| `radius-pill` | 980px | Bottoni, badge di stato |

### 2.5 Elevazione

Due sole ombre:
- `shadow-card`: `0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)` — card e tabelle
- `shadow-float`: `0 4px 12px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.12)` — modali, popover, card login

L'elevazione si dà con ombra + hairline, **mai** con bordi scuri o ombre dure.

### 2.6 Motion

- Easing unico: `cubic-bezier(0.25, 0.1, 0.25, 1)`
- Durate: 150 ms (press/hover), 180–200 ms (colore/bordo), 250–300 ms (comparsa overlay)
- Press: `scale(0.97)` sui bottoni, `scale(0.98)` sulle card cliccabili
- Mai animazioni decorative o che ritardano l'utente.

### 2.7 Tocco e soglie (v1.4)

- `touch-min`: **44px** — altezza/area minima di ogni elemento interattivo su puntatore touch (`pointer: coarse`). Il padding 8×18 dei bottoni resta la forma desktop: su touch si aggiunge `min-height: var(--touch-min)`. 24px è solo il minimo legale WCAG 2.5.8, mai l'obiettivo.
- **Soglia mobile: 900px** — una costante documentata per app (i breakpoint non sono tokenizzabili in CSS puro: ogni app dichiara la sua costante in UN punto e la riusa; il valore canonico per le app nuove è 900). La piattaforma consegne resta a 800 come **deroga annotata** finché non migra in un colpo solo verificato (Libro cap. 10).
- Input su mobile: `font-size ≥ 16px` (sotto, iOS zooma al focus e non torna indietro — misurato due volte nel parco).

## 3. Componenti

### Bottoni (sempre a pillola)
- **Primario**: sfondo `ink`, testo `on-ink`, hover `ink-hover`
- **Secondario**: sfondo `fill`, testo `text`, hover `fill-hover`
- **Oro** (solo momenti di brand, es. CTA marketing): sfondo `gold`, testo `on-ink`
- **Distruttivo**: testo `red` su `fill`, o rosso pieno solo dopo conferma
- Padding 8×18 (13px verticale per CTA grandi), font-weight 500–600, disabled = opacity 0.55
- API delle classi e azioni di riga: Libro cap. 3 (`.btn` nudo = secondario; il link sottolineato non è mai un'azione).

### Campi input
- Bordo `hairline-strong`, radius 12, padding 8–13×12–14, sfondo `surface`
- Focus: bordo `gold` + anello `0 0 0 4px gold-soft`
- Nei form brevi (login): campi **raggruppati** in un unico contenitore con divisori hairline interni (stile iOS)

### Card
- `surface` + `hairline` + `radius-l` + `shadow-card`. Nessun header colorato.

### Tabelle
- Dentro una card; intestazioni 12px `text-tertiary` peso 500 (niente maiuscolo urlato), sticky
- ⚠️ Lo sticky funziona **solo** se il wrapper scrollabile ha una `max-height`: senza, le intestazioni se ne vanno con la pagina (misurato: th a top −66). Nota obbligatoria, v. Libro cap. 8.
- Righe con hover `rgba(120,120,128,0.05)`, divisori hairline, ultima riga senza bordo
- Numeri allineati a destra con `tabular-nums`; celle vuote = "—"

### Badge di stato (pillole)
- Pillola con **dot** colorato + testo, tinta di sfondo `-soft` + testo semantico pieno; il dot eredita `currentColor`
- Mappa stati Deluxy: da gestire=orange · in gestione/accettata=blue · in consegna=purple · consegnata=green · annullata/non consegnata=red · neutro=fill+`grey`
- La piattaforma consegne usa la **legenda storica** come deroga annotata (Libro cap. 5): mappa unica per app, mai copie.

### Avvisi (toast)

Il riquadro che compare **in basso a destra** quando succede qualcosa mentre
guardi un'altra cosa: è arrivato un messaggio, è entrato un ordine, qualcuno ha
pagato. Non è un errore e non è una conferma di un'azione tua — quelli restano
dove sono (fascia in cima al modulo). Questo dice **cosa succede intorno**.

- Posizione **fixed, basso a destra**, 16px dai bordi; su schermi < 640px occupa
  la larghezza meno i margini e sta in basso. `z-index` **sotto** veli e
  finestre modali: un avviso non deve mai coprire una decisione in corso.
- Riquadro `surface` + `hairline` + `radius-m` + `shadow-float`, largo max 360px.
- Dentro: **dot** colorato del tipo (stessa tavolozza dei badge) + **titolo** in
  peso 600 a 13.5px + **una riga** di dettaglio in `text-secondary` a 12.5px +
  l'ora a `text-tertiary`. Una riga sola di dettaglio, con ellissi: un avviso che
  si legge in due secondi o non si legge.
- **Cliccabile tutto**: porta alla cosa di cui parla. La **×** lo chiude senza
  andare da nessuna parte.
- Entrata: `translateY(8px)` + `opacity 0` → 0 in **180ms** con `--ease`.
- Sparisce da solo dopo **~9 secondi**; il timer si **ferma col mouse sopra**.

**Le tre regole che rendono i toast sopportabili** (senza queste diventano la
prima cosa che si chiede di togliere):

1. **Un tetto, e poi si riassume.** Massimo **3** a schermo (2 su telefono). Se
   ne arrivano di più insieme, **uno solo** che li conta («7 novità: 5 messaggi,
   2 ordini»). Una colonna di dieci riquadri non la legge nessuno e copre la
   pagina.
2. **Si possono zittire.** Un comando **«silenzia 1 ora»** dentro la pila, e
   mentre è in pausa resta una pillola piccola che lo dice e che li riaccende. Un
   avviso che non si può spegnere si impara a ignorare — e allora non avvisa più.
3. **Mai ripetere il passato.** Al primo caricamento **non si mostra niente**: si
   prende solo il segnaposto del «da adesso in poi». Un avviso deve dire *è
   appena successo*, e riproporre le novità di ieri a ogni ricarica insegna che
   non è vero.

⚠️ Il segnaposto è **l'orologio del server**, restituito dalla risposta e
rimandato indietro alla chiamata dopo: usando quello del browser, un computer
avanti di un minuto salta gli avvisi e uno indietro li ripete.

### Scelta data — il «/» dentro un campo

Un calendarietto **appeso al campo** che si apre scrivendo `/` dentro una riga di
testo libero, e che al posto della barra scrive la data.

⚠️⚠️ **La barra è un comando, non testo**: quando il comando va a buon fine
**sparisce**, sostituita da quello che ha prodotto. Se resta, finisce nel dato —
e in un campo che poi legge un'altra persona.

⚠️⚠️ **Si apre solo dove la barra è un comando: a inizio di parola** — campo
vuoto o dopo uno spazio — **e in qualunque punto della riga**. Dentro una parola
la barra è un carattere come un altro — 27/08, e/o, 16/20 — e aprire un pannello
mentre qualcuno scrive una data in cifre è un dispetto proprio verso chi quel
campo lo usa di più. Incollare un testo che contiene una barra non apre niente.

⚠️⚠️ **In qualunque punto, non solo in fondo.** In fondo si scrive quando la riga
**nasce**; in mezzo quando la si **corregge** — «chiamare ~~domani~~ / alle 9!» —
e sono lo stesso gesto. Una regola che guarda solo la fine del campo funziona
mentre si scrive e non funziona mai mentre si corregge, che è proprio il momento
in cui una data si sostituisce. Vale anche per la barra scritta **al posto di
qualcosa di selezionato**.

⚠️⚠️ **Tolta la barra, il pannello si chiude.** Sta lì per quella barra: sparita
lei, non ha più un posto dove mettere la data. E non basta guardare i tasti —
**Backspace e Canc non sono caratteri**: si guarda il testo, così valgono anche
il taglia, il seleziona-tutto-e-cancella e l'annulla del browser.

⚠️ **La data va al posto della barra, dov'era**, non in fondo alla riga; e il
cursore torna **dopo la data**, altrimenti correggendo in mezzo bisogna
ricercare a mano il punto in cui si stava scrivendo.

- Pannello `surface` + `hairline` + `radius-m` + `shadow-float`, **268px**,
  `position: absolute` sotto il campo (6px di stacco), mai una finestra al
  centro: la riga si sta ancora scrivendo, e un velo fa perdere il punto.
- `z-index` **sotto** veli e finestre modali.
- In cima **tre scorciatoie** (Oggi · Domani · Dopodomani), poi il mese con
  frecce ‹ ›, poi la griglia **lunedì per primo**.
- **Oggi** in oro e in grassetto (è il punto da cui si conta); il giorno su cui è
  fermo il cursore **pieno scuro** (è quello che Invio sceglierebbe); il passato
  **smorzato ma cliccabile** — una riga di lavoro può parlare di ieri.
- Tastiera: **↑↓←→** spostano il giorno (non il cursore nel testo), **Invio**
  sceglie, **Esc** chiude lasciando la barra scritta. Un piede lo ricorda.
- ⚠️ Con il pannello aperto, **Invio non manda il modulo**: sceglie la data. Chi
  scrive non deve rischiare di spedire una riga che finisce con «/».

⚠️ **La data si scrive come la scrive una persona** — «16 luglio», «2
settembre» — senza zeri davanti, e **con l'anno solo se non è quello corrente**.
E le scorciatoie scrivono **la data**, non la parola: «domani» in un testo
invecchia di un giorno al giorno, la data no.

### Navigazione (app gestionali)
- Sidebar **chiara traslucida** (blur 24px, saturate 180%), larghezza ~250px, bordo destro hairline
- Voci raggruppate in **sezioni con etichetta MAIUSCOLA** (Operatività, Rete, Amministrazione, Configurazione…)
- Voce: icona stroke 1.7px (stile SF Symbols, 19px) + label 13.5px; attiva = sfondo `fill-active` + peso 600 + icona oro **+ `aria-current="page"`**
- In basso: avatar con iniziali su `gold-soft`, nome + ruolo, logout a icona (nelle app con autenticazione)
- Mobile: la sidebar diventa tab bar o menu; stessa gerarchia. Regole complete e riferimenti: Libro cap. 1–2.

### Logo
- La "D" in Georgia serif, oro su quadrato scuro `linear-gradient(145deg, var(--logo-dark-a), var(--logo-dark-b))`, radius ~26% del lato, luce interna `inset 0 1px 0 rgba(255,255,255,0.12)`

## 4. Pattern

> I pattern completi — con l'implementazione di riferimento di ciascuno e il piano di adeguamento per app — vivono nel **[Libro UX&UI](LIBRO-UX-UI.md)**. Qui resta il minimo sindacale.

### Pagina
```
[Titolo 32px]                    [filtri e azioni a destra]
[caption grigia 14px]
[card contenuto]
```
Il titolo dice **cosa**, la caption dice **perché/cosa contiene**, le azioni stanno sulla stessa riga a destra.

### Stati obbligatori
Ogni vista dati implementa **quattro stati**, tutti dentro card (le app da campo ne hanno un quinto: **offline** — Libro cap. 6):
1. **Loading**: testo sobrio ("Caricamento…"), niente spinner giganti
2. **Empty**: icona in quadratino `gold-soft`, titolo `title-m`, frase di aiuto, **azione**
3. **Errore**: card con tinta `red-soft` e bordo rosso al 15%, messaggio chiaro **+ azione di ripresa («Riprova»)**. Un fallimento non è mai una lista vuota.
4. **Dati**: la tabella/lista

### Form
- Label sopra il campo (12.5px/500), obbligatori con `*` **rosso**
- Errori **presso il campo** che li ha causati, in `red`, input conservato — mai solo alert (come si fa anche senza JS client: Libro cap. 4)
- CTA primaria in fondo a destra (o full-width nei form stretti)

### Login (tutte le app)
Card in vetro smerigliato (blur 30px, radius 24, `shadow-float`) su sfondo `bg` con due radial-gradient soft (oro 14% in alto a sx, ink 10% in basso a dx), logo D, titolo, caption, campi raggruppati, CTA pillola nera, footnote brand ("Consegne in guanti bianchi, dal 2019.").

## 5. Piattaforme

| App | Come adottare |
|---|---|
| **Web (Angular/React/HTML)** | Importa [`tokens/tokens.css`](tokens/tokens.css) come primo foglio di stile; usa solo `var(--…)`. Riferimento vivo: `deluxy-platform-next/web/` |
| **React Native / Expo** (Deluxy Scout) | Importa [`tokens/theme.ts`](tokens/theme.ts). ⚠️ **Mai lo swap secco dell'import**: le chiavi in collisione (es. `spacing.md` locale=16 vs DS=12) si RINOMINANO prima, o 44 schermate cambiano in silenzio (Libro cap. 12). Blur: `expo-blur` per barre/sidebar |
| **Shopify (temi Deluxy)** | I token colore/tipografia entrano nelle variabili del tema; la skill `sviluppi-siti-deluxy` deve citare questo file. I siti vetrina possono usare più oro (contesto marketing), ma stessa scala tipo/spazio/radius |
| **Nuove app** | Giorno zero: si copia `tokens/` e si linka questo documento + il Libro nel README |

## 6. Governance

- Questo documento e `tokens/tokens.json` sono **la fonte**; le copie nelle app sono implementazioni. Le copie web devono restare **byte-identiche** (check anti-drift in CI: Libro cap. 12).
- Per cambiare un token o aggiungere un componente: si modifica qui (con bump di versione in testa), poi si propaga alle app.
- Ogni PR/commit di UI deve poter rispondere: *"quale sezione del design system sto applicando?"*
- Deroghe consapevoli (es. mappa di Scout, checkout Shopify, legenda consegne) vanno annotate nel README dell'app con il motivo.
- ⚠️ Questo file esiste in DUE copie (repo `app/` e repo `scoutwt/`): a ogni bump vanno allineate ENTRAMBE (il 27/08 la copia di `app/` era rimasta alla v1.0 mentre `scoutwt` era alla v1.3).
