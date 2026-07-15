# Regole di lavoro — progetto Deluxy

Valide per ogni sessione di sviluppo su questo repo (umani e Claude). Sono richiamate dal `CLAUDE.md` alla radice.

## 0. Documento app sempre aggiornato
Il manuale [COME-FUNZIONA-APP-DELUXY.md](COME-FUNZIONA-APP-DELUXY.md) è la fonte funzionale viva.
**A ogni commit** che cambia comportamento/campi/flussi, aggiornare anche il documento nello stesso commit. Non lasciarlo indietro.

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
