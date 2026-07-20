// Link ai record del CRM HubSpot (portale Deluxy). Valori pubblici, in config.
const PORTAL = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "147623810";
const HOST = process.env.NEXT_PUBLIC_HUBSPOT_APP_HOST || "app-eu1.hubspot.com";

export function linkContattoHubspot(id: string): string {
  return `https://${HOST}/contacts/${PORTAL}/record/0-1/${id}`;
}
export function linkCompanyHubspot(id: string): string {
  return `https://${HOST}/contacts/${PORTAL}/record/0-2/${id}`;
}
