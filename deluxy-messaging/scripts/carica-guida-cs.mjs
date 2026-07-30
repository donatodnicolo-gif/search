// Carica nell'app la parte della «Guida Customer Service Deluxy — Unificata»
// (v1.0, 14/07/2026) che serve a RISPONDERE AI CLIENTI.
//
//   node scripts/carica-guida-cs.mjs            # dice cosa farebbe
//   node scripts/carica-guida-cs.mjs --esegui   # scrive
//
// COME È DIVISA, e perché conta: l'AI delle risposte rapide non può inventare
// fatti — prende il CONTENUTO da uno Script e ne cambia solo la FORMA seguendo
// le Istruzioni (vedi il prompt in src/lib/ai.ts). Quindi:
//
//  · quello che si può DIRE a un cliente → **Script** (risposte pronte);
//  · come si dice, per brand e canale     → **IstruzioneAI**;
//  · il testo di riferimento              → **DocumentoAI**, per risalire alla
//    fonte di ogni regola.
//
// COSA È STATO LASCIATO FUORI, di proposito:
//  · tutta l'operatività interna (Shopify admin, bozze, tag, stati dei ticket
//    Tidio, evasione, creazione prodotti): non è roba da dire a un cliente;
//  · liste di partner e fornitori, sconti riconosciuti, ricarichi +30%/+40%,
//    costi a noi e margini: se finissero in una risposta sarebbe un danno;
//  · i nomi delle persone interne;
//  · ⚠️ i punti marcati **DA VALIDARE** nella guida, dove i due documenti
//    sorgente si contraddicono: numero della Postepay (due carte diverse),
//    soglia per la chiamata di feedback, link per le recensioni, tipo di
//    compensazione, orari di contatto, formato del nome in rubrica. Su quelli
//    c'è un'istruzione esplicita: NON rispondere, chiedere all'ufficio. Far
//    scegliere all'AI una delle due versioni vorrebbe dire dare al cliente un
//    numero di carta sbagliato o promettere una compensazione non decisa.
//
// Idempotente: gli Script e le Istruzioni si riconoscono dal titolo e si
// aggiornano, non si duplicano. Rilanciarlo dopo aver corretto un testo qui
// dentro aggiorna quello che c'è.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

