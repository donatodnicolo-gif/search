// Supabase Edge Function `hubspot-sync` (Deno).
//
// Fa da proxy sicuro tra l'app e HubSpot: il Private App token vive QUI come
// secret (HUBSPOT_TOKEN), mai nel bundle dell'app. L'app chiama questa funzione
// autenticata con il proprio JWT Supabase.
//
// Azioni:
//   - sync_visit       { visit_id }  → upsert Company + Contact, crea Deal, scrive Nota
//   - deals_for_place  { place_id }  → sync inverso: fasi/valori dei deal HubSpot
//
// Deploy:
//   supabase functions deploy hubspot-sync
//   supabase secrets set HUBSPOT_TOKEN=pat-xx-xxxx
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
// Mappatura linea → proprietà deal: usiamo la proprietà custom `deluxy_linea`.
// Mappatura fase → dealstage HubSpot: identità sui valori interni della pipeline.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HUBSPOT = 'https://api.hubapi.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const token = Deno.env.get('HUBSPOT_TOKEN');
    if (!token) return json({ error: 'HUBSPOT_TOKEN non configurato' }, 500);

    // Client Supabase con service role (bypassa RLS lato server).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verifica il JWT dell'utente (l'app deve essere autenticata).
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: 'Non autenticato' }, 401);

    const body = await req.json();
    const hs = new HubSpot(token);

    if (body.action === 'sync_visit') {
      return json(await syncVisit(admin, hs, body.visit_id));
    }
    if (body.action === 'deals_for_place') {
      return json(await dealsForPlace(admin, hs, body.place_id));
    }
    if (body.action === 'sync_deal') {
      return json(await syncDeal(admin, hs, body.deal_id));
    }
    if (body.action === 'refresh_deal_values') {
      return json(await refreshDealValues(admin, hs));
    }
    if (body.action === 'update_deal') {
      return json(await updateDeal(admin, hs, body.hubspot_deal_id, body.patch));
    }
    return json({ error: `Azione sconosciuta: ${body.action}` }, 400);
  } catch (e) {
    if (e instanceof RateLimit) {
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(e.retryAfter) });
    }
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

// ── Azione: sincronizza una visita ────────────────────────────────────────────
async function syncVisit(admin: any, hs: HubSpot, visitId: string) {
  const { data: visit } = await admin.from('visits').select('*').eq('id', visitId).single();
  if (!visit) throw new Error('Visita non trovata');

  const { data: place } = await admin.from('places').select('*').eq('id', visit.place_id).single();
  if (!place) throw new Error('Place non trovato');

  const { data: contatti } = await admin
    .from('contacts')
    .select('*')
    .eq('place_id', place.id)
    .order('is_decisore', { ascending: false });
  const contatto = contatti?.[0] ?? null;

  // 1. Company (upsert per hubspot_company_id o per nome+indirizzo).
  const companyId = await hs.upsertCompany(place);
  await admin.from('places').update({ hubspot_company_id: companyId }).eq('id', place.id);

  // 2. Contact (opzionale) + associazione alla company.
  let contactId: string | null = null;
  if (contatto) {
    contactId = await hs.upsertContact(contatto, companyId);
    await admin.from('contacts').update({ hubspot_contact_id: contactId }).eq('id', contatto.id);
  }

  // 3. Deal: linea → deluxy_linea, esito → dealstage, e Briefing / Note post
  //    meeting / Esito e analisi / Next step scritti come proprietà custom del
  //    deal (visibili nella view "trattative def").
  const dealId = await hs.createDeal({
    nome: `${place.nome} — ${visit.linea_proposta ?? place.linea_ipotizzata ?? 'Deluxy'}`,
    linea: visit.linea_proposta ?? place.linea_ipotizzata,
    dealstage: dealstageDaEsito(visit.esito),
    briefing: visit.briefing,
    // Concorrenti in coda alle note post meeting (nessuna proprietà HubSpot dedicata
    // finché non riconciliamo con un elenco strutturato).
    notePost: [visit.note_post_meeting, visit.concorrenti ? `Concorrenti già presenti: ${visit.concorrenti}` : null]
      .filter(Boolean)
      .join('\n\n') || null,
    esitoAnalisi: visit.esito_analisi,
    nextStep: visit.next_step,
    companyId,
    contactId,
  });
  await admin.from('deals').insert({
    place_id: place.id,
    linea: visit.linea_proposta ?? place.linea_ipotizzata,
    fase: dealstageDaEsito(visit.esito),
    hubspot_deal_id: dealId,
    owner: visit.owner,
  });

  // 4. marca visita sincronizzata
  await admin.from('visits').update({ hubspot_synced: true }).eq('id', visit.id);

  return {
    hubspot_company_id: companyId,
    hubspot_contact_id: contactId,
    hubspot_deal_id: dealId,
    note_id: null,
  };
}

