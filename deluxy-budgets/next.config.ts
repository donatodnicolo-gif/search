import type { NextConfig } from "next";

// LE INTESTAZIONI DI SICUREZZA (27/08/2026).
//
// Trovate mancanti con un probe dall'esterno sulla produzione: c'era **solo**
// `Strict-Transport-Security`. Su un'app che dietro un cookie di sessione tiene
// stipendi, margini e movimenti bancari, le tre che seguono non sono formalità.
//
//  · **frame-ancestors 'none'** (e X-Frame-Options per i browser vecchi):
//    impediscono di caricare la pagina dentro una cornice altrui.
//
//    ⚠️ **Correzione di quel che c'era scritto qui prima** (27/08/2026). Questo
//    commento affermava che «`sameSite: lax` non ferma il clickjacking, perché
//    dentro una cornice il cookie viaggia». **È falso, ed è il contrario di come
//    funziona SameSite.** Un iframe caricato da un sito terzo è una richiesta
//    *cross-site di sottorisorsa*, non una navigazione di primo livello: il
//    cookie Lax **non parte**. La vittima nella cornice vedrebbe la schermata di
//    accesso, non la propria sessione — non c'è nessun bottone da farle
//    cliccare. (E `vercel.app` è nella Public Suffix List, quindi neanche un
//    altro progetto `*.vercel.app` conta come stesso sito.)
//
//    Si tiene lo stesso l'intestazione, ma per la ragione giusta: **difesa in
//    profondità**. Vale se un domani il cookie diventasse `sameSite: none` per
//    un'integrazione, o su un browser che non rispetta il default. Una difesa
//    tenuta per un motivo sbagliato è peggio di una difesa in meno: prima o poi
//    qualcuno la usa per concludere «tanto SameSite non protegge» in un
//    ragionamento sul CSRF, dove invece protegge.
//  · **X-Content-Type-Options: nosniff**: impedisce al browser di indovinare il
//    tipo di un file e di eseguire come script qualcosa che script non è.
//  · **Referrer-Policy**: senza, l'URL interno — che qui contiene id di
//    proposte, di voci di bilancio, di controparti — finisce nell'intestazione
//    Referer di ogni risorsa esterna richiesta dalla pagina.
//
// ⚠️ Una CSP intera non si mette di corsa: Next inietta script inline con nonce
// e una `script-src` scritta male rompe l'app in silenzio, in produzione, dopo
// il deploy. Qui si mette la parte che protegge **senza poter rompere niente**
// (`frame-ancestors`, che non riguarda gli script) e si lascia il resto come
// lavoro dichiarato, non come illusione.
const INTESTAZIONI_SICUREZZA = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: INTESTAZIONI_SICUREZZA }];
  },};

export default nextConfig;
