# Regole di lavoro — progetto Deluxy

Valide per ogni sessione di sviluppo su questo repo (umani e Claude). Sono richiamate dal `CLAUDE.md` alla radice.

## 0. Documento app sempre aggiornato (Markdown + Word)
Il manuale [COME-FUNZIONA-APP-DELUXY.md](COME-FUNZIONA-APP-DELUXY.md) è la **fonte funzionale viva** (si modifica questo).
**A ogni commit** che cambia comportamento/campi/flussi:
1. aggiornare il `.md` nello stesso commit;
2. **rigenerare il Word** con `npm run doc:word` (da `deluxy-platform-next/`) → produce `docs/COME-FUNZIONA-APP-DELUXY.docx` sempre allineato, e committarlo.

Il `.docx` è generato automaticamente dal `.md`: **non** modificarlo a mano (verrebbe sovrascritto). Lo snapshot originale consegnato dal team è `COME-FUNZIONA-APP-DELUXY-AGGIORNATO-2026-07.docx` (storico, non aggiornato).

## 0-bis. Manuale di funzionalità (guida visiva) — deciso dall'utente il 28/08/2026

> «D'ora in poi l'inserimento e aggiornamento di funzionalità devono essere inseriti in questo manuale di funzionalità.»

Il manuale è [guida-visiva.html](guida-visiva.html), pubblicato come artifact
(link nell'handoff). È la guida che legge **una persona nuova**: che cosa fa
l'applicativo, chi vede cosa, come viaggia una consegna, dove va il denaro.

**A ogni commit che aggiunge o cambia una funzionalità**, nello stesso commit:

1. si aggiorna `docs/guida-visiva.html`;
2. si **ripubblica allo STESSO indirizzo** (`Artifact` con lo stesso
   `file_path`, oppure con l'`url` dell'artifact se la sessione è un'altra) —
   un indirizzo nuovo lascia in mano all'utente un link che invecchia;
3. si aggiorna anche il manuale tecnico `COME-FUNZIONA-APP-DELUXY.md` (regola 0).

⚠️ **Non sono lo stesso documento e non si sostituiscono**: il `.md` è il
riferimento completo, campo per campo, che si consulta; la guida visiva è
l'orientamento, che si legge una volta dall'inizio alla fine. Una funzione
descritta solo nel `.md` resta invisibile a chi arriva; una descritta solo
nella guida perde i dettagli che servono a lavorarci.

**Come si scrive dentro la guida**: che cosa fa e **chi lo vede**, non come è
costruita dentro. Se la funzione ha una regola che può sorprendere, va in **Le
regole del posto** col motivo. I numeri si **misurano** e si **datano**.

## 1. Handoff sempre aggiornato
A ogni tappa e **prima di fermarsi**, aggiornare:
- [HANDOFF.md](HANDOFF.md) — cosa è FATTO / cosa MANCA, data, come riprendere;
- la memoria del progetto (`~/.claude/.../memory/`).

Obiettivo: una finestra nuova deve poter riprendere **senza contesto pregresso**.

## 2. Commit spesso
Dopo ogni modifica sensata, un commit con messaggio chiaro.
Prima di committare **verificare davvero** (typecheck + test + build/preview), non solo che "sembri" ok.
Non lasciare lavoro non committato a lungo.

## 3. Segreti mai salvati
Token/chiavi/password non vanno **mai** scritti su file né committati. Li fornisce l'utente al bisogno: usarli solo per quel comando e poi dimenticarli. `.env` sempre in `.gitignore` (incluso `.env.legacy`).

## 4. Una sola sessione per cartella
Due sessioni Claude sulla stessa working directory si sovrascrivono il branch git e si cancellano il lavoro non committato. Per lavorare in parallelo usare un **git worktree** isolato (cartella + branch dedicati).

## 5. Confermare le azioni irreversibili/esterne
Prima di **deploy, push, invii, cancellazioni o modifiche a impostazioni**, chiedere conferma. Deploy = pubblicare.

## 6. Durabilità
Non tenere il lavoro solo in locale: **pushare su GitHub** (dopo conferma, regola 5). Il lavoro non pushato è a rischio.

## 7. Riportare il vero esito
Se un test fallisce o un passo è saltato, dirlo con l'**output reale**. Niente "fatto" senza verifica.
