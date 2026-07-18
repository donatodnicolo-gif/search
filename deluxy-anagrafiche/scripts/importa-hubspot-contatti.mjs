// Importa i contatti (persone) da HubSpot e li aggancia come referenti ai
// partner del registro. Associazione contatto→azienda→partner risolta prima
// per id (hubspotId / riferimento esterno), poi per nome azienda normalizzato
// (come il sync), solo se il nome mappa a un unico partner. Idempotente:
// i referenti già presenti (per email/telefono/nome) non vengono duplicati.
//
// Uso: node scripts/importa-hubspot-contatti.mjs
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();
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

// 1. Companies: id -> nome
const companyNome = new Map();
{
  let after;
  do {
    const u = new URL("https://api.hubapi.com/crm/v3/objects/companies");
    u.searchParams.set("limit", "100");
    u.searchParams.set("properties", "name");
    if (after) u.searchParams.set("after", after);
    const j = await hsGet(u);
    for (const r of j.results) if (r.properties.name) companyNome.set(r.id, r.properties.name);
    after = j.paging?.next?.after;
  } while (after);
}

// 2. Registro: mappe companyId->partner (id/xref) e nomeNormalizzato->partner (se unico)
const partner = await prisma.partner.findMany({
  where: { attivo: true },
  select: { id: true, nome: true, hubspotId: true, contatti: true },
});
const perHubspotId = new Map();
partner.forEach((p) => p.hubspotId && perHubspotId.set(p.hubspotId, p));
(await prisma.riferimentoEsterno.findMany({ where: { sistema: "hubspot" } })).forEach((x) => {
  const p = partner.find((pp) => pp.id === x.partnerId);
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

function partnerPerCompany(companyId) {
  if (perHubspotId.has(companyId)) return perHubspotId.get(companyId);
  const nome = companyNome.get(companyId);
  if (!nome) return null;
  return perNome.get(norm(nome)) ?? null;
}

// 3. Contatti HubSpot → accumula per partner
const daAggiungere = new Map(); // partnerId -> [contatti]
let totContatti = 0;
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
      const partnersVisti = new Set();
      for (const cid of companyIds) {
        const p = partnerPerCompany(cid);
        if (!p || partnersVisti.has(p.id)) continue;
        partnersVisti.add(p.id);
        if (!daAggiungere.has(p.id)) daAggiungere.set(p.id, []);
        daAggiungere.get(p.id).push({
          ruolo: pr.jobtitle || null,
          nome: nome || null,
          telefono: pr.phone || null,
          email: pr.email || null,
        });
      }
    }
    after = j.paging?.next?.after;
  } while (after);
}

// 4. Scrittura con dedup per identità (email>telefono>nome)
let aggiunti = 0;
let partnerToccati = 0;
for (const p of partner) {
  const nuovi = daAggiungere.get(p.id);
  if (!nuovi?.length) continue;
  const chiaviEsistenti = new Set(p.contatti.map(chiave).filter(Boolean));
  const daCreare = [];
  for (const c of nuovi) {
    const k = chiave(c);
    if (k && chiaviEsistenti.has(k)) continue;
    if (k) chiaviEsistenti.add(k);
    daCreare.push({ ...c, fonte: "hubspot" });
  }
  if (!daCreare.length) continue;
  await prisma.partner.update({ where: { id: p.id }, data: { contatti: { create: daCreare } } });
  aggiunti += daCreare.length;
  partnerToccati++;
}

console.log(
  `Contatti HubSpot letti: ${totContatti} | referenti aggiunti: ${aggiunti} su ${partnerToccati} partner`,
);
await prisma.$disconnect();