// ── Azione: sincronizza una trattativa creata a mano (con i contatti) ──────────
async function syncDeal(admin: any, hs: HubSpot, dealId: string) {
  const { data: deal } = await admin.from('deals').select('*').eq('id', dealId).single();
  if (!deal) throw new Error('Trattativa non trovata');
  const { data: place } = await admin.from('places').select('*').eq('id', deal.place_id).single();
  if (!place) throw new Error('Place non trovato');

  const { data: contatti } = await admin
    .from('contacts')
    .select('*')
    .eq('place_id', place.id)
    .order('is_decisore', { ascending: false });

  // 1. Company + tutti i contatti (sync completo dei contatti del negozio).
  const companyId = await hs.upsertCompany(place);
  await admin.from('places').update({ hubspot_company_id: companyId }).eq('id', place.id);

  let primoContactId: string | null = null;
  for (const c of contatti ?? []) {
    const cid = await hs.upsertContact(c, companyId);
    await admin.from('contacts').update({ hubspot_contact_id: cid }).eq('id', c.id);
    if (!primoContactId) primoContactId = cid;
  }

  // 2. Deal con valore atteso (amount) e fase.
  const hubspotDealId = await hs.createDeal({
    nome: `${place.nome} — ${deal.linea ?? 'Deluxy'}`,
    linea: deal.linea,
    dealstage: deal.fase,
    amount: deal.valore_atteso,
    nextStep: deal.next_action,
    companyId,
    contactId: primoContactId,
  });
  await admin.from('deals').update({ hubspot_deal_id: hubspotDealId }).eq('id', deal.id);

  return {
    hubspot_company_id: companyId,
    hubspot_contact_id: primoContactId,
    hubspot_deal_id: hubspotDealId,
    contatti_sincronizzati: (contatti ?? []).length,
  };
}

// ── Azione: sync inverso deal per place ───────────────────────────────────────
async function dealsForPlace(admin: any, hs: HubSpot, placeId: string) {
  const { data: place } = await admin.from('places').select('*').eq('id', placeId).single();
  if (!place?.hubspot_company_id) return [];
  const deals = await hs.dealsByCompany(place.hubspot_company_id);
  return deals.map((d) => ({
    id: d.id,
    place_id: placeId,
    linea: d.properties.deluxy_linea ?? null,
    fase: d.properties.dealstage,
    valore_atteso: d.properties.amount ? Number(d.properties.amount) : null,
    next_action: d.properties.next_action ?? null,
    owner: null,
    hubspot_deal_id: d.id,
  }));
}

// ── Azione: allinea gli importi (e fase) dei deal locali con HubSpot ───────────
// Le trattative nate da una visita vengono create su HubSpot senza `amount`;
// se l'importo viene poi impostato su HubSpot, qui lo si riporta su Supabase così
// la sezione Trattative mostra il valore anche per i deal che vengono da HubSpot.
async function refreshDealValues(admin: any, hs: HubSpot) {
  const { data: deals } = await admin
    .from('deals')
    .select('id, hubspot_deal_id')
    .not('hubspot_deal_id', 'is', null);
  const ids: string[] = (deals ?? []).map((d: any) => d.hubspot_deal_id);
  if (!ids.length) return { aggiornati: 0 };

  const byHsId = await hs.readDeals(ids); // hubspot_id → { amount, dealstage, ... }
  let aggiornati = 0;
  for (const d of deals ?? []) {
    const p = byHsId.get(d.hubspot_deal_id);
    if (!p) continue;
    const patch: Record<string, unknown> = {};
    if (p.amount != null && isFinite(Number(p.amount))) patch.valore_atteso = Number(p.amount);
    if (p.dealstage) patch.fase = p.dealstage;
    if (p.deluxy_linea) patch.linea = p.deluxy_linea;
    if (p.next_action) patch.next_action = p.next_action;
    if (Object.keys(patch).length === 0) continue;
    await admin.from('deals').update(patch).eq('id', d.id);
    aggiornati++;
  }
  return { aggiornati };
}

