// Porta il "Cliente per l'anno" di FINANCE nello **stato analisi** del registro
// Deluxy Anagrafiche (P.P. = pari perimetro, Nuovo, Dismesso).
//
//   node scripts/sync-stato-analisi.mjs [--dry]
//
// Legge i partner di questa app, li aggancia al registro per `anagraficaId`
// (o, se manca, per nome esatto — e in quel caso salva il collegamento), e
// manda `PATCH /api/v1/partners/:id { statoAnalisi, asOf }`.
// Env dal .env locale: ANAGRAFICHE_URL, ANAGRAFICHE_WRITE_KEY (o ANAGRAFICHE_API_KEY).
// Idempotente: chi ha già lo stato giusto nel registro viene saltato.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const dir = dirname(fileURLToPath(import.meta.url));

// .env minimale (senza dipendenze): NOME=valore, righe commentate escluse
function caricaEnv() {
  try {
    for (const riga of readFileSync(join(dir, "..", ".env"), "utf8").split(/\r?\n/)) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const valore = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = valore;
    }
  } catch {
    // nessun .env: si usano le variabili già nell'ambiente
  }
}
caricaEnv();

const DRY = process.argv.includes("--dry");
const BASE = process.env.ANAGRAFICHE_URL || "http://localhost:3060";
const KEY = process.env.ANAGRAFICHE_WRITE_KEY || process.env.ANAGRAFICHE_API_KEY;

// Stessa mappa di src/lib/anagrafiche.ts (qui in JS per lo script)
function statoAnalisiDa(clienteAnno) {
  const v = (clienteAnno ?? "").trim().toLowerCase().replace(/\./g, "");
  if (v === "pp") return "pp";
  if (v === "nuovo") return "nuovo";
  if (v === "dismesso") return "dismesso";
  return null;
}

async function api(percorso, opzioni = {}) {
  const res = await fetch(`${BASE}${percorso}`, {
    ...opzioni,
    headers: { "x-api-key": KEY, "Content-Type": "application/json", ...(opzioni.headers ?? {}) },
  });
  const testo = await res.text();
  let json = null;
  try {
    json = JSON.parse(testo);
  } catch {
    /* risposta non JSON */
  }
  return { ok: res.ok, status: res.status, json, testo };
}

// In FINANCE l'insegna porta spesso la ragione sociale fra parentesi
// ("MALIA (RO.VI SNC)"): nel registro invece è solo l'insegna.
function insegna(nome) {
  return nome.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// Match prudente: prima il nome completo identico, poi la sola insegna — e in
// quel caso solo se il risultato è UNO (o uno solo nella stessa città), per non
// agganciare l'azienda sbagliata. Gli ambigui restano da risolvere a mano.
async function cercaNelRegistro(p) {
  const cerca = async (q) => {
    const r = await api(`/api/v1/partners?q=${encodeURIComponent(q)}&perPage=25`);
    return r.json?.dati ?? [];
  };
  const dati = await cerca(p.nome);
  const identica = dati.find((a) => a.nome?.toLowerCase() === p.nome.toLowerCase());
  if (identica) return identica;

  const breve = insegna(p.nome);
  if (breve.toLowerCase() === p.nome.toLowerCase()) return dati.length === 1 ? dati[0] : null;

  const perBreve = (await cerca(breve)).filter((a) => a.nome?.toLowerCase() === breve.toLowerCase());
  if (perBreve.length === 1) return perBreve[0];
  if (perBreve.length > 1 && p.citta) {
    const stessaCitta = perBreve.filter((a) => (a.citta ?? "").toLowerCase() === p.citta.toLowerCase());
    if (stessaCitta.length === 1) return stessaCitta[0];
  }
  return null;
}

const prisma = new PrismaClient();

async function main() {
  if (!KEY) {
    console.error("Manca ANAGRAFICHE_WRITE_KEY (o ANAGRAFICHE_API_KEY) nel .env: niente scrittura.");
    process.exit(1);
  }
  console.log(`Registro: ${BASE}${DRY ? "  [PROVA: nessuna scrittura]" : ""}`);

  const partner = await prisma.partner.findMany({
    where: { attivo: true },
    select: { id: true, nome: true, citta: true, clienteAnno: true, anagraficaId: true },
    orderBy: { nome: "asc" },
  });

  const conteggi = { scritti: 0, gia: 0, senzaStato: 0, nonTrovati: 0, errori: 0, agganciati: 0 };

  for (const p of partner) {
    const stato = statoAnalisiDa(p.clienteAnno);
    if (!stato) {
      conteggi.senzaStato++;
      continue;
    }

    // 1) id del registro: quello salvato, oppure match per nome
    let anagraficaId = p.anagraficaId;
    if (!anagraficaId) {
      const esatta = await cercaNelRegistro(p);
      if (!esatta) {
        conteggi.nonTrovati++;
        console.log(`· ${p.nome} — nessuna anagrafica nel registro (${p.clienteAnno})`);
        continue;
      }
      anagraficaId = esatta.id;
      if (!DRY) {
        await prisma.partner.update({ where: { id: p.id }, data: { anagraficaId } });
        conteggi.agganciati++;
      }
    }

    // 2) già allineata? (idempotenza)
    const attuale = await api(`/api/v1/partners/${encodeURIComponent(anagraficaId)}`);
    if (attuale.ok && attuale.json?.statoAnalisi === stato) {
      conteggi.gia++;
      continue;
    }

    if (DRY) {
      console.log(`→ ${p.nome}: ${attuale.json?.statoAnalisi ?? "vuoto"} → ${stato}`);
      conteggi.scritti++;
      continue;
    }

    const res = await api(`/api/v1/partners/${encodeURIComponent(anagraficaId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        statoAnalisi: stato,
        sistema: "deluxy-partner",
        asOf: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      conteggi.scritti++;
      console.log(`✓ ${p.nome}: stato analisi = ${stato}`);
    } else {
      conteggi.errori++;
      console.log(`✗ ${p.nome}: ${res.status} ${res.testo.slice(0, 120)}`);
    }
  }

  console.log(
    `\nFatto — scritti ${conteggi.scritti}, già allineati ${conteggi.gia}, ` +
      `senza "Cliente per l'anno" ${conteggi.senzaStato}, non trovati nel registro ${conteggi.nonTrovati}, ` +
      `errori ${conteggi.errori}, nuovi collegamenti anagraficaId ${conteggi.agganciati}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