for (const file of ['.env', '.env.local']) {
  try {
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}

const esegui = process.argv.includes('--esegui')
const db = new PrismaClient()

// I marchi come si chiamano in tabella (negozi Shopify di quest'app).
const MARCHIO = { deluxy: 'Deluxy', flowers: 'FLowers', cake: 'Cake' }

// ─────────────────────────────────────────────────────────────────────────────
// 1. IL DOCUMENTO: la parte dichiarabile ai clienti, in chiaro, come fonte.
// ─────────────────────────────────────────────────────────────────────────────

const DOCUMENTO = `GUIDA CUSTOMER SERVICE DELUXY — PARTE DICHIARABILE AI CLIENTI
Estratto dalla Guida unificata v1.0 del 14/07/2026. Contiene SOLO ciò che si può
dire a un cliente: fatti di consegna, tempi, costi, coperture, pagamenti,
fatturazione e le formule di risposta. Esclusa tutta l'operatività interna.

REGOLA D'ORO
La consegna in guanti bianchi (Valet in giacca, cravatta e guanti bianchi) è
ESCLUSIVA di deluxy.it: non va mai attribuita a Deluxy Flowers né a Cakedesign.
Non si promettono gratuità, livelli di servizio o coperture che il brand non
dichiara. Solo Deluxy Flowers ha la consegna sempre gratuita; deluxy.it e
Cakedesign consegnano a pagamento.

L'AZIENDA
Deluxy stupisce chi si ama con fiori, regali, torte e sorprese, ogni giorno dalle
7:00 alle 22:00, a Milano, Roma, Firenze e in tutto il mondo. Si lavora con
Artisti di città (Milano, Roma, Firenze) con Valet dedicati, e con Artisti locali
selezionati nel resto del mondo. Sono Artisti in ogni caso: cambia il modello di
consegna, non la qualità di chi realizza.

DELUXY FLOWERS — deluxyflowers.com
Atelier di fiori di lusso: creazioni su misura dei migliori artisti fiorai.
Gamma: Maxi (es. 100 rose), Ispirati (arte, cinema, città), Originali (es. bouquet
+ palloncini), Tradizionali. Formati: bouquet, cappelliere, cesti. Ogni regalo
include biglietto e confezione regalo.
Consegna: SEMPRE GRATUITA in tutto il mondo, isole incluse. Same-day con la
categoria «Oggi». Assistenza 7:00–22:00, 7 giorni su 7.
Cut-off: ordine entro le 16:00 per la consegna in giornata; dopo le 16:00 la prima
consegna possibile è il giorno dopo; dalle 22:00 in poi, il giorno dopo si
consegna dalle 12:00.
Si può dire: atelier dei fiori · creazioni su misura · migliori artisti locali
fiorai · consegna sempre gratuita in tutto il mondo · bouquet, cappelliere e
cesti · maxi 100 rose · creazioni ispirate ad arte, cinema, città · biglietto e
confezione inclusi · consegna in giornata.
Non si può dire: guanti bianchi, white-glove, Valet · sconti urlati, countdown,
urgenza finta · garanzie di orario o same-day su zone non confermate.

DELUXY — deluxy.it
Hub di regali di lusso con la consegna in guanti bianchi. Gamma: Maxi (100 rose,
torta a 10 piani), Ispirati, Originali (bouquet + palloncini, torta + champagne),
creazioni dei migliori artisti di città. Ogni regalo include biglietto e
confezione regalo, oltre alla consegna Valet.
Consegna: Valet in giacca, cravatta e guanti bianchi, di persona. A PAGAMENTO: la
consegna ha un costo e non va mai presentata come gratuita.
Copertura guanti bianchi: Milano, Roma e Firenze, con costo extra nelle province
di Como, Varese, Lodi, Bergamo, Monza-Brianza, Brescia. Oltre i 10 km dalle città
abilitate il sito non completa l'ordine e manda al contatto esperto, cioè al
servizio clienti.
Tempi: ogni giorno 7:00–22:00. Consegna in giornata con ordine entro le 20:00, in
una fascia di due ore, con almeno 2 ore di anticipo. Dalle 20:00 si ordina per il
giorno dopo (prima fascia 8:00–10:00); da mezzanotte alle 8:00 la prima fascia
disponibile in giornata è 8:00–10:00.
Supplementi: orario garantito +50€; consegna a mezzanotte +100€.
Fuori copertura: si può proporre un prodotto simile realizzato da un Artista
locale — va detto che non sarà identico e che non c'è la consegna in guanti
bianchi — con un extra di consegna indicativo di 2€ per km e senza garantire la
fascia oraria.
Si può dire: consegna in guanti bianchi / Valet · il primo servizio in guanti
bianchi · consegna 7–22 ogni giorno (solo Milano, Roma, Firenze, più le province
a costo extra) · maxi 100 rose, torta a 10 piani · torta + champagne · biglietto
e confezione inclusi.
Non si può dire: guanti bianchi disponibili in tutta Italia · consegna gratuita ·
guanti bianchi di un altro brand.

CAKEDESIGN — cakedesign.me
Torte design in tutto il mondo, realizzate da cake designer selezionati.
Personalizzazione da catalogo o creazione da zero. Gamma: tradizionali «per
oggi», personalizzabili, torte per matrimoni ed eventi.
Consegna: A PAGAMENTO, in tutto il mondo. Codici promo occasionali possono
azzerarla (non cumulabili, un uso per cliente, escluse le torte in consegna
oggi), ma la consegna base non è gratuita. Opzioni «Oggi» e «Domani» last minute.
Servizio 7:00–22:00.
Cut-off: ordine entro le 14:00 per la consegna in giornata; dopo le 14:00 la prima
consegna possibile è il giorno dopo; dalle 20:00 alle 8:00 si consegna il giorno
dopo dalle 12:00.
Si può dire: torte design personalizzate · personalizza da catalogo o crea con
l'AI · torte per oggi, last minute · torte per matrimoni ed eventi · consegna in
tutto il mondo.
Non si può dire: consegna gratuita come regola (vanno dichiarate le condizioni
della promo) · guanti bianchi o Valet.

INFORMAZIONI DA CHIEDERE SEMPRE PER UN ORDINE
Nome e numero di telefono del destinatario, prodotto, indirizzo di consegna,
messaggio da allegare al biglietto.

PAGAMENTI
Link di pagamento (metodo preferito) · bonifico IT51M3609201600364189687708,
Deluxy SRL, causale «servizio deluxy» · Satispay: deluxy · Revolut:
https://revolut.me/deluxy178u · PayPal: https://www.paypal.me/deluxy526.

FATTURAZIONE
Deluxy Srl · P.IVA 11453140961 · Via Varesina 60, 20156 Milano · SDI M5UXCR1 ·
PEC deluxy@pec.net.

PRODOTTO NON DISPONIBILE
Si verifica la disponibilità, si avvisa subito il cliente sul suo canale, si
propongono alternative di pari o superiore valore e si concorda se attendere,
sostituire o annullare.

PUNTI IN ATTESA DI VALIDAZIONE — NON RISPONDERE
La guida riporta due versioni diverse, in attesa di decisione, su: numero della
carta Postepay, soglia di spesa per la chiamata di feedback, link per lasciare la
recensione, tipo di compensazione dopo un feedback negativo, orari entro cui
contattare i clienti, formato del nome in rubrica. Su questi punti non si dà una
risposta al cliente: si chiede prima in azienda.`

// ─────────────────────────────────────────────────────────────────────────────
// 2. LE ISTRUZIONI: la forma delle risposte. Generali e per brand.
// ─────────────────────────────────────────────────────────────────────────────

const ISTRUZIONI = [
  {
    titolo: 'Si dà sempre del Lei',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 1,
    testo:
      'Al cliente si dà SEMPRE del Lei, su ogni canale, anche in chat e su WhatsApp. È una regola aziendale e non cambia con la familiarità del cliente.',
  },
  {
    titolo: 'Presentarsi con nome e brand',
    categoria: 'Firma',
    ambito: 'tutti',
    ordine: 2,
    testo:
      'Al primo messaggio presentarsi con il proprio nome e il brand da cui si scrive. Per deluxy.it aggiungere «servizio di consegna in guanti bianchi». Nelle mail, dopo il saluto si va a capo.',
  },
  {
    titolo: 'Mai promettere quello che il brand non dichiara',
    categoria: 'Reclami',
    ambito: 'tutti',
    ordine: 3,
    testo:
      'Non promettere gratuità, livelli di servizio, orari garantiti o coperture che il brand non dichiara. Se un dato non è nella risposta pronta — un orario, una zona, un costo — non si inventa: si dice che si verifica e si ricontatta.',
  },
  {
    titolo: 'Guanti bianchi: solo deluxy.it',
    categoria: 'Generale',
    ambito: 'tutti',
    ordine: 4,
    testo:
      'La consegna in guanti bianchi (Valet in giacca, cravatta e guanti bianchi) è esclusiva di deluxy.it e solo per Milano, Roma e Firenze più le province a costo extra. Non nominarla mai scrivendo per Deluxy Flowers o Cakedesign, e non estenderla ad altre città.',
  },
  {
    titolo: 'Punti in attesa di validazione: non rispondere',
    categoria: 'Generale',
    ambito: 'tutti',
    ordine: 5,
    testo:
      'Su questi punti la guida aziendale ha due versioni in conflitto e la decisione manca: numero della carta Postepay, soglia di spesa per la chiamata di feedback, link per la recensione, tipo di compensazione dopo un feedback negativo, orari entro cui contattare i clienti. NON dare una risposta e non scegliere una versione: dire che si verifica e si ricontatta.',
  },
  {
    titolo: 'Parole da evitare e da preferire',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 6,
    testo:
      'Evitare: sconto, saldi, offerta, gratis, economico, affrettati, last minute, scade, problema, costo, spesa, spedizione. Preferire: edizione, collezione, un\'attenzione in più, inclusa nel servizio, consegna in giornata, desiderio, valore, consegna. Riformulare al positivo: «è semplice», non «non è difficile». Per Cakedesign le parole di promozione sono ammesse, con tono curato.',
  },
  {
    titolo: 'Come si porta avanti una conversazione',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 7,
    testo:
      'Usare il nome del cliente. Proporre 2 o 3 opzioni concrete, non tutto il catalogo. Chiudere con una micro-scelta («Preferisce la consegna sabato mattina o pomeriggio?»). Accompagnare ogni invito con un perché («Le consiglio di confermare entro le 12:00, così arriva domani»). L\'urgenza si nomina solo se è vera e viene dal servizio (fascia oraria, cut-off, disponibilità dell\'artista).',
  },
  {
    titolo: 'In chat si scrive corto',
    categoria: 'Generale',
    ambito: 'chat',
    ordine: 8,
    testo:
      'In chat e su WhatsApp: 2-4 frasi, nessun oggetto, nessuna firma lunga. Una domanda sola per messaggio. Si risponde il prima possibile: sotto i 10 minuti la conversazione si trasforma in vendita molto più spesso.',
  },
  {
    titolo: 'Nelle mail: oggetto e firma',
    categoria: 'Generale',
    ambito: 'email',
    ordine: 9,
    testo:
      'Nelle mail: oggetto chiaro e specifico, saluto seguito da un a capo, e in chiusura nome e brand con i riferimenti di contatto. Frasi complete, nessuna abbreviazione da chat.',
  },
  {
    titolo: 'Voce di Deluxy Flowers',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 10,
    marchio: MARCHIO.flowers,
    testo:
      'Deluxy Flowers è un atelier d\'arte floreale: registro editoriale e colto, frasi brevi, ritmo elegante. Il prodotto è una creazione con una storia: non «12 rose rosse» ma «un\'ode in rosso, composta a mano». Lessico: composizione, opera, autore, atelier, collezione, su misura, gesto. Mai: mazzo, offerta, gratis, sconto, affrettati. La consegna gratuita è un fatto che si può dire, ma nel registro del lusso si preferisce «consegna inclusa, ovunque nel mondo». Mai nominare guanti bianchi o Valet.',
  },
  {
    titolo: 'Voce di Deluxy.it',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 11,
    marchio: MARCHIO.deluxy,
    testo:
      'Deluxy.it è il maggiordomo dell\'emozione: caldo, cerimonioso, attento al momento e alla persona (laurea, anniversario, corteggiamento). L\'eroe è il servizio: guanti bianchi, cura del dettaglio, disponibilità 7–22. L\'urgenza si racconta come affidabilità («anche in giornata, quando serve»), mai come corsa. Non dire «spedizione» ma «consegna in guanti bianchi»; mai «gratis», «sconto», «last minute». La consegna non è mai gratuita.',
  },
  {
    titolo: 'Voce di Cakedesign',
    categoria: 'Tono di voce',
    ambito: 'tutti',
    ordine: 12,
    marchio: MARCHIO.cake,
    testo:
      'Cakedesign.me è il complice creativo: friendly, diretto, accessibile — la torta dei sogni è per tutti. In chat e su WhatsApp le emoji sono ammesse, gli esclamativi con misura. Le promozioni si possono nominare, ma con tono aspirazionale («Un regalo per lei sul primo ordine»), mai da volantino. La consegna è a pagamento: una promo che la azzera si dichiara con le sue condizioni.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 3. LE RISPOSTE PRONTE: il contenuto che l'AI può mandare a un cliente.
//    `quando` non è decorazione: è il testo su cui l'AI decide se lo script
//    c'entra col messaggio ricevuto.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = [
  // ── Consegna ──
  {
    titolo: 'Consegna possibile in Italia o all\'estero',
    categoria: 'Consegna',
    quando:
      'Il cliente chiede se consegniamo in una certa città, paese o zona, anche fuori Milano/Roma/Firenze.',
    testo:
      'Gentile Cliente, certamente: possiamo realizzare la consegna affidandoci ad Artisti locali selezionati. Mi indichi pure la città e la data che ha in mente e le confermo subito la disponibilità.',
  },
  {
    titolo: 'Consegna fuori dalla copertura guanti bianchi (deluxy.it)',
    categoria: 'Consegna',
    marchio: MARCHIO.deluxy,
    quando:
      'Il cliente chiede una consegna deluxy.it fuori da Milano, Roma, Firenze e province, oppure il sito non gli ha permesso di completare l\'ordine.',
    testo:
      'Gentile Cliente, per quella destinazione la consegna in guanti bianchi non è prevista, ma possiamo comunque curare il suo gesto: le propongo una creazione simile realizzata da un Artista locale selezionato. Non sarà identica a quella del catalogo e la consegna sarà standard, con un contributo per la distanza che le quantifico appena mi conferma l\'indirizzo. Preferisce che le prepari due proposte?',
  },
  {
    titolo: 'Consegna inclusa in tutto il mondo (Deluxy Flowers)',
    categoria: 'Consegna',
    marchio: MARCHIO.flowers,
    quando: 'Il cliente chiede quanto costa la consegna dei fiori o se è gratuita.',
    testo:
      'Gentile Cliente, la consegna è inclusa nel servizio, in tutto il mondo e isole comprese: il prezzo che vede è quello finale. Ogni creazione arriva con biglietto e confezione regalo.',
  },
  {
    titolo: 'Costo della consegna (deluxy.it)',
    categoria: 'Consegna',
    marchio: MARCHIO.deluxy,
    quando: 'Il cliente chiede quanto costa la consegna su deluxy.it o se è gratuita.',
    testo:
      'Gentile Cliente, la consegna è affidata a un nostro Valet in giacca, cravatta e guanti bianchi, che consegna di persona: ha un costo, che le indico in base alla destinazione. È la parte che rende il gesto memorabile, oltre al biglietto e alla confezione regalo già inclusi.',
  },
  {
    titolo: 'Costo della consegna (Cakedesign)',
    categoria: 'Consegna',
    marchio: MARCHIO.cake,
    quando: 'Il cliente chiede quanto costa la consegna della torta o se è gratuita.',
    testo:
      'Gentile Cliente, la consegna ha un costo e la portiamo in tutto il mondo: le indico l\'importo esatto appena mi conferma città e data. In alcuni periodi abbiamo codici promozionali dedicati che la azzerano: se ce n\'è uno attivo per la sua consegna, glielo segnalo io.',
  },
  {
    titolo: 'Tempi e ultimo orario utile (Deluxy Flowers)',
    categoria: 'Consegna',
    marchio: MARCHIO.flowers,
    quando: 'Il cliente chiede quando arriva, se si consegna oggi o entro che ora deve ordinare (fiori).',
    testo:
      'Gentile Cliente, la consegna in giornata è possibile con ordine entro le 16:00. Dopo le 16:00 la prima consegna disponibile è il giorno successivo; dalle 22:00 in poi, il giorno dopo si consegna dalle 12:00. Siamo a sua disposizione dalle 7:00 alle 22:00, sette giorni su sette.',
  },
  {
    titolo: 'Tempi e fascia di consegna (deluxy.it)',
    categoria: 'Consegna',
    marchio: MARCHIO.deluxy,
    quando: 'Il cliente chiede a che ora arriva, se si consegna oggi o entro quando deve ordinare (deluxy.it).',
    testo:
      'Gentile Cliente, consegniamo ogni giorno dalle 7:00 alle 22:00 in una fascia di due ore, con almeno due ore di anticipo. Anche in giornata, con ordine entro le 20:00; dopo quell\'ora la prima fascia utile è l\'indomani dalle 8:00 alle 10:00. Preferisce la mattina o il pomeriggio?',
  },
  {
    titolo: 'Tempi e ultimo orario utile (Cakedesign)',
    categoria: 'Consegna',
    marchio: MARCHIO.cake,
    quando: 'Il cliente chiede quando arriva la torta o entro che ora ordinare.',
    testo:
      'Gentile Cliente, la consegna in giornata è possibile con ordine entro le 14:00. Dopo le 14:00 la prima consegna disponibile è il giorno successivo; per gli ordini fra le 20:00 e le 8:00, il giorno dopo si consegna dalle 12:00. Siamo attivi dalle 7:00 alle 22:00.',
  },
  {
    titolo: 'Orario garantito o consegna a mezzanotte (deluxy.it)',
    categoria: 'Consegna',
    marchio: MARCHIO.deluxy,
    quando:
      'Il cliente chiede un orario preciso e garantito, una consegna a mezzanotte o a un\'ora esatta.',
    testo:
      'Gentile Cliente, oltre alla fascia di due ore possiamo riservarle un orario garantito con un supplemento di 50€, oppure una consegna a mezzanotte con un supplemento di 100€. Mi confermi quale preferisce e le preparo l\'ordine.',
  },
  {
    titolo: 'Consegna senza conoscere l\'indirizzo',
    categoria: 'Consegna',
    quando: 'Il cliente non ha o non conosce l\'indirizzo del destinatario.',
    testo:
      'Gentile Cliente, non è un problema: mi lasci il numero di telefono del destinatario e ci faremo indicare da lui un indirizzo valido per la consegna, senza svelare la sorpresa.',
  },
  {
    titolo: 'Dove arriva il Valet in guanti bianchi',
    categoria: 'Consegna',
    marchio: MARCHIO.deluxy,
    quando: 'Il cliente chiede in quali città c\'è il servizio in guanti bianchi.',
    testo:
      'Gentile Cliente, la consegna in guanti bianchi è attiva a Milano, Roma e Firenze, con un contributo aggiuntivo nelle province di Como, Varese, Lodi, Bergamo, Monza-Brianza e Brescia. Per le altre destinazioni curiamo comunque il gesto affidandoci a un Artista locale selezionato, con consegna standard.',
  },

  // ── Ordine ──
  {
    titolo: 'Informazioni su un ordine già fatto',
    categoria: 'Ordine',
    quando:
      'Il cliente chiede dov\'è il suo ordine, se è stato consegnato, a chi, o vuole modificarlo.',
    testo:
      'Gentile Cliente, la seguo subito: le chiedo di indicarmi il numero dell\'ordine oppure l\'indirizzo di consegna, così da poterla assistere al meglio.',
  },
  {
    titolo: 'Order information (English)',
    categoria: 'Ordine',
    quando:
      'The customer writes in English asking about an existing order, delivery status or a change.',
    testo:
      'Dear Client, I will gladly assist you. Kindly provide your order number or the delivery address so that I may assist you in the best possible way.',
  },
  {
    titolo: 'Cosa serve per completare l\'ordine',
    categoria: 'Ordine',
    quando:
      'Il cliente vuole ordinare tramite chat e servono i dati, oppure ne ha dati solo una parte.',
    testo:
      'Gentile Cliente, per preparare tutto mi servono quattro cose: nome e numero di telefono del destinatario, il prodotto che desidera, l\'indirizzo di consegna con la data, e il messaggio da scrivere sul biglietto. Appena le ho, le mando il link per completare l\'ordine.',
  },
  {
    titolo: 'Prodotto non disponibile',
    categoria: 'Ordine',
    quando:
      'Il prodotto scelto non è disponibile e va proposta un\'alternativa.',
    testo:
      'Gentile Cliente, mi dispiace informarla che il prodotto scelto non è attualmente disponibile. Le propongo alternative di pari o superiore valore, in linea con quello che aveva in mente: {{ALTERNATIVE}}. Mi indichi pure quale preferisce, oppure una sua richiesta specifica, e la seguo io personalmente.',
  },
  {
    titolo: 'Product unavailable (English)',
    categoria: 'Ordine',
    quando: 'The chosen product is unavailable and the customer writes in English.',
    testo:
      'Dear Client, I regret to inform you that the product you selected is currently unavailable. I would like to propose these alternatives of equal or greater value: {{ALTERNATIVE}}. Please let me know your preference or any specific request, and I will take care of it personally.',
  },

  // ── Pagamenti ──
  {
    titolo: 'Metodi di pagamento',
    categoria: 'Pagamenti',
    quando: 'Il cliente chiede come può pagare o quali metodi accettiamo.',
    testo:
      'Gentile Cliente, il modo più semplice è il link di pagamento che le invio io: si paga in pochi secondi con carta. Se preferisce, accettiamo anche bonifico (IT51M3609201600364189687708, Deluxy SRL, causale «servizio deluxy»), Satispay (deluxy), Revolut (https://revolut.me/deluxy178u) e PayPal (https://www.paypal.me/deluxy526).',
  },
  {
    titolo: 'Dati per la fattura',
    categoria: 'Pagamenti',
    quando: 'Il cliente chiede la fattura o i nostri dati fiscali, o è un\'azienda.',
    testo:
      'Gentile Cliente, certamente, emettiamo fattura. I nostri dati: Deluxy Srl, P.IVA 11453140961, Via Varesina 60, 20156 Milano, codice SDI M5UXCR1, PEC deluxy@pec.net. Mi invii pure i suoi dati di fatturazione e la predisponiamo.',
  },

  // ── Primo contatto ──
  {
    titolo: 'Primo contatto — Deluxy.it',
    categoria: 'Primo contatto',
    marchio: MARCHIO.deluxy,
    quando: 'Primo messaggio a un cliente che scrive a deluxy.it senza una richiesta precisa.',
    testo:
      'Gentile Cliente, sono {{NOME_OPERATORE}} di Deluxy, servizio di consegna in guanti bianchi. Mi indichi pure qui la sua richiesta e sarò felice di assisterla.',
  },
  {
    titolo: 'Primo contatto — Deluxy Flowers',
    categoria: 'Primo contatto',
    marchio: MARCHIO.flowers,
    quando: 'Primo messaggio a un cliente che scrive a deluxyflowers.com.',
    testo:
      'Gentile Cliente, sono {{NOME_OPERATORE}} di Deluxyflowers.com. Mi indichi pure qui la sua richiesta e sarò felice di assisterla.',
  },
  {
    titolo: 'Primo contatto — Cakedesign',
    categoria: 'Primo contatto',
    marchio: MARCHIO.cake,
    quando: 'Primo messaggio a un cliente che scrive a cakedesign.me.',
    testo:
      'Gentile Cliente, sono {{NOME_OPERATORE}} di Cakedesign.me. Mi scriva pure qui cosa ha in mente e la aiuto subito a scegliere.',
  },
  {
    titolo: 'First contact (English)',
    categoria: 'Primo contatto',
    quando: 'The customer writes in English for the first time.',
    testo:
      'Dear Client, my name is {{NOME_OPERATORE}} from {{BRAND}}. Please feel free to write your request here, and I will be happy to assist you.',
  },

  // ── Dopo la consegna ──
  {
    titolo: 'Richiesta di feedback dopo la consegna',
    categoria: 'Dopo la consegna',
    quando: 'Si chiede al cliente com\'è andata la sua esperienza, dopo la consegna.',
    testo:
      'Gentile Cliente, sono {{NOME_OPERATORE}} di Deluxy. Le scrivo per sapere come è andata la sua esperienza del {{DATA}}: la sua opinione conta molto per noi e ci aiuta a migliorare il servizio.',
  },
  {
    titolo: 'Feedback positivo — ringraziamento',
    categoria: 'Dopo la consegna',
    quando: 'Il cliente dice che è andato tutto bene.',
    testo:
      'Gentile Cliente, sono felice di sapere che la sua esperienza è stata all\'altezza. Sono {{NOME_OPERATORE}} e curerò personalmente le sue prossime esperienze: mi scriva qui per qualsiasi occasione.',
  },
  {
    titolo: 'Feedback negativo — prima risposta',
    categoria: 'Dopo la consegna',
    quando:
      'Il cliente si lamenta di com\'è andata: ritardo, biglietto mancante, prodotto non come atteso.',
    testo:
      'Gentile Cliente, mi dispiace sinceramente che la sua esperienza non sia stata all\'altezza delle sue aspettative: ci teniamo che tutto sia perfetto. La sua opinione è preziosa e la porto subito all\'attenzione del responsabile: la ricontatto io per dirle come possiamo rimediare.',
  },
  {
    titolo: 'Invito per una ricorrenza',
    categoria: 'Dopo la consegna',
    quando:
      'Si riscrive a un cliente perché si avvicina una data che aveva già festeggiato con noi.',
    testo:
      'Buongiorno gentile Cliente, sono {{NOME_OPERATORE}} di Deluxy.it, servizio in guanti bianchi. Le scrivo perché l\'anno scorso abbiamo curato la sua esperienza del {{DATA}} per {{DESTINATARIO}}. La data si avvicina: posso aiutarla a pensare a qualcosa di speciale?',
  },
  {
    titolo: 'Servizi per aziende ed eventi',
    categoria: 'Dopo la consegna',
    quando:
      'Il cliente è un\'azienda, chiede la fattura, o si vuole proporre catering, eventi e regali personalizzati.',
    testo:
      'Gentile Cliente, le ricordo che per gli ordini aziendali emettiamo regolarmente fattura. Ci occupiamo anche di catering, eventi e regali personalizzati: se le fa comodo, mi scriva direttamente qui per i prossimi ordini e le preparo una proposta dedicata.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────

const negozi = await db.negozioShopify.findMany({ select: { id: true, nome: true } })
const idNegozio = (nome) => (nome ? negozi.find((n) => n.nome === nome)?.id ?? null : null)

const mancanti = [...new Set(Object.values(MARCHIO))].filter((n) => !idNegozio(n))
if (mancanti.length) {
  console.log(`⚠️ Marchi non trovati in tabella: ${mancanti.join(', ')}`)
  console.log('   Le voci di quei marchi verranno caricate come «valide per tutti».')
}

console.log(`Documento: 1 (${DOCUMENTO.length} caratteri)`)
console.log(`Istruzioni: ${ISTRUZIONI.length}`)
console.log(`Risposte pronte: ${SCRIPT.length}`)
for (const s of SCRIPT) {
  if (!s.testo?.trim()) throw new Error(`Script senza testo: ${s.titolo}`)
}

if (!esegui) {
  console.log('\nNiente scritto (prova a vuoto). Per caricare davvero: --esegui')
  await db.$disconnect()
  process.exit(0)
}

const NOME_DOC = 'Guida Customer Service Deluxy — parte dichiarabile ai clienti (v1.0)'
const giaDoc = await db.documentoAI.findFirst({ where: { nome: NOME_DOC } })
const documento = giaDoc
  ? await db.documentoAI.update({
      where: { id: giaDoc.id },
      data: { testo: DOCUMENTO, dimensione: DOCUMENTO.length },
    })
  : await db.documentoAI.create({
      data: {
        nome: NOME_DOC,
        tipo: 'text/plain',
        dimensione: DOCUMENTO.length,
        testo: DOCUMENTO,
        nota:
          'Estratto dalla Guida unificata v1.0 del 14/07/2026: solo la parte dichiarabile ai clienti. Esclusi operatività interna, listini, partner, margini e i punti in conflitto (da validare).',
      },
    })
console.log(`\nDocumento ${giaDoc ? 'aggiornato' : 'creato'}: ${documento.nome}`)

let nuoveIstruzioni = 0
let aggiornateIstruzioni = 0
for (const i of ISTRUZIONI) {
  const dati = {
    titolo: i.titolo,
    categoria: i.categoria,
    testo: i.testo,
    ambito: i.ambito,
    ordine: i.ordine,
    attiva: true,
    negozioId: idNegozio(i.marchio),
    documentoId: documento.id,
  }
  const gia = await db.istruzioneAI.findFirst({ where: { titolo: i.titolo } })
  if (gia) {
    await db.istruzioneAI.update({ where: { id: gia.id }, data: dati })
    aggiornateIstruzioni++
  } else {
    await db.istruzioneAI.create({ data: dati })
    nuoveIstruzioni++
  }
}
console.log(`Istruzioni: ${nuoveIstruzioni} nuove, ${aggiornateIstruzioni} aggiornate`)

let nuoviScript = 0
let aggiornatiScript = 0
for (const s of SCRIPT) {
  // Il brand finisce in coda al `quando`: gli Script non hanno un campo negozio,
  // e senza scriverlo l'AI non ha modo di sapere che una risposta vale solo per
  // un marchio — e proporrebbe i guanti bianchi a chi scrive ai fiori.
  const marchio = s.marchio ? ` Vale SOLO per il marchio ${s.marchio}.` : ''
  const dati = {
    titolo: s.titolo,
    categoria: s.categoria,
    testo: s.testo,
    quando: `${s.quando}${marchio}`,
    attivo: true,
  }
  const gia = await db.script.findFirst({ where: { titolo: s.titolo } })
  if (gia) {
    await db.script.update({ where: { id: gia.id }, data: dati })
    aggiornatiScript++
  } else {
    await db.script.create({ data: dati })
    nuoviScript++
  }
}
console.log(`Risposte pronte: ${nuoviScript} nuove, ${aggiornatiScript} aggiornate`)

const totali = await db.script.count({ where: { attivo: true } })
console.log(`\nRisposte pronte attive in tutto: ${totali}`)

await db.$disconnect()