// ── Azione: modifica un deal esistente su HubSpot (+ mirror locale) ────────────
async function updateDeal(
  admin: any,
  hs: HubSpot,
  hubspotDealId: string,
  patch: { linea?: string | null; fase?: string | null; valore_atteso?: number | null; next_action?: string | null },
) {
  if (!hubspotDealId) throw new Error('hubspot_deal_id mancante');
  await hs.patchDeal(hubspotDealId, patch);
  // Allinea la copia locale del CRM così la UI mostra subito il cambiamento.
  const mirror: Record<string, unknown> = {};
  if (patch.fase !== undefined) {
    mirror.fase = patch.fase;
    mirror.aperta = !['closedwon', 'closedlost'].includes(String(patch.fase));
  }
  if (patch.valore_atteso !== undefined) mirror.valore = patch.valore_atteso;
  if (patch.linea !== undefined) mirror.linea = patch.linea;
  if (Object.keys(mirror).length) {
    await admin.from('hubspot_deals').update(mirror).eq('hubspot_id', hubspotDealId);
  }
  // Se esiste anche un deal Scout collegato, aggiorna pure quello.
  const dealPatch: Record<string, unknown> = {
    ...(patch.fase !== undefined ? { fase: patch.fase } : {}),
    ...(patch.valore_atteso !== undefined ? { valore_atteso: patch.valore_atteso } : {}),
    ...(patch.linea !== undefined ? { linea: patch.linea } : {}),
    ...(patch.next_action !== undefined ? { next_action: patch.next_action } : {}),
  };
  if (Object.keys(dealPatch).length) {
    await admin.from('deals').update(dealPatch).eq('hubspot_deal_id', hubspotDealId);
  }
  return { ok: true, hubspot_deal_id: hubspotDealId };
}

// ── Wrapper API HubSpot v3 ────────────────────────────────────────────────────
class HubSpot {
  constructor(private token: string) {}

