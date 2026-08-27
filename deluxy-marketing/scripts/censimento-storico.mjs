// IL CENSIMENTO STORICO DELLE CAMPAGNE — il comando che lo mette in moto.
//
//   node scripts/censimento-storico.mjs --stato     (cosa c'è già dentro)
//   node scripts/censimento-storico.mjs --copie     (le copie Google da incollare)
//   node scripts/censimento-storico.mjs --meta      (lancia il giro Meta, davvero)
//   node scripts/censimento-storico.mjs --meta --anni 3 --app http://localhost:3130
//
// ⚠️ PERCHÉ DUE STRADE DIVERSE PER I DUE CANALI, e non è una svista:
//   · GOOGLE non ha un'API aperta da qui: i dati escono da uno Script che gira
//     DENTRO l'account. Quindi si genera la copia, la si incolla, e lo script
//     spinge il censimento verso l'app. Da fuori non si può fare partire.
//   · META ha l'API, ma la chiave (`META_ACCESS_TOKEN`) vive SOLO come
//     variabile d'ambiente dell'app su Vercel. Portarla sul portatile per
//     comodità vorrebbe dire scriverla su disco: il giro lo fa l'app, e da qui
//     si bussa con la chiave API.
//
// ⚠️ È ripetibile: la chiave (canale, account, campagna, anno) fa sì che
// rilanciarlo AGGIORNI i totali invece di sommarli a sé stessi.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const argomenti = process.argv.slice(2);
const ha = (f) => argomenti.includes(f);
const valore = (f, def) => {
  const i = argomenti.indexOf(f);
  return i >= 0 && argomenti[i + 1] ? argomenti[i + 1] : def;
};

const APP = valore("--app", process.env.MARKETING_URL ?? "https://deluxy-marketing.vercel.app");
const CHIAVE = process.env.MARKETING_API_KEY ?? "";

async function chiama(percorso, opzioni = {}) {
  const r = await fetch(`${APP}${percorso}`, {
    ...opzioni,
    headers: { "content-type": "application/json", "x-api-key": CHIAVE, ...(opzioni.headers ?? {}) },
  });
  const testo = await r.text();
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    dati = { grezzo: testo.slice(0, 300) };
  }
  return { ok: r.ok, codice: r.status, dati };
}

function esigiChiave() {
  if (!CHIAVE) {
    console.error(
      "MARKETING_API_KEY non impostata nel .env: senza, l'app non sa chi sta bussando.\n" +
        "  npm run configura-db -- ../deluxy-hub/.env  (rigenera il .env)"
    );
    process.exit(1);
  }
}

async function stato() {
  esigiChiave();
  const { ok, codice, dati } = await chiama("/api/v1/censimento");
  if (!ok) {
    console.error(`L'app ha risposto ${codice}:`, dati);
    process.exit(1);
  }
  console.log(`Campagne censite: ${dati.totaleCampagne}`);
  console.log(`Mai viste dall'app: ${dati.maiVisteDallApp}`);
  console.log(`Spesa censita: ${dati.spesaTotale} €`);
  console.log(`Ultimo censimento: ${dati.ultimaCorsa ?? "mai"}`);
  for (const a of dati.perAnno ?? []) {
    console.log(
      ` · ${a.anno}: ${a.campagne} campagne (${a.conSpesa} hanno speso) · ${Math.round(a.spesa)} €`
    );
  }
  if ((dati.totaleCampagne ?? 0) === 0) {
    console.log("\nNiente ancora. Vedi --copie (Google) e --meta (Meta).");
  }
}

async function meta() {
  esigiChiave();
  const anni = Number(valore("--anni", "3"));
  console.log(`Censimento Meta · ultimi ${anni} anni · ${APP}`);
  console.log("Lo fa l'app (il token Meta vive lì). Può prendersi qualche minuto…");
  const { ok, codice, dati } = await chiama("/api/v1/censimento/meta", {
    method: "POST",
    body: JSON.stringify({ anni }),
  });
  if (!ok) {
    console.error(`L'app ha risposto ${codice}:`, dati);
    process.exit(1);
  }
  console.log(`Periodo: ${dati.dal} → ${dati.al}`);
  for (const e of dati.esiti ?? []) {
    // ⚠️ L'errore di un account si stampa accanto a quello che è riuscito
    // negli altri: un riepilogo che mostra solo i successi fa credere completo
    // un censimento che non lo è.
    console.log(
      ` · ${e.nome} (${e.account}): ${e.campagne} campagne · ${e.righeSalvate} righe · ${e.spesa} €` +
        (e.anni?.length ? ` · anni ${e.anni.join(", ")}` : "") +
        (e.errore ? `\n   ⚠ ${e.errore}` : "")
    );
  }
  console.log(`\n${dati.nota}`);
}

function copie() {
  const sorgente = new URL("./google-ads-censimento-storico.js", import.meta.url);
  let testo = fs.readFileSync(sorgente, "utf8");

  const anni = valore("--anni", null);
  if (anni) testo = testo.replace(/^var ANNI = \d+;/m, `var ANNI = ${Number(anni)};`);
  if (APP !== "https://deluxy-marketing.vercel.app") {
    testo = testo.replace(/^var APP = "[^"]*";/m, `var APP = "${APP}";`);
  }

  const cartella =
    valore("--cartella", null) ??
    path.join(process.env.USERPROFILE ?? ".", "Downloads", "deluxy-google-ads");
  fs.mkdirSync(cartella, { recursive: true });
  const file = path.join(cartella, "censimento-storico.js");
  fs.writeFileSync(file, testo, "utf8");

  console.log(`Copia pronta: ${file}`);
  console.log("");
  console.log("Che farsene, una volta per ACCOUNT (Cake, Gifts, Flowers):");
  console.log(" 1. Google Ads → Strumenti → Azioni collettive → Script → +");
  console.log(" 2. incollare il file, mettere CHIAVE_API (chiave con SCRITTURA)");
  console.log(" 3. ANTEPRIMA (var ANTEPRIMA = true) per vedere i conteggi senza mandare niente");
  console.log(" 4. rimettere ANTEPRIMA = false ed ESEGUI");
  console.log("");
  // ⚠️ La chiave resta VUOTA nel file apposta: un file con la chiave dentro
  // finisce in Downloads, nei backup e prima o poi in un allegato.
  console.log("La CHIAVE_API non è nel file di proposito: si mette a mano dentro Google Ads.");
  console.log("Poi: node scripts/censimento-storico.mjs --stato");
}

if (ha("--meta")) await meta();
else if (ha("--copie")) copie();
else if (ha("--stato")) await stato();
else {
  console.log("Cosa vuoi fare?");
  console.log("  --stato   cosa c'è già nel censimento");
  console.log("  --copie   prepara la copia dello script per Google Ads");
  console.log("  --meta    lancia adesso il giro Meta (lo esegue l'app)");
}
