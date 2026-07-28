# Deluxy Scout — Visione commerciale

> Scritta il 23/07/2026 completando le direttive dell'utente: «la home deve essere uno
> strumento per chi vende, non un recap; le nostre attività sono territorio, chiamata,
> lead da internet; ognuna può generare una trattativa e un ordine; le trattative perse
> vanno ricordate per essere riprese».

## Il modello: 3 canali → 1 funnel

Tutto ciò che l'azienda fa per acquisire clienti passa da **tre canali**:

| Canale | Attività | Dove vive in app |
|---|---|---|
| **Territorio** | giro visite, scoperta negozi, visita con esito | Mappa, Target, Visite |
| **Telefono** | prospezione a chiamata, richiami programmati | Affiliazioni, richiami in "Da fare" |
| **Web / inbound** | lead da internet, mail in arrivo, ricerca online | oggi entra da AI Mail («Apri trattativa») |

I canali sono diversi nel gesto ma identici nel funnel: **contatto → qualificazione →
trattativa → ordine** (vinta) oppure **persa, con memoria**. La trattativa registra il
suo `canale`: così la Dashboard può dire *quale attività produce fatturato*, che è la
domanda a cui un direttore commerciale deve saper rispondere.

## I livelli del rapporto

Una sola scala, valida ovunque in app (`lib/livelli.ts`), **derivata** dai dati:
non è un campo in più da aggiornare a mano.

| Livello | Chi è | Come ci si arriva |
|---|---|---|
| **Selezionato** | potenzialmente interessante, non gli è ancora stato detto niente | ⭐ dalla Mappa o dalle Affiliazioni, bottone + |
| **Lead** | il contatto è stato **avviato**, ma non sappiamo ancora con chi parlare | mail partita dall'app, chiamata registrata, visita fatta |
| **Prospect** | c'è una **persona** in rubrica da cui ripartire | contatto salvato in Rubrica, o già noto da HubSpot |
| **Cliente** | ha chiuso una trattativa | trattativa vinta → ordine |
| **Dormiente** | ha lavorato con noi, poi si è fermato | stato `dismesso` nel registro Anagrafiche |
| **Perso** | chiuso senza esito o non in target | esito visita, stato registro |

Il confine fra Lead e Prospect è **una persona con cui parlare**, non l'attività
svolta: si può aver bussato tre volte e restare un Lead. È la differenza fra
«abbiamo scritto a quel negozio» e «abbiamo il nome della titolare».

⚠️ Fino al 27/07/2026 gli identificatori nel codice erano sfasati rispetto a
queste etichette (`prospect` si mostrava come "Selezionato"). Ora coincidono, e
per questo `/lista?vista=prospect` mostra i Prospect veri, non più i
Selezionati. I livelli non sono salvati nel database: si ricalcolano.

La traccia dei contatti avviati sta in tre tabelle, non una: `contatti_avviati`
(email, WhatsApp, web, altro — migrazione 0046), `chiamate` e `visits`. Le
ultime due esistevano già, la mail invece **partiva senza lasciare traccia** —
ed è il motivo per cui il livello Lead non era calcolabile prima. Il canale
`web` è il contatto che arriva dal verso opposto: ci ha scritto lui dal sito o
dai social.

## Il semaforo della visita

Su ogni scheda di elenco il riquadro dell'icona è colorato (`lib/statoVisita.ts`):

| | Cosa vuol dire |
|---|---|
| 🔴 **Rosso** | la visita non è ancora stata fatta |
| 🟡 **Giallo** | c'è un resoconto a metà da chiudere |
| 🟢 **Verde** | la visita è stata fatta e registrata |

Il giallo **vince sul verde**: un negozio visitato in passato con una bozza
aperta adesso ha comunque qualcosa da chiudere, ed è quello che serve vedere. È
anche il caso peggiore dei tre, perché un giro è già stato speso.

Quello che si scrive nel pop-up della visita **si salva da solo** (tabella
`bozze_visita`, una riga per negozio, cancellata quando la visita viene
registrata). Prima bastava chiudere il pop-up per perdere tutto: sul campo, con
una mano sola, succedeva di continuo. Le bozze sono **private di chi le
scrive** — al team serve la visita finita, non gli appunti a metà di un collega.

## Pianificare la visita

`places.visita_pianificata` è **quando si ha intenzione di andarci**: una data
che ci si dà, spostabile e cancellabile. Non va confusa con `visits.data`, che è
quando ci si è andati per davvero. Registrando la visita si azzera da sola,
altrimenti il negozio resterebbe in agenda per sempre. Le liste segnano in rosso
le date già passate: un giro saltato deve dare fastidio, non sparire.

I **dormienti** non sono persi: ci conoscono già, hanno comprato, e riattivarli
costa molto meno che conquistare un nome nuovo. È la lista più redditizia che
un'azienda abbia, e va guardata con la stessa disciplina della pipeline.

Sopra ai livelli stanno le **trattative**: sono le conversazioni in corso su un
lead, con valore e scadenza. Il livello dice *a che punto è il rapporto*, la
trattativa *cosa ci stiamo giocando*. Tenerli distinti evita l'illusione di una
pipeline piena che in realtà è solo una lista di nomi.

