# Le chiavi delle altre app, per lavorare sulla loro coda

> Creato il 12/09/2026, su richiesta dell'utente: «crea uno spazio dove ti posso
> dare le chiavi di altre app».

## Il posto è uno solo: `.env.altre-app`

Sta nella radice di `deluxy-transactions`, **fuori da GitHub**. Non è una
promessa: `.gitignore` ignora `.env*` con l'unica eccezione di `.env.example`,
e la cosa è stata verificata prima di creare il file —
`git check-ignore -v .env.altre-app` risponde che è ignorato. Il repo `search`
è **pubblico**: se un domani qualcuno cambia quella riga del `.gitignore`,
questo file diventa pubblico con lei.

Dentro ci sono due righe per app, con i soli nomi già scritti e i valori da
incollare dopo l'uguale:

```
CS_TRANSACTIONS_API_KEY=
CS_TRANSACTIONS_HMAC_SECRET=
```

Le app previste sono Customer Service (`cs`), Finance (`finance`), Piattaforma
consegne (`piattaforma`), Scout (`scout`), Acquisti (`acquisti`). Le righe
vuote vanno bene: si riempiono quando servono.

I valori sono quelli consegnati quando la chiave è stata creata, oppure quelli
nelle variabili d'ambiente dell'app su Vercel (`TRANSACTIONS_API_KEY` e
`TRANSACTIONS_HMAC_SECRET`).

## Perché serve

Transactions accetta solo richieste firmate, e **una richiesta la può chiudere
soltanto la chiave che l'ha creata**. Per riparare la coda di un'app — chiudere
un arretrato, ritirare richieste costruite con un criterio sbagliato — servono
la chiave e il segreto di *quell'app*. Senza, resta solo la strada a mano
dall'interfaccia, una riga per volta: il caso reale che ha fatto nascere questo
file sono le 41 richieste del Customer Service già pagate là e rimaste in coda
qui.

## Che potere danno, e che potere non danno

Con queste due stringhe si può **chiedere** un pagamento e **chiudere o
annullare le richieste fatte da quella stessa app**. Non si può approvare, non
si può generare una distinta, **non esce un euro**: l'uscita del denaro passa
dal codice via email e dal PIN del pagatore, che qui dentro non ci sono, e da
`verificaCancello()` in [../src/lib/sblocco.ts](../src/lib/sblocco.ts).

Resta materiale da trattare come una password. Se il file esce dal computer, si
revocano le chiavi da `/chiavi` e se ne creano di nuove.

> ⚠️ **Revocare non è gratis.** Una richiesta la chiude solo la chiave che l'ha
> creata: ruotare la chiave di un'app rende **inchiudibili** le sue richieste
> già in coda, che dopo rispondono `404`. Prima si svuota l'arretrato, poi si
> ruota. È la stessa trappola annotata nell'handoff il 05/09.

> ⚠️ **Un file solo con più chiavi concentra il rischio.** Prima erano sparse
> nei `.env` delle singole app; adesso una copia sola le tiene insieme. È il
> prezzo di poter lavorare senza cambiare cartella, ed è consapevole: si
> compilano **solo le app che servono davvero**, non tutte per scrupolo.

## Come si usa, senza che nessuno legga un segreto

I valori li legge `node`, non una persona, e non passano mai da una chat né da
una trascrizione.

Per vedere cosa c'è e cosa manca — stampa il **prefisso** della chiave (che non
è un segreto: si vede anche in `/chiavi`) e del segreto solo la lunghezza, utile
per accorgersi di un incollaggio troncato:

```bash
cd C:\Users\nicol\scoutwt\deluxy-transactions && node --env-file=.env.altre-app scripts/chiavi-presenti.mjs
```

Per chiudere un arretrato con la chiave di un'app:

```bash
cd C:\Users\nicol\scoutwt\deluxy-transactions && node --env-file=.env.altre-app scripts/chiudi-arretrato.mjs --app cs scripts/arretrato-cs.json
```

Senza `--esegui` è una prova a secco: rilegge lo stato di ogni riga e dice cosa
farebbe. Lo script controlla anche che il prefisso della chiave sia quello
atteso per quell'app: se qualcuno incolla la chiave sbagliata nella sezione
sbagliata, lo dice invece di firmare e prendersi un 404.

Chi ha creato quale chiave, con che tetti e quante richieste ha fatto si legge
nella pagina `/chiavi` dentro l'app.
