// Seed di sviluppo: sezioni, regole e qualche messaggio finto già analizzato,
// per vedere l'interfaccia senza collegare una casella vera.
//
//   npm run db:seed
//
// I messaggi qui dentro sono INVENTATI, servono solo a popolare le schermate.
// Su un database di produzione non va lanciato.

import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

const db = new PrismaClient()

// Stessa cifratura di src/lib/crypto.ts: il seed non può importare il TypeScript.
function cifra(testo) {
  const segreto = process.env.APP_SECRET
  if (!segreto) throw new Error('APP_SECRET mancante nel .env')
  const chiave = crypto.scryptSync(segreto, 'deluxy-mail', 32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', chiave, iv)
  const dati = Buffer.concat([cipher.update(testo, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), dati].map((b) => b.toString('base64')).join('.')
}

const oreFa = (h) => new Date(Date.now() - h * 3600_000)
const giorniTra = (g) => new Date(Date.now() + g * 86_400_000)

async function main() {
  await db.bozza.deleteMany()
  await db.attivita.deleteMany()
  await db.messaggio.deleteMany()
  await db.regola.deleteMany()
  await db.sezione.deleteMany()
  await db.account.deleteMany()

  const account = await db.account.create({
    data: {
      nome: 'Deluxy (dimostrazione)',
      email: 'posta@deluxy.it',
      imapHost: 'imap.esempio.it',
      imapUtente: 'posta@deluxy.it',
      imapPassword: cifra('finta'),
      smtpHost: 'smtp.esempio.it',
      smtpUtente: 'posta@deluxy.it',
      smtpPassword: cifra('finta'),
      ultimoUid: 1000,
      ultimoSync: oreFa(1),
    },
  })

  const sezioni = {}
  for (const s of [
    {
      nome: 'Ordini',
      colore: 'blue',
      descrizione:
        "Clienti che ordinano fiori o composizioni, conferme d'ordine, modifiche di indirizzo o data, disdette.",
    },
    {
      nome: 'Fornitori',
      colore: 'purple',
      descrizione:
        'Fiorai e pasticcerie partner: disponibilità prodotti, listini, problemi di consegna, ritiri.',
    },
    {
      nome: 'Amministrazione',
      colore: 'green',
      descrizione: 'Fatture, pagamenti, solleciti, commercialista, banca, adempimenti fiscali.',
    },
    {
      nome: 'Da ignorare',
      colore: 'orange',
      descrizione: 'Newsletter, pubblicità, notifiche automatiche dei servizi, spam.',
    },
  ]) {
    const creata = await db.sezione.create({
      data: { ...s, ordine: Object.keys(sezioni).length },
    })
    sezioni[s.nome] = creata.id
  }

  await db.regola.createMany({
    data: [
      {
        nome: 'Newsletter e pubblicità',
        priorita: 100,
        seOggetto: 'newsletter',
        sezioneId: sezioni['Da ignorare'],
        segnaLetta: true,
        fermaQui: true,
      },
      {
        nome: 'Fatture in arrivo',
        priorita: 50,
        seOggetto: 'fattura',
        sezioneId: sezioni['Amministrazione'],
        creaAttivita: true,
      },
      {
        nome: 'Tono e priorità Deluxy',
        priorita: 0,
        istruzioneAI:
          'Se un cliente lamenta un ritardo o un problema di consegna, priorità alta e bozza di scuse con una proposta concreta di rimedio. Non promettere mai sconti senza che li chieda lui.',
      },
    ],
  })

  const messaggi = [
    {
      uid: 1001,
      mittenteNome: 'Giulia Bernardi',
      mittente: 'giulia.bernardi@studiolegale.it',
      oggetto: 'Composizione per inaugurazione — giovedì 24',
      data: oreFa(2),
      corpoTesto:
        'Buongiorno,\n\nvorrei ordinare una composizione di fiori bianchi per l’inaugurazione del nostro nuovo ufficio, giovedì 24 luglio.\n\nL’indirizzo è Via Manzoni 14, Milano. Servirebbe entro le 10 del mattino.\nPotete confermarmi disponibilità e prezzo?\n\nGrazie,\nGiulia Bernardi',
      sezione: 'Ordini',
      priorita: 'alta',
      riassunto:
        'Vuole una composizione di fiori bianchi entro le 10 di giovedì 24 in Via Manzoni 14; chiede conferma e prezzo.',
      serveRisposta: true,
      attivita: [
        {
          titolo: 'Confermare disponibilità composizione bianca per il 24 luglio',
          dettaglio: 'Consegna Via Manzoni 14, Milano, entro le 10:00. Serve anche il prezzo.',
          scadenza: giorniTra(2),
          priorita: 'alta',
        },
      ],
      bozza: {
        oggetto: 'Re: Composizione per inaugurazione — giovedì 24',
        corpo:
          'Buongiorno Giulia,\n\ngrazie per la richiesta. Confermiamo la disponibilità di una composizione di fiori bianchi per giovedì 24 luglio, con consegna in Via Manzoni 14 entro le 10:00.\n\nIl prezzo è di [inserire prezzo] IVA inclusa.\n\nSe conferma entro [inserire data], procediamo con la preparazione.\n\nCordiali saluti,\nDeluxy',
      },
    },
    {
      uid: 1002,
      mittenteNome: 'Fioreria Sant’Ambrogio',
      mittente: 'ordini@fioreriasantambrogio.it',
      oggetto: 'Peonie esaurite fino a lunedì',
      data: oreFa(5),
      corpoTesto:
        'Ciao,\n\nvi avviso che le peonie rosa sono esaurite e non rientrano prima di lunedì 21.\nPer gli ordini di questa settimana possiamo sostituirle con ranuncoli o rose da giardino.\n\nFatemi sapere come procedere.\n\nMarco',
      sezione: 'Fornitori',
      priorita: 'alta',
      riassunto:
        'Peonie rosa esaurite fino a lunedì 21; propone ranuncoli o rose da giardino come sostituzione.',
      serveRisposta: true,
      attivita: [
        {
          titolo: 'Decidere la sostituzione delle peonie negli ordini della settimana',
          dettaglio: 'Alternative proposte: ranuncoli o rose da giardino. Rientro peonie: lunedì 21.',
          scadenza: giorniTra(1),
          priorita: 'alta',
        },
        {
          titolo: 'Avvisare i clienti con peonie negli ordini in corso',
          dettaglio: null,
          scadenza: giorniTra(1),
          priorita: 'media',
        },
      ],
      bozza: {
        oggetto: 'Re: Peonie esaurite fino a lunedì',
        corpo:
          'Ciao Marco,\n\ngrazie dell’avviso. Per gli ordini di questa settimana procediamo con [ranuncoli / rose da giardino].\n\nTi confermiamo entro [inserire data] le quantità esatte.\n\nGrazie,\nDeluxy',
      },
    },
    {
      uid: 1003,
      mittenteNome: 'Studio Rossi Commercialisti',
      mittente: 'amministrazione@studiorossi.it',
      oggetto: 'Fattura n. 412 — scadenza 31 luglio',
      data: oreFa(20),
      corpoTesto:
        'Buongiorno,\n\nin allegato la fattura n. 412 relativa al secondo trimestre 2026.\nLa scadenza per il pagamento è il 31 luglio 2026.\n\nCordiali saluti,\nStudio Rossi',
      sezione: 'Amministrazione',
      priorita: 'media',
      riassunto: 'Invia la fattura n. 412 del secondo trimestre, da pagare entro il 31 luglio.',
      serveRisposta: false,
      allegati: 1,
      attivita: [
        {
          titolo: 'Pagare la fattura n. 412 dello Studio Rossi',
          dettaglio: 'Secondo trimestre 2026.',
          scadenza: new Date('2026-07-31'),
          priorita: 'media',
        },
      ],
      bozza: null,
    },
    {
      uid: 1004,
      mittenteNome: 'Antonio Greco',
      mittente: 'a.greco@gmail.com',
      oggetto: 'Consegna di ieri mai arrivata',
      data: oreFa(26),
      letto: true,
      corpoTesto:
        'Buonasera,\n\nil mazzo che avevo ordinato per l’anniversario di mia moglie doveva arrivare ieri pomeriggio e non è mai arrivato. Nessuno mi ha avvisato.\n\nVorrei capire cosa è successo.\n\nAntonio Greco',
      sezione: 'Ordini',
      priorita: 'alta',
      riassunto:
        'Lamenta che la consegna dell’anniversario di ieri pomeriggio non è arrivata e nessuno l’ha avvisato.',
      serveRisposta: true,
      attivita: [
        {
          titolo: 'Ricostruire cosa è successo alla consegna Greco di ieri',
          dettaglio: 'Cliente non avvisato del mancato arrivo. Chiamare il corriere.',
          scadenza: new Date(),
          priorita: 'alta',
        },
      ],
      bozza: {
        oggetto: 'Re: Consegna di ieri mai arrivata',
        corpo:
          'Buongiorno signor Greco,\n\nci scusiamo: la consegna di ieri non è arrivata e non l’abbiamo avvisata, e questo non è il servizio che vogliamo darle.\n\nStiamo verificando cosa è successo con il corriere e le do un riscontro entro [inserire orario] di oggi. Nel frattempo possiamo riconsegnare il mazzo [inserire data e fascia oraria], senza costi aggiuntivi.\n\nMi dica se la soluzione le va bene.\n\nCordiali saluti,\nDeluxy',
      },
    },
    {
      uid: 1005,
      mittenteNome: 'Flower Trends',
      mittente: 'newsletter@flowertrends.com',
      oggetto: 'Newsletter di luglio: le tendenze floreali dell’estate',
      data: oreFa(30),
      letto: true,
      corpoTesto:
        'Le tendenze floreali dell’estate 2026: colori caldi, composizioni asimmetriche e fiori secchi.\n\nLeggi l’articolo completo sul nostro sito.',
      sezione: 'Da ignorare',
      priorita: 'bassa',
      riassunto: 'Newsletter commerciale sulle tendenze floreali estive: non richiede nulla.',
      serveRisposta: false,
      smistatoDa: 'regola',
      attivita: [],
      bozza: null,
    },
  ]

  for (const m of messaggi) {
    const creato = await db.messaggio.create({
      data: {
        accountId: account.id,
        uid: m.uid,
        messageId: `<demo-${m.uid}@deluxy.it>`,
        mittente: m.mittente,
        mittenteNome: m.mittenteNome,
        destinatari: 'posta@deluxy.it',
        oggetto: m.oggetto,
        data: m.data,
        anteprima: m.corpoTesto.replace(/\s+/g, ' ').slice(0, 200),
        corpoTesto: m.corpoTesto,
        allegati: m.allegati ?? 0,
        letto: m.letto ?? false,
        sezioneId: sezioni[m.sezione],
        smistatoDa: m.smistatoDa ?? 'ai',
        priorita: m.priorita,
        riassunto: m.riassunto,
        serveRisposta: m.serveRisposta,
        analizzatoIl: m.data,
      },
    })

    for (const a of m.attivita) {
      await db.attivita.create({ data: { ...a, messaggioId: creato.id } })
    }
    if (m.bozza) {
      await db.bozza.create({
        data: { messaggioId: creato.id, ...m.bozza, corpoAI: m.bozza.corpo },
      })
    }
  }

  console.log(
    `Seed completato: ${messaggi.length} messaggi, 4 sezioni, 3 regole. Dati di esempio, non reali.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