## La copertura per provincia

`Province · Copertura` guarda l'Italia dall'alto: tutte e **107** le province
(`lib/province.ts`), non solo quelle dove abbiamo qualcosa. È il punto della
schermata — un elenco costruito sui dati che abbiamo mostrerebbe solo dove siamo
già, che è l'informazione che non serve per crescere.

Per ogni provincia: **fornitori attivi** e **partner in lavorazione** dal
registro Anagrafiche, **venduto** da Deluxy Orders (`GET /api/v1/province`, che
aggrega con le stesse esclusioni di `/api/v1/ricavi` — annullati e rimborsati
fuori — perché due endpoint che contano il fatturato in modi diversi sono un
modo sicuro per litigare sui numeri).

Il filtro **Scoperte** toglie le province dove un fornitore attivo c'è già.
Le righe evidenziate sono il caso che conta: **si vende, ma non abbiamo
nessuno**. Alla verifica del 27/07/2026: 15 province coperte, **92 scoperte**,
e Napoli con 54 partner in lavorazione, zero attivi e ordini già in corso.

Due cose che la schermata **dichiara invece di nascondere**:
- gli ordini senza provincia (3.402, un terzo del fatturato): Shopify non ce
  l'ha e non viene indovinata dal CAP — sarebbe un'ipotesi travestita da dato;
- quando il registro o Orders non rispondono per intero, i conteggi sono
  parziali e viene detto. Una lista incompleta che sembra completa fa credere
  che il lavoro sia finito.

## Le sequenze (solleciti a scadenza)

Una sequenza è un percorso scritto **una volta sola**: questo testo, poi dopo
tot giorni quest'altro. Si iscrive un negozio (`Sequenze`, o l'azione 🌿 nelle
liste) e l'app tiene il conto delle scadenze, invece di affidarlo alla memoria
di chi vende — che è il motivo per cui il secondo colpo non parte quasi mai.

**Due regole non negoziabili**, entrambe in `lib/sequenze.ts`:

1. **Se il cliente ha risposto, la sequenza si ferma.** Prima di ogni invio si
   legge la posta ricevuta da quel negozio dopo l'ultimo invio (AI Mail via la
   Edge Function `mail`). Un sollecito che arriva dopo la risposta non è un
   sollecito, è una figuraccia — e con le scadenze automatiche succede al primo
   giorno di distrazione. Quando la posta **non è collegata** la verifica non è
   possibile, e l'app lo dice invece di far passare il silenzio per «non ha
   risposto».
2. **Niente parte da solo.** La coda si calcola, l'invio si conferma. Un
   automatismo che sbaglia lo fa su tutta la lista prima che qualcuno se ne
   accorga, e le mail escono dalla casella personale di chi vende.

Altre scelte: un invio fallito **non fa avanzare il passo** (il negozio
salterebbe un colpo in silenzio); lo stesso negozio non entra due volte nella
stessa sequenza (sarebbero due solleciti in parallelo allo stesso indirizzo);
le iscrizioni in ritardo si vedono per prime, evidenziate.

## La regola d'oro sulle perse

Una trattativa persa non è spazzatura: è **pipeline differita**. Al momento della
chiusura si registrano tre cose:

1. **Per cosa era** (`oggetto`): "allestimento vetrine natalizie", "consegne fiori
   weekend" — senza questo, fra sei mesi nessuno ricorda perché eravamo lì.
2. **Perché è persa** (`motivo_perso`): prezzo · tempistica · concorrente · non
   risponde · non target. Il motivo decide la strategia di ripresa: un "prezzo" si
   riapre con un'offerta diversa, un "tempistica" si riapre da solo, un "non target"
   non si riapre affatto.
3. **Quando riprovarci** (`riprendere_il`): default 90 giorni. Alla data, la
   trattativa ricompare da sola nella Home, sezione **Da riprendere**.

## La Home: le 3 domande del venditore

Ogni mattina la Home risponde, nell'ordine, a:

1. **Dove vado e chi chiamo oggi?** — il giro di oggi (target selezionati), le
   chiamate da fare (richiami maturati, in ritardo evidenziati).
2. **Quali trattative devo muovere?** — follow-up di oggi e in ritardo, con valore.
3. **Cosa posso riprendere?** — le perse arrivate a maturazione.

Sopra, una **striscia KPI personale della settimana**: visite, chiamate, trattative
aperte, valore della pipeline. Non è un premio né un controllo: serve al venditore per
capire se sta seminando abbastanza in ciascun canale.

## Roadmap (dopo questa fase)

- **Ordini**: la trattativa vinta oggi genera una richiesta di pagamento; il passo
  successivo è l'oggetto "ordine" vero e proprio, agganciato al FINANCE (pro-forma già
  collegata) con stato incasso.
- **Lead inbox web**: una sezione che raccoglie i lead da internet (form sito, mail
  qualificate da AI Mail) come coda di qualificazione, prima che diventino trattative.
- **Cadenze per canale**: sequenze di ricontatto predefinite (es. telefono: chiamata →
  +3g → +7g) con generazione automatica dei richiami.
- **Motivi di perdita in Dashboard**: quota di perse per motivo e per canale, per
  correggere pricing e targeting.