  private async req(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`${HUBSPOT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 429) {
      throw new RateLimit(Number(res.headers.get('Retry-After') ?? '2'));
    }
    if (!res.ok) {
      throw new Error(`HubSpot ${path} ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async upsertCompany(place: any): Promise<string> {
    // NB: `industry` è un ENUM HubSpot a valori fissi (RETAIL, APPAREL_FASHION…):
    // inviare il nostro settore italiano (es. "FIORISTA") dà 400 INVALID_OPTION e
    // fa fallire tutto il sync. Il settore vive già in `deluxy_linea` (custom, libera).
    const properties = {
      name: place.nome,
      address: place.indirizzo ?? '',
      city: place.zona ?? 'Milano',
      deluxy_priorita: place.priorita,
      deluxy_linea: place.linea_ipotizzata ?? '',
    };
    if (place.hubspot_company_id) {
      await this.req(`/crm/v3/objects/companies/${place.hubspot_company_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
      return place.hubspot_company_id;
    }
    const created = await this.req('/crm/v3/objects/companies', {
      method: 'POST',
      body: JSON.stringify({ properties }),
    });
    return created.id;
  }

  async upsertContact(c: any, companyId: string): Promise<string> {
    const properties = {
      firstname: c.nome,
      jobtitle: c.ruolo ?? '',
      phone: c.telefono ?? '',
      email: c.email ?? '',
    };
    let id = c.hubspot_contact_id as string | null;
    if (id) {
      await this.req(`/crm/v3/objects/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    } else {
      try {
        const created = await this.req('/crm/v3/objects/contacts', {
          method: 'POST',
          body: JSON.stringify({ properties }),
        });
        id = created.id;
      } catch (e) {
        // Contatto già presente su HubSpot (stessa email) → 409 con l'id esistente:
        // riusalo e aggiornalo, invece di far fallire tutto il sync.
        const msg = String((e as any)?.message ?? e);
        const m = msg.match(/Existing ID:\s*(\d+)/);
        if (msg.includes(' 409:') && m) {
          id = m[1];
          await this.req(`/crm/v3/objects/contacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties }),
          }).catch(() => {});
        } else {
          throw e;
        }
      }
    }
    // Associazione contact → company (tipo standard 279).
    await this.req(
      `/crm/v3/objects/contacts/${id}/associations/companies/${companyId}/contact_to_company`,
      { method: 'PUT' },
    ).catch(() => {});
    return id!;
  }

  async createDeal(d: {
    nome: string;
    linea: string | null;
    dealstage: string;
    briefing?: string | null;
    notePost?: string | null;
    esitoAnalisi?: string | null;
    nextStep?: string | null;
    amount?: number | null;
    companyId: string;
    contactId: string | null;
  }): Promise<string> {
    const props: Record<string, string> = {
      dealname: d.nome,
      dealstage: d.dealstage,
      deluxy_linea: d.linea ?? '',
      deluxy_briefing: d.briefing ?? '',
      deluxy_note_post: d.notePost ?? '',
      deluxy_esito_analisi: d.esitoAnalisi ?? '',
      deluxy_next_step: d.nextStep ?? '',
    };
    if (d.amount != null && isFinite(d.amount)) props.amount = String(d.amount);
    const created = await this.req('/crm/v3/objects/deals', {
      method: 'POST',
      body: JSON.stringify({ properties: props }),
    });
    const dealId = created.id;
    await this.req(
      `/crm/v3/objects/deals/${dealId}/associations/companies/${d.companyId}/deal_to_company`,
      { method: 'PUT' },
    ).catch(() => {});
    if (d.contactId) {
      await this.req(
        `/crm/v3/objects/deals/${dealId}/associations/contacts/${d.contactId}/deal_to_contact`,
        { method: 'PUT' },
      ).catch(() => {});
    }
    return dealId;
  }

  /** Modifica le proprietà di un deal esistente (amount/dealstage/linea/next_action). */
  async patchDeal(
    id: string,
    patch: { linea?: string | null; fase?: string | null; valore_atteso?: number | null; next_action?: string | null },
  ): Promise<void> {
    const props: Record<string, string> = {};
    if (patch.fase !== undefined && patch.fase !== null) props.dealstage = patch.fase;
    if (patch.linea !== undefined) props.deluxy_linea = patch.linea ?? '';
    if (patch.next_action !== undefined) props.deluxy_next_step = patch.next_action ?? '';
    if (patch.valore_atteso !== undefined) props.amount = patch.valore_atteso == null ? '' : String(patch.valore_atteso);
    if (!Object.keys(props).length) return;
    await this.req(`/crm/v3/objects/deals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: props }),
    });
  }

  /** Legge in batch le proprietà dei deal per id HubSpot → Map(id → properties). */
  async readDeals(ids: string[]): Promise<Map<string, any>> {
    const props = ['amount', 'dealstage', 'deluxy_linea', 'next_action'];
    const out = new Map<string, any>();
    // Batch read a blocchi di 100 (limite HubSpot).
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const res = await this.req('/crm/v3/objects/deals/batch/read', {
        method: 'POST',
        body: JSON.stringify({ properties: props, inputs: chunk.map((id) => ({ id })) }),
      });
      for (const r of res?.results ?? []) {
        out.set(r.id, r.properties ?? {});
      }
    }
    return out;
  }

  async dealsByCompany(companyId: string): Promise<any[]> {
    const assoc = await this.req(
      `/crm/v3/objects/companies/${companyId}/associations/deals`,
    );
    const ids: string[] = (assoc.results ?? []).map((r: any) => r.id ?? r.toObjectId);
    const out: any[] = [];
    for (const id of ids) {
      const deal = await this.req(
        `/crm/v3/objects/deals/${id}?properties=dealname,dealstage,amount,deluxy_linea,next_action`,
      );
      out.push(deal);
    }
    return out;
  }
}

// ── Utilità ───────────────────────────────────────────────────────────────────
class RateLimit extends Error {
  constructor(public retryAfter: number) {
    super('rate_limited');
  }
}

// Esito visita → dealstage HubSpot.
function dealstageDaEsito(esito: string | null): string {
  switch (esito) {
    case 'chiuso':
      return 'closedwon';
    case 'non_target':
      return 'closedlost';
    case 'da_richiamare':
      return 'appointmentscheduled';
    case 'interessato':
      return 'decisionmakerboughtin';
    default:
      return 'appointmentscheduled';
  }
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors, ...extraHeaders },
  });
}
