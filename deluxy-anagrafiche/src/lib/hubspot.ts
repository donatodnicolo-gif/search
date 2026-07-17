// Confronto con HubSpot (sezione "Sync HubSpot").
// Legge le companies dal CRM con un token di Private App HubSpot
// (HUBSPOT_ACCESS_TOKEN nel .env / nelle variabili Vercel).
// Solo lettura: nessuna scrittura verso HubSpot.

export type AziendaHubspot = {
  id: string;
  nome: string;
  citta: string | null;
  telefono: string | null;
  dominio: string | null;
};

export function hubspotConfigurato(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

const PROPRIETA = ["name", "city", "phone", "domain"];
const PER_PAGINA = 100;
const MAX_PAGINE = 20; // fino a 2000 companies per confronto

// Scarica le companies da HubSpot (paginato). Lancia in caso di errore HTTP.
export async function scaricaAziendeHubspot(): Promise<AziendaHubspot[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN non configurato");

  const aziende: AziendaHubspot[] = [];
  let after: string | undefined;

  for (let pagina = 0; pagina < MAX_PAGINE; pagina++) {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/companies");
    url.searchParams.set("limit", String(PER_PAGINA));
    url.searchParams.set("properties", PROPRIETA.join(","));
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HubSpot HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      results: { id: string; properties: Record<string, string | null> }[];
      paging?: { next?: { after?: string } };
    };
    for (const r of json.results) {
      if (!r.properties.name) continue;
      aziende.push({
        id: r.id,
        nome: r.properties.name,
        citta: r.properties.city ?? null,
        telefono: r.properties.phone ?? null,
        dominio: r.properties.domain ?? null,
      });
    }
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return aziende;
}

// Ricerca companies per il popup di riconciliazione (endpoint search del CRM).
export async function cercaAziendeHubspot(query: string): Promise<AziendaHubspot[]> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN non configurato");

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 10, properties: PROPRIETA }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HubSpot HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results: { id: string; properties: Record<string, string | null> }[];
  };
  return json.results
    .filter((r) => r.properties.name)
    .map((r) => ({
      id: r.id,
      nome: r.properties.name!,
      citta: r.properties.city ?? null,
      telefono: r.properties.phone ?? null,
      dominio: r.properties.domain ?? null,
    }));
}

// Chiave di confronto: nome senza accenti, punteggiatura e maiuscole.
// Così "Autori Capresi" (registro) aggancia "AUTORI CAPRESI srl" (HubSpot).
export function chiaveNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(srl|srls|spa|snc|sas|s\.r\.l\.|s\.p\.a\.)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
