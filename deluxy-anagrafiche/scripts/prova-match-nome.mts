// Prova del match per NOME sui dati veri del registro.
//
// ⚠️⚠️ Nasce da un errore in produzione (25/08/2026): il Customer Service ha
// chiesto «Paradis des fleurs», l'unico risultato è stato «Contatti senza
// azienda (HubSpot)» — un contenitore con 288 contatti dentro, in cui le tre
// parole comparivano sparse — e quel contenitore si è preso un
// `statoFornitore: abituale` che non gli appartiene.
//
// Qui si interroga il DATABASE VERO con i 17 fornitori pagati dal Customer
// Service, e si guarda che cosa risponderebbe oggi.
import "dotenv/config";
import { risolviMatch, nomeAffine } from "../src/lib/match";

const NOMI = [
  "Paradis des fleurs",
  "RIGUTTO ELENA",
  "donna di fiori di Longo Michela",
  "Beatriz Neto",
  "JAN MORODER FLEURES",
  "SO'FLEUR",
  "Battistella fioreria srl",
  "Goshà flowers",
  "civico 95",
  "ROSE CAKE DI ZORZ ALESSANDRO",
  "BUFFA GIOVANNA",
  "Ratschiller Erika",
  "LA BOUTIQUE DEI FIORI DI CARDELLA TERESA DESIRÉ",
  "Vecchio Maurizio",
  "S.A.S. ELENA FLEURS 46 RUE ARSON 06300 NICE",
  "Passiflora flower market",
  "Sa Commercial Garden Group srls",
];

let male = 0;
for (const nome of NOMI) {
  const r = await risolviMatch({ nome });
  const dettaglio =
    r.esito === "agganciata"
      ? `→ «${r.match?.nome}»`
      : r.esito === "candidati"
        ? `(${r.candidati.length}: ${r.candidati.map((c) => c.nome).join(", ").slice(0, 90)})`
        : "";
  console.log(`${r.esito.padEnd(11)} ${r.confidenza.padEnd(8)} ${nome.padEnd(48)} ${dettaglio}`);
  // ⚠️ La regola d'oro: un «agganciata» deve reggere il confronto dei nomi.
  if (r.esito === "agganciata" && !nomeAffine(nome, r.match?.nome ?? "")) {
    console.log(`   NO — agganciata a un nome che non è il suo`);
    male++;
  }
}
console.log(male ? `\n${male} agganci sbagliati` : "\nNessun aggancio sbagliato");
process.exit(male ? 1 : 0);
