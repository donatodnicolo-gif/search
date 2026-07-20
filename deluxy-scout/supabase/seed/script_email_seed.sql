-- Libreria "Script": i 12 modelli email del ciclo commerciale Deluxy.
-- Copertura funnel: prospezione (1-2) -> visita (3-5) -> proposta (6-7) ->
-- chiusura (8) -> incasso (9-10) -> riattivazione (11) -> stagionalita' (12).
-- Idempotente: non duplica i modelli gia' presenti (match per titolo).
-- Owner: l'admin della rete (i venditori li vedono tutti, RLS di lettura condivisa).
insert into script_email (owner, titolo, tipo, oggetto, corpo)
select u.id, v.titolo, v.tipo, v.oggetto, v.corpo
from (select id from auth.users where email = 'nicolo.donato@deluxy.it' limit 1) u,
(values

-- 1. PROSPEZIONE - primo contatto boutique/maison
($s$Primo contatto - Consegne boutique e maison$s$, 'prospezione',
$s$Consegne in guanti bianchi per {negozio}$s$,
$s$Gentile {nome},

sono con Deluxy, il servizio di consegne in guanti bianchi che dal 2019 accompagna maison e boutique a Milano: acquisti dei clienti, fiori e regali consegnati con fascia oraria precisa, autista in divisa e conferma in tempo reale.

Lavoriamo gia' con diverse realta' del lusso e credo che {negozio} possa trovarci utili nei momenti in cui l'esperienza del cliente non deve fermarsi alla porta del negozio.

Le rubo 15 minuti per mostrarle come funziona? Passo io in boutique quando preferisce: mi basta una risposta a questa email.

Un cordiale saluto$s$),

-- 2. PROSPEZIONE - affiliazione fioristi/pasticcerie
($s$Primo contatto - Affiliazione fioristi e pasticcerie$s$, 'prospezione',
$s$Le creazioni di {negozio} su deluxy.it$s$,
$s$Gentile {nome},

Deluxy porta a domicilio le eccellenze di Milano: su deluxy.it i clienti ordinano fiori e dolci dai migliori laboratori della citta', e noi consegniamo in guanti bianchi.

Vorremmo proporre anche le creazioni di {negozio}: lei riceve gli ordini, noi pensiamo a vetrina online, incasso e consegna. Nessun costo fisso: riconosciamo il valore del suo lavoro ordine per ordine.

Posso passare a raccontarle come funziona e scegliere insieme i prodotti piu' adatti? Bastano 15 minuti.

Un cordiale saluto$s$),

-- 3. FOLLOW-UP - recap dopo la visita (da personalizzare)
($s$Dopo la visita - recap e prossimi passi$s$, 'follow_up',
$s$Grazie per il tempo dedicato - i prossimi passi per {negozio}$s$,
$s$Gentile {nome},

grazie per il tempo che mi ha dedicato oggi da {negozio}: e' stato un piacere conoscere la vostra realta'.

Come concordato, le riassumo i punti principali del nostro incontro:
- [servizio di interesse]
- [esigenze e condizioni emerse]
- [prossimo passo concordato]

Resto a disposizione per ogni dettaglio e la ricontatto come d'accordo. Nel frattempo puo' rispondere direttamente a questa email per qualsiasi domanda.

Un cordiale saluto$s$),

-- 4. FOLLOW-UP - richiamo gentile senza risposta
($s$Richiamo gentile - nessuna risposta$s$, 'follow_up',
$s$Ci eravamo sentiti per {negozio}$s$,
$s$Gentile {nome},

le scrivo per riprendere il filo del nostro ultimo contatto: so bene quanto i ritmi del negozio lascino poco spazio al resto, quindi nessuna fretta.

Se il tema e' ancora d'interesse per {negozio}, mi dica lei il momento migliore per una chiamata di 10 minuti: mi adatto volentieri ai suoi orari.

Se invece questo non e' il momento, me lo scriva senza problemi: mi faro' vivo piu' avanti.

Un cordiale saluto$s$),

-- 5. FOLLOW-UP - conferma appuntamento (da personalizzare)
($s$Conferma appuntamento$s$, 'follow_up',
$s$Confermo il nostro appuntamento - {negozio}$s$,
$s$Gentile {nome},

le confermo con piacere il nostro appuntamento presso {negozio} il [giorno] alle [ora].

Portero' una breve presentazione del servizio e qualche esempio concreto di come lavoriamo con realta' simili alla sua: in mezz'ora avra' tutto cio' che le serve per valutare.

Se dovesse cambiare qualcosa, mi avvisi pure rispondendo a questa email.

A presto$s$),

-- 6. FOLLOW-UP - invio proposta
($s$Invio proposta commerciale$s$, 'follow_up',
$s$La proposta Deluxy per {negozio}$s$,
$s$Gentile {nome},

come promesso le invio la nostra proposta per {negozio}, costruita su quanto emerso nel nostro incontro.

Trovera' condizioni, tempi di attivazione e i contatti operativi. Due cose ci tengo a sottolinearle:
- l'attivazione non richiede alcun cambiamento nei vostri processi;
- puo' partire con un periodo di prova, senza vincoli.

Sono a disposizione per rivedere insieme qualsiasi punto: se preferisce, ci sentiamo al telefono in settimana.

Un cordiale saluto$s$),

-- 7. FOLLOW-UP - sollecito proposta
($s$Sollecito proposta - in attesa di riscontro$s$, 'follow_up',
$s$Ha avuto modo di vedere la proposta per {negozio}?$s$,
$s$Gentile {nome},

torno da lei in merito alla proposta inviata per {negozio}: ha avuto modo di darle uno sguardo?

Se qualche punto non la convince, ne parliamo volentieri: spesso bastano pochi aggiustamenti per trovare la forma giusta. Se invece le serve solo piu' tempo, nessun problema: mi dica lei quando risentirci.

Un cordiale saluto$s$),

-- 8. ALTRO - benvenuto nuovo partner
($s$Benvenuto - attivazione nuovo partner$s$, 'altro',
$s$Benvenuti in Deluxy - si parte$s$,
$s$Gentile {nome},

benvenuti! Da oggi {negozio} e' ufficialmente partner Deluxy: grazie della fiducia.

Nei prossimi giorni ricevera' i contatti operativi e tutto il necessario per partire. Per qualsiasi esigenza - anche urgente - puo' scrivermi o chiamarmi direttamente: seguiro' personalmente l'avvio per assicurarmi che tutto fili liscio.

Sono certo che sara' l'inizio di una bella collaborazione.

Un caro saluto$s$),

-- 9. AVVISO - invio pro-forma / richiesta di pagamento
($s$Invio pro-forma - richiesta di pagamento$s$, 'avviso',
$s$Pro-forma per {negozio}$s$,
$s$Gentile {nome},

le invio la pro-forma relativa ai servizi concordati per {negozio}, con il dettaglio degli importi e i riferimenti per il bonifico.

Come da accordi, alla ricezione del pagamento emetteremo la fattura definitiva. Per qualsiasi chiarimento sugli importi o sulle modalita' resto a sua disposizione.

La ringrazio e le auguro buon lavoro.$s$),

-- 10. AVVISO - sollecito pagamento
($s$Sollecito pagamento - promemoria gentile$s$, 'avviso',
$s$Promemoria: pagamento in scadenza per {negozio}$s$,
$s$Gentile {nome},

le scrivo per un semplice promemoria: risulta ancora in sospeso il pagamento relativo a {negozio}, la cui scadenza e' passata da qualche giorno.

Se il bonifico e' gia' partito, consideri superata questa email (e mi scuso per il disturbo). In caso contrario le sarei grato se poteste provvedere nei prossimi giorni; per qualsiasi difficolta', parliamone: troviamo una soluzione insieme.

Un cordiale saluto$s$),

-- 11. PROSPEZIONE - riattivazione dopo un no
($s$Riattivazione - ricontatto dopo tempo$s$, 'prospezione',
$s$E' passato un po' di tempo - novita' per {negozio}$s$,
$s$Gentile {nome},

qualche tempo fa ci siamo confrontati sui servizi Deluxy per {negozio}: allora non era il momento giusto, e l'ho rispettato.

Da allora pero' il servizio e' cresciuto - nuove linee, piu' copertura, condizioni piu' flessibili - e mi farebbe piacere mostrarle cosa e' cambiato: a volte cio' che non era adatto ieri lo diventa oggi.

Le andrebbe una chiamata di 10 minuti, senza alcun impegno?

Un cordiale saluto$s$),

-- 12. ALTRO - stagionale, pianificare i picchi
($s$Stagionale - prepariamo i giorni di punta$s$, 'altro',
$s$Prepariamo insieme le feste - {negozio}$s$,
$s$Gentile {nome},

si avvicina il periodo piu' intenso dell'anno e, come ogni stagione, i giorni di punta premiano chi si organizza per tempo.

Deluxy puo' darle una mano proprio li': consegne aggiuntive nei giorni di picco, fasce orarie garantite e un referente dedicato, cosi' {negozio} accoglie piu' ordini senza stress per il banco.

Se vuole, definiamo ora date e volumi: bastano 15 minuti al telefono e per le feste e' tutto pronto.

Un cordiale saluto$s$)

) as v(titolo, tipo, oggetto, corpo)
where not exists (select 1 from script_email s where s.titolo = v.titolo);
