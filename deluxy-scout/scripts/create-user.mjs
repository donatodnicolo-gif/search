#!/usr/bin/env node
// Crea (o aggiorna) l'utente di login dell'app in Supabase Auth, via Admin API.
//
// La password la fornisci TU tramite variabile d'ambiente: non passa mai per
// l'agente. L'utente viene creato già confermato (email_confirm=true), così
// puoi accedere subito dall'app senza passaggio di conferma email.
//
// Uso (PowerShell):
//   $env:SUPABASE_URL = "https://fdsziebgkljfsugqqbqd.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"   # Dashboard → Project Settings → API
//   $env:SCOUT_EMAIL = "nome@deluxy.it"
//   $env:SCOUT_PASSWORD = "<password scelta da te>"     # min 6 caratteri
//   node scripts/create-user.mjs
//
// Se l'utente esiste già, ne aggiorna la password e lo conferma (idempotente).
// Nota: usa la SERVICE ROLE KEY (solo lato terminale, MAI nell'app). Non committare.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SCOUT_EMAIL;
const password = process.env.SCOUT_PASSWORD;

if (!url || !key) {
  console.error('Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!email || !password) {
  console.error('Mancano SCOUT_EMAIL / SCOUT_PASSWORD');
  process.exit(1);
}
if (password.length < 6) {
  console.error('La password deve avere almeno 6 caratteri.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// L'Admin API non ha un lookup diretto per email: pagina la lista utenti.
async function trovaPerEmail(target) {
  const t = target.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => (x.email ?? '').toLowerCase() === t);
    if (u) return u;
    if (data.users.length < 200) break; // ultima pagina
  }
  return null;
}

const esistente = await trovaPerEmail(email);

if (esistente) {
  const { error } = await supabase.auth.admin.updateUserById(esistente.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('Errore aggiornamento utente:', error.message);
    process.exit(1);
  }
  console.log(`Utente esistente aggiornato ✔  (${email})  id=${esistente.id}`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('Errore creazione utente:', error.message);
    process.exit(1);
  }
  console.log(`Utente creato ✔  (${email})  id=${data.user.id}`);
}

console.log('Ora puoi accedere dall\'app con questa email e password.');
