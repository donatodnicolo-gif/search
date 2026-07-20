#!/usr/bin/env node
// Crea le proprietà custom Deluxy su HubSpot (Company + Deal) via CRM API.
// Uso: HUBSPOT_TOKEN=pat-... node scripts/hubspot-setup-properties.mjs
//
// Idempotente: se la proprietà esiste già (409), la salta.
const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Manca HUBSPOT_TOKEN');
  process.exit(1);
}
const BASE = 'https://api.hubapi.com';

const COMPANY_PROPS = [
  { name: 'deluxy_linea', label: 'Deluxy - Linea ipotizzata', fieldType: 'text', groupName: 'companyinformation' },
  { name: 'deluxy_priorita', label: 'Deluxy - Priorità', fieldType: 'text', groupName: 'companyinformation' },
];

const DEAL_PROPS = [
  { name: 'deluxy_linea', label: 'Deluxy - Linea', fieldType: 'text', groupName: 'dealinformation' },
  { name: 'deluxy_briefing', label: 'Deluxy - Briefing', fieldType: 'textarea', groupName: 'dealinformation' },
  { name: 'deluxy_note_post', label: 'Deluxy - Note post meeting', fieldType: 'textarea', groupName: 'dealinformation' },
  { name: 'deluxy_esito_analisi', label: 'Deluxy - Esito e analisi', fieldType: 'textarea', groupName: 'dealinformation' },
  { name: 'deluxy_next_step', label: 'Deluxy - Next step', fieldType: 'text', groupName: 'dealinformation' },
];

async function createProp(objectType, p) {
  const res = await fetch(`${BASE}/crm/v3/properties/${objectType}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: p.name,
      label: p.label,
      type: 'string',
      fieldType: p.fieldType,
      groupName: p.groupName,
    }),
  });
  if (res.status === 409) {
    console.log(`= ${objectType}.${p.name} esiste già`);
    return;
  }
  if (!res.ok) {
    const t = await res.text();
    // 409 può arrivare anche come 400 "already exists"
    if (/already exists|PROPERTY_ALREADY_EXISTS/i.test(t)) {
      console.log(`= ${objectType}.${p.name} esiste già`);
      return;
    }
    throw new Error(`${objectType}.${p.name} → ${res.status}: ${t}`);
  }
  console.log(`+ creata ${objectType}.${p.name}`);
}

for (const p of COMPANY_PROPS) await createProp('companies', p);
for (const p of DEAL_PROPS) await createProp('deals', p);
console.log('Proprietà custom pronte ✔');
