// Supabase Edge Function `hubspot-match` (Deno).
//
// Conciliazione intelligente contatti: dato un negozio (scoperto da Google),
// cerca in HubSpot l'azienda corrispondente e i suoi contatti, e usa un modello
// Claude per: 1) trovare il match giusto anche con nome/indirizzo non identici,
// 2) raggruppare i contatti della stessa azienda, 3) segnalare i duplicati.
//
// Azione:
//   { action: 'match_contacts', place_id }  → { match, contatti, duplicati, confidenza, nota }
//
// Secret richiesti: HUBSPOT_TOKEN (già presente), ANTHROPIC_API_KEY (da impostare).
// Deploy:
//   supabase functions deploy hubspot-match --project-ref fdsziebgkljfsugqqbqd
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref fdsziebgkljfsugqqbqd
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HUBSPOT = 'https://api.hubapi.com';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // economico e adatto al matching

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function hs(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${HUBSPOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

// Estrae TUTTE le aziende e i contatti da HubSpot e li salva nella copia locale.
async function syncCrm(admin: any, token: string) {
  const now = new Date().toISOString();

  let after: string | undefined;
  let nAz = 0;
  do {
    const url = `/crm/v3/objects/companies?limit=100&properties=name,address,city,zip,domain,phone${after ? `&after=${after}` : ''}`;
    const page = await hs(token, url);
    const rows = (page.results ?? []).map((c: any) => ({
      hubspot_id: String(c.id),
      nome: c.properties?.name ?? null,
      indirizzo: c.properties?.address ?? null,
      citta: c.properties?.city ?? null,
      cap: c.properties?.zip ?? null,
      dominio: c.properties?.domain ?? null,
      telefono: c.properties?.phone ?? null,
      synced_at: now,
    }));
    if (rows.length) await admin.from('hubspot_companies').upsert(rows, { onConflict: 'hubspot_id' });
    nAz += rows.length;
    after = page.paging?.next?.after;
  } while (after);

  after = undefined;
  let nCon = 0;
  do {
    const url = `/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,jobtitle&associations=companies${after ? `&after=${after}` : ''}`;
    const page = await hs(token, url);
    const rows = (page.results ?? []).map((c: any) => {
      const compId = c.associations?.companies?.results?.[0]?.id;
      const nome = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ').trim();
      return {
        hubspot_id: String(c.id),
        company_hubspot_id: compId ? String(compId) : null,
        nome: nome || null,
        email: c.properties?.email ?? null,
        telefono: c.properties?.phone ?? null,
        ruolo: c.properties?.jobtitle ?? null,
        synced_at: now,
      };
    });
    if (rows.length) await admin.from('hubspot_contacts').upsert(rows, { onConflict: 'hubspot_id' });
    nCon += rows.length;
    after = page.paging?.next?.after;
  } while (after);

  // Trattative (deals) con l'azienda associata.
  after = undefined;
  let nDeal = 0;
  do {
    const url = `/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,deluxy_linea&associations=companies${after ? `&after=${after}` : ''}`;
    const page = await hs(token, url);
    const rows = (page.results ?? []).map((d: any) => {
      const compId = d.associations?.companies?.results?.[0]?.id;
      const fase: string = d.properties?.dealstage ?? '';
      return {
        hubspot_id: String(d.id),
        company_hubspot_id: compId ? String(compId) : null,
        nome: d.properties?.dealname ?? null,
        fase: fase || null,
        valore: d.properties?.amount ? Number(d.properties.amount) : null,
        linea: d.properties?.deluxy_linea || null,
        aperta: !['closedwon', 'closedlost'].includes(fase),
        synced_at: now,
      };
    });
    if (rows.length) await admin.from('hubspot_deals').upsert(rows, { onConflict: 'hubspot_id' });
    nDeal += rows.length;
    after = page.paging?.next?.after;
  } while (after);

  return json({ aziende: nAz, contatti: nCon, trattative: nDeal });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = Deno.env.get('HUBSPOT_TOKEN');
    if (!token) return json({ error: 'HUBSPOT_TOKEN non configurato' }, 500);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    // Estrazione CRM → copia locale (aziende + contatti). Non richiede AI.
    if (body.action === 'sync_crm') {
      return await syncCrm(admin, token);
    }

    // match_contacts: richiede utente autenticato + chiave AI.
    const aiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!aiKey) return json({ error: 'ANTHROPIC_API_KEY non configurato' }, 500);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);
    if (body.action !== 'match_contacts') return json({ error: `Azione sconosciuta: ${body.action}` }, 400);

    const { data: place } = await admin.from('places').select('*').eq('id', body.place_id).single();
    if (!place) return json({ error: 'Negozio non trovato' }, 404);

    // 1) Cerca aziende candidate su HubSpot per nome.
    const nome: string = place.nome ?? '';
    const search = await hs(token, '/crm/v3/objects/companies/search', {
      method: 'POST',
      body: JSON.stringify({
        query: nome,
        properties: ['name', 'address', 'city', 'zip', 'domain', 'phone'],
        limit: 8,
      }),
    });
    const aziende: any[] = search.results ?? [];

    // 2) Per ogni azienda candidata, prendi i contatti associati.
    const candidati = [];
    for (const az of aziende) {
      let contatti: any[] = [];
      try {
        const assoc = await hs(token, `/crm/v3/objects/companies/${az.id}/associations/contacts?limit=20`);
        const ids = (assoc.results ?? []).map((r: any) => r.toObjectId ?? r.id).filter(Boolean);
        if (ids.length) {
          const batch = await hs(token, '/crm/v3/objects/contacts/batch/read', {
            method: 'POST',
            body: JSON.stringify({
              properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'],
              inputs: ids.map((id: string) => ({ id })),
            }),
          });
          contatti = (batch.results ?? []).map((c: any) => ({
            id: c.id,
            nome: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ').trim(),
            email: c.properties?.email ?? null,
            telefono: c.properties?.phone ?? null,
            ruolo: c.properties?.jobtitle ?? null,
          }));
        }
      } catch {
        /* azienda senza contatti o errore associazioni: prosegui */
      }
      candidati.push({
        hubspot_company_id: az.id,
        nome: az.properties?.name ?? null,
        indirizzo: az.properties?.address ?? null,
        citta: az.properties?.city ?? null,
        cap: az.properties?.zip ?? null,
        dominio: az.properties?.domain ?? null,
        contatti,
      });
    }

    if (candidati.length === 0) {
      return json({ match: null, contatti: [], duplicati: [], confidenza: 'nessuna', nota: 'Nessuna azienda simile trovata su HubSpot.' });
    }

    // 3) Conciliazione con Claude.
    const sys =
      'Sei un assistente CRM. Ti do un NEGOZIO reale (da Google) e alcune AZIENDE candidate da HubSpot con i loro contatti. ' +
      'Compiti: (1) scegli quale azienda HubSpot è lo stesso negozio (match anche se nome/indirizzo non identici; null se nessuna); ' +
      '(2) elenca i contatti che appartengono a quell\'azienda; (3) segnala gruppi di contatti che sembrano DUPLICATI (stessa persona) da unire. ' +
      'Rispondi SOLO con JSON valido, senza testo attorno, nella forma: ' +
      '{"match_company_id": string|null, "confidenza": "alta"|"media"|"bassa"|"nessuna", ' +
      '"contatti": [{"hubspot_contact_id": string, "nome": string, "email": string|null, "telefono": string|null, "ruolo": string|null}], ' +
      '"duplicati": [{"ids": [string], "motivo": string}], "nota": string}';
    const userMsg = JSON.stringify({
      negozio: { nome: place.nome, indirizzo: place.indirizzo, categoria: place.categoria },
      aziende_candidate: candidati,
    });

    const aiRes = await fetch(ANTHROPIC, {
      method: 'POST',
      headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: sys,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!aiRes.ok) return json({ error: `AI ${aiRes.status}: ${await aiRes.text().catch(() => '')}` }, 502);
    const aiData = await aiRes.json();
    const testo: string = aiData.content?.[0]?.text ?? '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(testo);
    } catch {
      const m = testo.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const match = candidati.find((c) => c.hubspot_company_id === parsed.match_company_id) ?? null;
    return json({
      match: match ? { hubspot_company_id: match.hubspot_company_id, nome: match.nome, indirizzo: match.indirizzo } : null,
      contatti: parsed.contatti ?? [],
      duplicati: parsed.duplicati ?? [],
      confidenza: parsed.confidenza ?? 'nessuna',
      nota: parsed.nota ?? '',
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
