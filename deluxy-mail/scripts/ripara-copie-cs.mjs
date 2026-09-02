// RIPARA LE DUE COPIE DI cs@deluxy.it (02/09/2026).
//
// Il dedup della posta in arrivo era per UTENTE invece che per CASELLA: per chi
// ha più caselle, una mail arrivata su due di esse veniva tenuta solo sotto la
// prima sincronizzata. Risultato misurato: la copia di cs@ dell'utente Nicolò
// aveva 1.609 mail in meno (da febbraio) di quella dell'utente cs@ — «due
// utenti sulla stessa mail vedono cose differenti». Il codice è corretto dal
// commit di oggi; QUESTO script ripara il pregresso travasando le righe
// mancanti fra le due copie, nei due sensi.
//
// Sicurezze:
// - id deterministici ('bf' + id di origine) + ON CONFLICT DO NOTHING:
//   rieseguirlo non crea doppioni;
// - `notificatoIl = now()`: le righe travasate NON fanno partire notifiche push;
// - SPAM va nello SPAM dell'utente di destinazione, il resto entra non smistato;
// - letto/archiviato/cestinato si copiano dalla copia buona (stato di lavoro già
//   fatto); i campi AI (priorità, riassunti) NON si copiano: sono per utente;
// - si toccano SOLO le due copie di cs@deluxy.it, per id esatto.
//
// Si lancia dalla cartella deluxy-mail:  node scripts/ripara-copie-cs.mjs
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const env = readFileSync('.env', 'utf8')
const url = env
  .match(/^DATABASE_URL="?([^"\n\r]+)"?/m)[1]
  .replace(':6543/', ':5432/')
  .replace('pgbouncer=true&', '')
const p = new PrismaClient({ datasources: { db: { url } } })

// Le due copie della casella cs@deluxy.it e le sezioni SPAM dei due utenti.
const CS = { acc: 'cmswz9pkq0001i704lvnsuqf7', spam: 'cmswza9f4002ljp04tj6yxzdr' } // utente cs@
const NIC = { acc: 'cms2z5pqu0002l504qu7iln5w', spam: 'cmrrd7tbp0001kz04tf5lftop' } // utente nicolo

async function travasa(da, a, etichetta) {
  const [dest] = await p.$queryRawUnsafe(`select "utenteId" from mail."Account" where id='${a.acc}'`)
  const r = await p.$executeRawUnsafe(`
    insert into mail."Messaggio"
      (id, "utenteId", "accountId", uid, "messageId", thread, direzione, mittente, "mittenteNome",
       destinatari, oggetto, data, anteprima, "corpoTesto", "corpoHtml", allegati, dimensione,
       letto, archiviato, cestinato, "cestinatoIl", "sezioneId", "notificatoIl", lingua, "corpoTradotto", "creatoIl")
    select
      'bf' || m.id, '${dest.utenteId}', '${a.acc}', m.uid, m."messageId", m.thread, 'entrata',
      m.mittente, m."mittenteNome", m.destinatari, m.oggetto, m.data, m.anteprima,
      m."corpoTesto", m."corpoHtml", m.allegati, m.dimensione,
      m.letto, m.archiviato, m.cestinato, m."cestinatoIl",
      case when m."sezioneId" = '${da.spam}' then '${a.spam}' else null end,
      now(), m.lingua, m."corpoTradotto", m."creatoIl"
    from mail."Messaggio" m
    where m."accountId" = '${da.acc}' and m.direzione = 'entrata' and m.uid > 0
      and not exists (select 1 from mail."Messaggio" x
                      where x."accountId" = '${a.acc}' and x.direzione = 'entrata' and x.uid = m.uid)
    on conflict do nothing`)
  console.log(etichetta, '→ copiate', r, 'righe')
}

await travasa(CS, NIC, 'da copia utente-cs a copia utente-nicolo')
await travasa(NIC, CS, 'da copia utente-nicolo a copia utente-cs')

const [v] = await p.$queryRawUnsafe(`select
  (select count(*)::int from mail."Messaggio" where "accountId"='${CS.acc}' and direzione='entrata' and uid>0) as cs,
  (select count(*)::int from mail."Messaggio" where "accountId"='${NIC.acc}' and direzione='entrata' and uid>0) as nicolo,
  (select count(*)::int from mail."Messaggio" m where m."accountId"='${CS.acc}' and m.direzione='entrata' and m.uid>0
     and not exists (select 1 from mail."Messaggio" x where x."accountId"='${NIC.acc}' and x.direzione='entrata' and x.uid=m.uid)) as solo_cs,
  (select count(*)::int from mail."Messaggio" m where m."accountId"='${NIC.acc}' and m.direzione='entrata' and m.uid>0
     and not exists (select 1 from mail."Messaggio" x where x."accountId"='${CS.acc}' and x.direzione='entrata' and x.uid=m.uid)) as solo_nicolo`)
console.log('DOPO — righe: cs =', v.cs, '· nicolo =', v.nicolo, '· solo_cs =', v.solo_cs, '· solo_nicolo =', v.solo_nicolo)
console.log(v.solo_cs === 0 && v.solo_nicolo === 0 ? '✅ Le due copie sono identiche.' : '⚠️ Restano differenze: rilancia o guarda i conteggi.')
await p.$disconnect()
