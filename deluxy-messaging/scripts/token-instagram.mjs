// Trova i dati da incollare in /account-meta per Instagram e Messenger.
//
// Un «token Instagram» non esiste: Instagram Messaging passa dalla Messenger
// Platform, quindi serve il PAGE ACCESS TOKEN della Pagina Facebook collegata
// al profilo. Questo script parte dal token dell'utente di sistema e tira fuori
// per ogni Pagina: id della Pagina, id dell'account Instagram, @nome utente,
// il token di Pagina e se la nostra app è già iscritta agli eventi.
//
//   cd deluxy-messaging
//   node scripts/token-instagram.mjs                 # token mascherato
//   node scripts/token-instagram.mjs --mostra-token  # token in chiaro, da copiare
//
// Il token dell'utente di sistema si mette in `.env` (che è in .gitignore):
//   META_TOKEN=EAAG…
// oppure si passa come variabile d'ambiente della sola esecuzione.
//
// ⚠️ Sola lettura: non iscrive niente e non scrive nel database. L'iscrizione
// della Pagina (POST /subscribed_apps) resta un gesto da fare a mano: cambia la
// configurazione di Meta e va deciso da una persona.

import { readFileSync } from 'node:fs'

for (const file of ['.env', '.env.local']) {
  try {
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // il file può non esserci
  }
}

const API = 'https://graph.facebook.com/v21.0'
const mostra = process.argv.includes('--mostra-token')
// ⚠️ Il BOM e gli spazi si portano dietro dal copia-incolla e fanno fallire
// l'header con un errore che parla di byte, non di permessi.
const token = (process.env.META_TOKEN ?? '').replace(/^﻿/, '').trim()

if (!token) {
  console.error(
    'Manca META_TOKEN.\n' +
      'Mettilo in deluxy-messaging/.env (META_TOKEN=EAAG…) oppure passalo così:\n' +
      '  META_TOKEN=EAAG… node scripts/token-instagram.mjs\n\n' +
      'Si genera in Business Manager → Impostazioni azienda → Utenti → Utenti di\n' +
      'sistema → deluxy → Genera token, con pages_show_list, pages_messaging,\n' +
      'pages_manage_metadata, instagram_basic, instagram_manage_messages.'
  )
  process.exit(1)
}

function mascherato(v) {
  return mostra ? v : `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} caratteri)`
}

async function chiedi(percorso) {
  const res = await fetch(`${API}/${percorso}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const corpo = await res.json().catch(() => ({}))
  return { ok: res.ok, corpo }
}

const pagine = await chiedi(
  'me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=50'
)

if (!pagine.ok) {
  const e = pagine.corpo.error ?? {}
  console.error(`Meta ha risposto: ${e.message ?? 'errore'} (codice ${e.code ?? '?'})`)
  console.error(
    e.code === 190
      ? 'Token scaduto o revocato: rigeneralo dall’utente di sistema.'
      : 'Se parla di permessi, all’utente di sistema manca la Pagina fra le risorse assegnate.'
  )
  process.exit(1)
}

const elenco = pagine.corpo.data ?? []
if (elenco.length === 0) {
  console.log(
    'Nessuna Pagina visibile con questo token.\n' +
      'All’utente di sistema va assegnata la Pagina Facebook (Gestione completa),\n' +
      'non solo il WhatsApp Business.'
  )
  process.exit(0)
}

for (const p of elenco) {
  const ig = p.instagram_business_account
  console.log(`\n=== ${p.name} ===`)
  console.log(`  ID della pagina (Messenger): ${p.id}`)
  console.log(
    ig
      ? `  ID account Instagram: ${ig.id}   @${ig.username}`
      : '  Instagram: NESSUNO collegato a questa Pagina (il profilo dev’essere professionale e collegato)'
  )
  console.log(`  Page Access Token: ${mascherato(p.access_token)}`)

  const iscritte = await chiedi(`${p.id}/subscribed_apps?access_token=${p.access_token}`)
  const campi = iscritte.corpo?.data?.[0]?.subscribed_fields
  console.log(
    `  App iscritta agli eventi: ${
      campi ? `sì → ${campi.join(', ')}` : 'NO — senza questo i messaggi non arrivano mai'
    }`
  )
}

if (!mostra) {
  console.log(
    '\nI token sono mascherati. Per copiarli:  node scripts/token-instagram.mjs --mostra-token'
  )
}
