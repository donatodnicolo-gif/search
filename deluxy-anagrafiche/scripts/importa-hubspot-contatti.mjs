// Importa i contatti (persone) da HubSpot e li aggancia come referenti ai
// partner del registro. Associazione contatto→azienda→partner risolta prima
// per id (hubspotId / riferimento esterno), poi per nome azienda normalizzato
// (come il sync), solo se il nome mappa a un unico partner. Idempotente:
// i referenti già presenti (per email/telefono/nome) non vengono duplicati.
//
// Con --crea-aziende: se l'azienda HubSpot non esiste nel registro, viene
// CREATA come anagrafica (prospect, DA CLASSIFICARE, fonte hubspot) così NESSUN
// contatto viene scartato. In cambio possono nascere anagrafiche di gruppo/
// holding (es. "Aeffe Group") da riordinare poi.
//
// Uso: node scripts/importa-hubspot-contatti.mjs [--crea-aziende]
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();
const creaAziende = process.argv.includes("--crea-aziende");
const token =
  process.env.HUBSPOT_ACCESS_TOKEN ||
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/HUBSPOT_ACCESS_TOKEN="([^"]+)"/)?.[1];
if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN non configurato");

const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(srl|srls|spa|snc|sas|s\.r\.l\.|s\.p\.a\.)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const chiave = (c) =>
  c.email ? "e:" + c.email.toLowerCase().trim() : c.telefono ? "t:" + c.telefono.replace(/\s+/g, "") : c.nome ? "n:" + norm(c.nome) : null;

async function hsGet(url) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("HubSpot HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

// 1. Companies: id -> { nome, city, domain, phone }
const companyMeta = new Map();
{
  let after;
  do {
    const u = new URL("https://api.hubapi.com/crm/v3/objects/companies");
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "name,city,domain,phone");
    if (after) u.searchParams.set("after", after);
    const j = await hsGet(u);
    for (const r of j.results)
      if (r.properties.name)
        companyMeta.set(r.id, {
          nome: r.properties.name,
          city: r.properties.city || null,
          domain: r.properties.domain || null,
          phone: r.properties.phone || null,
        });
    after = j.paging?.next?.after;
  } while (after);
}

// 2. Registro: mappe companyId->partner (id/xref) e nomeNormalizzato->partner (se unico)
const partner = await prisma.partner.findMany({
  where: { attivo: true },
  select: { id: true, nome: true, hubspotId: true, contatti: true },
});
const partnerById = new Map(partner.map((p) => [p.id, p]));
const perHubspotId = new Map();
partner.forEach((p) => p.hubspotId && perHubspotId.set(p.hubspotId, p));
(await prisma.riferimentoEsterno.findMany({ where: { sistema: "hubspot" } })).forEach((x) => {
  const p = partnerById.get(x.partnerId);
  if (p) perHubspotId.set(x.idEsterno, p);
});
const perNome = new Map();
const ambigui = new Set();
for (const p of partner) {
  const k = norm(p.nome);
  if (perNome.has(k)) ambigui.add(k);
  else perNome.set(k, p);
}
ambigui.forEach((k) => perNome.delete(k)); // nomi non univoci: non si aggancia alla cieca

let aziendeCreate = 0;

// Risolve (e, con --crea-aziende, crea) l'anagrafica dell'azienda HubSpot.
async function partnerPerCompany(companyId) {
  if (perHubspotId.has(companyId)) return perHubspotId.get(companyId);
  const meta = companyMeta.get(companyId);
  if (!meta) return null;
  const perN = perNome.get(norm(meta.nome));
  if (perN) return perN;
  if (!creaAziende) return null;
  // Crea l'anagrafica dalla company HubSpot (come il bottone "importa" del sync)
  const creato = await prisma.partner.create({
    data: {
      nome: meta.nome,
      categoria: "DA CLASSIFICARE",
      stato: "prospect",
      citta: meta.city ? meta.city.toUpperCase() : null,
      telefono: meta.phone,
      note: meta.domain ? `Sito: ${meta.domain}` : null,
      fonte: "hubspot",
      hubspotId: companyId,
    },
    select: { id: true, nome: true, hubspotId: true },
  });
  const rec = { ...creato, contatti: [] };
  partnerById.set(rec.id, rec);
  perHubspotId.set(companyId, rec);
  perNome.set(norm(meta.nome), rec);
  aziendeCreate++;
  return rec;
}

// 3. Contatti HubSpot → accumula per partner
const daAggiungere = new Map(); // partnerId -> [contatti]
let totContatti = 0;
let senzaAzienda = 0;
{
  let after;
  do {
    const u = new URL("https://api.hubapi.com/crm/v3/objects/contacts");
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "firstname,lastname,email,phone,jobtitle");
    u.searchParams.set("associations", "companies");
    if (after) u.searchParams.set("after", after);
    const j = await hsGet(u);
    for (const r of j.results) {
      totContatti++;
      const pr = r.properties;
      const nome = [pr.firstname, pr.lastname].filter(Boolean).join(" ").trim() || (pr.email ? pr.email.split("@")[0] : "");
      if (!nome && !pr.phone && !pr.email) continue;
      const companyIds = [...new Set((r.associations?.companies?.results || []).map((x) => x.id))];
      if (companyIds.length === 0) {
        senzaAzienda++;
        continue; // un referente senza azienda non ha dove stare nel registro
      }
      const partnersVisti = new Set();
      for (const cid of companyIds) {
        const p = await partnerPerCompany(cid);
        if (!p || partnersVisti.has(p.id)) continue;
        partnersVisti.add(p.id);
        if (!daAggiungere.has(p.id)) daAggiungere.set(p.id, []);
        daAggiungere.get(p.id).push({
          ruolo: pr.jobtitle || null,
          nome: nome || null,
          telefono: pr.phone || null,
          email: pr.email || null,
          hubspotId: r.id,
        });
      }
    }
    after = j.paging?.next?.after;
  } while (after);
}

// 4. Scrittura con dedup per identità (email>telefono>nome). Se il referente
// esiste già, gli si aggancia comunque l'id HubSpot (per aprirlo nel CRM).
let aggiunti = 0;
let arricchiti = 0;
let partnerToccati = 0;
for (const [partnerId, nuovi] of daAggiungere) {
  const p = partnerById.get(partnerId);
  if (!p || !nuovi?.length) continue;
  const perChiaveEsistente = new Map((p.contatti || []).map((c) => [chiave(c), c]).filter(([k]) => k));
  const daCreare = [];
  let toccato = false;
  for (const c of nuovi) {
    const k = chiave(c);
    const esistente = k ? perChiaveEsistente.get(k) : null;
    if (esistente) {
      if (!esistente.hubspotId && c.hubspotId) {
        await prisma.contatto.update({ where: { id: esistente.id }, data: { hubspotId: c.hubspotId } });
        arricchiti++;
        toccato = true;
      }
      continue;
    }
    if (k) perChiaveEsistente.set(k, { ...c, id: "nuovo" });
    daCreare.push({ ...c, fonte: "hubspot" });
  }
  if (daCreare.length) {
    await prisma.partner.update({ where: { id: partnerId }, data: { contatti: { create: daCreare } } });
    aggiunti += daCreare.length;
    toccato = true;
  }
  if (toccato) partnerToccati++;
}

console.log(
  `Contatti HubSpot letti: ${totContatti} | senza azienda (saltati): ${senzaAzienda} | ` +
    `aziende create: ${aziendeCreate} | referenti aggiunti: ${aggiunti} | id agganciati a esistenti: ${arricchiti} | su ${partnerToccati} partner`,
);
await prisma.$disconnect();
