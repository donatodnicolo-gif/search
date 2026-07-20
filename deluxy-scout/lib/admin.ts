// Gate amministratore. L'accesso alla dashboard di Team è ristretto a queste
// email. NB: non è un confine di sicurezza dei dati (le RLS già condividono le
// visite di tutto il team fra gli autenticati) — è un filtro di UI: mostra la
// sezione Team solo a chi coordina la rete commerciale.
export const ADMIN_EMAILS = ['nicolo.donato@deluxy.it'];

export function isAdmin(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
