# Deluxy Design System

**Versione 1.0 — 14 luglio 2026**

Il linguaggio visivo ufficiale di tutte le app Deluxy. Nato dal redesign di `deluxy-platform-next` (stile Apple), vale d'ora in poi per **ogni app esistente e nuova**: piattaforma web, Deluxy Scout, app fornitori, siti Shopify, landing page.

> Regola d'oro: **prima di disegnare qualsiasi schermata si parte da questo documento**, non dal gusto del momento. Se serve qualcosa che qui non c'è, si aggiunge qui prima, poi si usa nell'app.

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
3. **Un accento, usato poco.** L'oro (`#B8963E`) segna identità e punti chiave (logo, icona attiva, focus). Le azioni primarie sono **nere** (ink), non oro: l'oro si consuma se usato ovunque.
4. **Tutto risponde.** Ogni elemento interattivo ha hover, active (scale 0.97–0.98) e focus visibile. Le transizioni sono brevi (150–200 ms) e con easing morbido.

## 2. Fondamenta (token)

I valori canonici vivono in [`tokens/tokens.json`](tokens/tokens.json); `tokens.css` (web) e `theme.ts` (React Native) li implementano. **Mai hardcodare un valore che esiste come token.**

### 2.1 Colore

| Token | Valore | Uso |
|---|---|---|
| `bg` | `#F5F5F7` | Sfondo pagina (sempre, mai bianco pieno) |
| `surface` | `#FFFFFF` | Card, tabelle, superfici |
| `surface-translucent` | `rgba(255,255,255,0.72)` + blur 24px | Sidebar, barre, overlay (effetto vetro) |
| `text` | `#1D1D1F` | Testo primario |
| `text-secondary` | `#6E6E73` | Sottotitoli, caption |
| `text-tertiary` | `#86868B` | Placeholder, label colonne |
| `hairline` | `rgba(0,0,0,0.08)` | Bordi, divisori |
| `hairline-strong` | `rgba(0,0,0,0.14)` | Bordi di campi input |
| `fill` / `fill-hover` / `fill-active` | `rgba(120,120,128,0.08/0.14/0.20)` | Riempimenti neutri (hover, selezione, bottoni secondari) |
| `ink` | `#111318` | Azioni primarie, brand scuro |
| `gold` / `gold-strong` | `#B8963E` / `#A07F2C` | Accento brand (icone attive, focus, avatar) |
| `gold-soft` | `rgba(184,150,62,0.12)` | Sfondi tinta oro |
| `blue` | `#0071E3` | Stato informativo / in corso |
| `green` | `#248A3D` | Successo / completato |
| `orange` | `#C93400` | Attenzione / da gestire |
| `red` | `#D70015` | Errore / annullato |
| `purple` | `#6D3FC4` | Stato speciale (es. in consegna) |

Regole: i colori semantici si usano **solo** per stati e feedback, sempre in coppia "tinta al 9–12% di sfondo + testo pieno" (es. badge). Il rosso pieno solo per errori e azioni distruttive.

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
| `label` | 11px · 600 · +0.06em MAIUSCOLO | Etichette di sezione (es. sidebar) |

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

## 3. Componenti

### Bottoni (sempre a pillola)
- **Primario**: sfondo `ink`, testo bianco, hover `#2A2D35`
- **Secondario**: sfondo `fill`, testo `text`, hover `fill-hover`
- **Oro** (solo momenti di brand, es. CTA marketing): sfondo `gold`, testo bianco
- **Distruttivo**: testo `red` su `fill`, o rosso pieno solo dopo conferma
- Padding 8×18 (13px verticale per CTA grandi), font-weight 500–600, disabled = opacity 0.55

### Campi input
- Bordo `hairline-strong`, radius 12, padding 8–13×12–14, sfondo `surface`
- Focus: bordo `gold` + anello `0 0 0 4px gold-soft`
- Nei form brevi (login): campi **raggruppati** in un unico contenitore con divisori hairline interni (stile iOS)

### Card
- `surface` + `hairline` + `radius-l` + `shadow-card`. Nessun header colorato.

