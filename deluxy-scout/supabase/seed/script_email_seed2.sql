-- Libreria "Script" - batch 2: varianti brevi (stile messaggio/WhatsApp) +
-- modelli eventi/PR. Idempotente (match per titolo), owner = admin della rete.
insert into script_email (owner, titolo, tipo, oggetto, corpo)
select u.id, v.titolo, v.tipo, v.oggetto, v.corpo
from (select id from auth.users where email = 'nicolo.donato@deluxy.it' limit 1) u,
(values

-- 13. BREVE - primo contatto (3 righe)
($s$Breve - Primo contatto$s$, 'prospezione',
$s$Deluxy per {negozio}$s$,
$s$Gentile {nome}, sono con Deluxy: consegne in guanti bianchi per boutique e maison a Milano. Credo possiamo esserle utili. Le va una chiamata di 10 minuti questa settimana?

Un cordiale saluto$s$),

-- 14. BREVE - richiamo/sollecito gentile (3 righe)
($s$Breve - Richiamo gentile$s$, 'follow_up',
$s$Un saluto da Deluxy - {negozio}$s$,
$s$Gentile {nome}, torno da lei con un rapido promemoria sul nostro contatto per {negozio}. Se e' ancora d'interesse, mi dica pure quando risentirci: mi adatto ai suoi orari.

Un cordiale saluto$s$),

-- 15. BREVE - sollecito pagamento (3 righe)
($s$Breve - Sollecito pagamento$s$, 'avviso',
$s$Promemoria pagamento - {negozio}$s$,
$s$Gentile {nome}, un breve promemoria: il pagamento per {negozio} risulta ancora in sospeso. Se il bonifico e' gia' partito ignori pure questo messaggio; altrimenti le sarei grato se poteste provvedere a breve. Grazie!$s$),

-- 16. ALTRO - invito evento / apertura / sfilata
($s$Evento - proposta di collaborazione$s$, 'altro',
$s$Le consegne del vostro evento, in guanti bianchi$s$,
$s$Gentile {nome},

so che {negozio} cura ogni dettaglio dei propri eventi - aperture, presentazioni, sfilate - e la logistica dell'ultimo miglio fa spesso la differenza tra un evento buono e uno impeccabile.

Deluxy puo' occuparsi delle consegne dedicate della giornata: inviti, omaggi agli ospiti, ritiri e riconsegne, con autisti in divisa e tempistiche al minuto.

Se avete un evento in programma nelle prossime settimane, ne parliamo? Bastano 15 minuti per capire come darle una mano.

Un cordiale saluto$s$),

-- 17. ALTRO - PR festivita' / Natale
($s$Festivita' - gifting e consegne di Natale$s$, 'altro',
$s$Il Natale di {negozio}, consegnato con cura$s$,
$s$Gentile {nome},

il Natale e' il momento in cui i vostri clienti si aspettano il meglio, anche a casa. Deluxy gestisce per lei le consegne del periodo: regali confezionati, gifting aziendale e ordini dei clienti, con fasce orarie garantite nei giorni piu' intensi.

Organizzarsi ora significa arrivare alle feste senza corse: definiamo insieme volumi e date, e pensiamo noi al resto.

Quando possiamo sentirci?

Un cordiale saluto$s$)

) as v(titolo, tipo, oggetto, corpo)
where not exists (select 1 from script_email s where s.titolo = v.titolo);
