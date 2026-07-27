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
(email e WhatsApp, migrazione 0046), `chiamate` e `visits`. Le prime due
esistevano già, la mail invece **partiva senza lasciare traccia** — ed è il
motivo per cui il livello Lead non era calcolabile prima.

I **dormienti** non sono persi: ci conoscono già, hanno comprato, e riattivarli
costa molto meno che conquistare un nome nuovo. È la lista più redditizia che
un'azienda abbia, e va guardata con la stessa disciplina della pipeline.

Sopra ai livelli stanno le **trattative**: sono le conversazioni in corso su un
lead, con valore e scadenza. Il livello dice *a che punto è il rapporto*, la
trattativa *cosa ci stiamo giocando*. Tenerli distinti evita l'illusione di una
pipeline piena che in realtà è solo una lista di nomi.

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