### Tabelle
- Dentro una card; intestazioni 12px `text-tertiary` peso 500 (niente maiuscolo urlato), sticky
- Righe con hover `rgba(120,120,128,0.05)`, divisori hairline, ultima riga senza bordo
- Numeri allineati a destra con `tabular-nums`; celle vuote = "—"

### Badge di stato (pillole)
- Pillola con **dot** colorato + testo, tinta di sfondo 9–12% + testo semantico pieno
- Mappa stati Deluxy: da gestire=orange · in gestione/accettata=blue · in consegna=purple · consegnata=green · annullata/non consegnata=red · neutro=fill

### Navigazione (app gestionali)
- Sidebar **chiara traslucida** (blur 24px, saturate 180%), larghezza ~250px, bordo destro hairline
- Voci raggruppate in **sezioni con etichetta MAIUSCOLA** (Operatività, Rete, Amministrazione, Configurazione…)
- Voce: icona stroke 1.7px (stile SF Symbols, 19px) + label 13.5px; attiva = sfondo `fill-active` + peso 600 + icona oro
- In basso: avatar con iniziali su `gold-soft`, nome + ruolo, logout a icona
- Mobile: la sidebar diventa tab bar o menu; stessa gerarchia

### Logo
- La "D" in Georgia serif, oro su quadrato scuro `linear-gradient(145deg, #1D1F26, #3A3D47)`, radius ~26% del lato, luce interna `inset 0 1px 0 rgba(255,255,255,0.12)`

## 4. Pattern

### Pagina
```
[Titolo 32px]                    [filtri e azioni a destra]
[caption grigia 14px]
[card contenuto]
```
Il titolo dice **cosa**, la caption dice **perché/cosa contiene**, le azioni stanno sulla stessa riga a destra.

### Stati obbligatori
Ogni vista dati implementa **quattro stati**, tutti dentro card:
1. **Loading**: testo sobrio ("Caricamento…"), niente spinner giganti
2. **Empty**: icona in quadratino `gold-soft`, titolo `title-m`, frase di aiuto, eventuale azione secondaria
3. **Errore**: card con tinta `red` al 6% e bordo rosso al 15%, messaggio chiaro
4. **Dati**: la tabella/lista

### Form
- Label sopra il campo (o placeholder per form brevi), obbligatori con \*
- Errori inline sotto il campo in `red`, mai solo alert
- CTA primaria in fondo a destra (o full-width nei form stretti)

### Login (tutte le app)
Card in vetro smerigliato (blur 30px, radius 24, `shadow-float`) su sfondo `bg` con due radial-gradient soft (oro 14% in alto a sx, ink 10% in basso a dx), logo D, titolo, caption, campi raggruppati, CTA pillola nera, footnote brand ("Consegne in guanti bianchi, dal 2019.").

## 5. Piattaforme

| App | Come adottare |
|---|---|
| **Web (Angular/React/HTML)** | Importa [`tokens/tokens.css`](tokens/tokens.css) come primo foglio di stile; usa solo `var(--…)`. Riferimento vivo: `deluxy-platform-next/web/` |
| **React Native / Expo** (Deluxy Scout) | Importa [`tokens/theme.ts`](tokens/theme.ts); sostituire gradualmente i token locali (`lib/theme.ts`) mappandoli su questi. Blur: `expo-blur` per barre/sidebar |
| **Shopify (temi Deluxy)** | I token colore/tipografia entrano nelle variabili del tema; la skill `sviluppi-siti-deluxy` deve citare questo file. I siti vetrina possono usare più oro (contesto marketing), ma stessa scala tipo/spazio/radius |
| **Nuove app** | Giorno zero: si copia `tokens/` e si linka questo documento nel README |

## 6. Governance

- Questo documento e `tokens/tokens.json` sono **la fonte**; le copie nelle app sono implementazioni.
- Per cambiare un token o aggiungere un componente: si modifica qui (con bump di versione in testa), poi si propaga alle app.
- Ogni PR/commit di UI deve poter rispondere: *"quale sezione del design system sto applicando?"*
- Deroghe consapevoli (es. mappa di Scout, checkout Shopify) vanno annotate nel README dell'app con il motivo.
