// Dice QUALI chiavi ci sono in `.env.altre-app` e quali mancano, senza mai
// stamparne il valore. Serve a rispondere alla domanda «posso lavorare sulla
// coda del Customer Service?» senza che nessuno debba aprire il file e leggere
// un segreto a video — e senza che un segreto finisca in una trascrizione.
//
//   node --env-file=.env.altre-app scripts/chiavi-presenti.mjs
//
// Della chiave API mostra solo il PREFISSO (`trx_xxxxxxxx`): non è un segreto,
// è l'identificativo che si vede anche nella pagina /chiavi e sul database,
// e serve a controllare di avere la chiave GIUSTA e non quella di un'altra app.
// Del segreto HMAC non esce niente: solo «c'è» o «manca», e la sua lunghezza,
// che è l'unico modo per accorgersi di un incollaggio troncato.

const APP = [
  { nome: "cs", etichetta: "Customer Service", cartella: "deluxy-messaging", prefissoAtteso: "trx_fOXncRWV" },
  { nome: "finance", etichetta: "Finance", cartella: "deluxy-partner", prefissoAtteso: "trx_ozWW4edK" },
  { nome: "piattaforma", etichetta: "Piattaforma consegne", cartella: "deluxy-platform-next", prefissoAtteso: "trx_DDpjkjZ8" },
  { nome: "scout", etichetta: "Scout", cartella: "deluxy-scout", prefissoAtteso: "trx_491Ft9ee" },
  { nome: "acquisti", etichetta: "Acquisti", cartella: "deluxy-acquisti", prefissoAtteso: "trx_CJn3ErNv" },
];

const INVISIBILI = new RegExp("[​-‍﻿ ]", "g");
const pulisci = (v) => (v ?? "").replace(INVISIBILI, "").trim().replace(/^["']|["']$/g, "").trim();

let pronte = 0;
console.log("chiave        app                    stato");
console.log("─".repeat(72));
for (const a of APP) {
  const prefisso = a.nome.toUpperCase();
  const chiave = pulisci(process.env[`${prefisso}_TRANSACTIONS_API_KEY`]);
  const segreto = pulisci(process.env[`${prefisso}_TRANSACTIONS_HMAC_SECRET`]);
  let stato;
  if (!chiave && !segreto) {
    stato = "— da compilare";
  } else if (!chiave) {
    stato = "INCOMPLETA: manca la chiave API";
  } else if (!segreto) {
    stato = "INCOMPLETA: manca il segreto HMAC";
  } else {
    const visto = chiave.slice(0, 11);
    const giusta = visto === a.prefissoAtteso;
    stato = `pronta · ${visto}… · segreto di ${segreto.length} caratteri`;
    if (!giusta) stato += `  ⚠️ atteso ${a.prefissoAtteso}: e' la chiave di un'altra app, o e' stata ruotata`;
    else pronte++;
  }
  console.log(a.nome.padEnd(13), a.etichetta.padEnd(22), stato);
}
console.log("─".repeat(72));
console.log(`${pronte} app su ${APP.length} pronte.`);
if (pronte < APP.length) {
  console.log("Le altre si compilano in .env.altre-app (fuori da GitHub). I valori");
  console.log("stanno nelle variabili d'ambiente dell'app corrispondente su Vercel.");
}
