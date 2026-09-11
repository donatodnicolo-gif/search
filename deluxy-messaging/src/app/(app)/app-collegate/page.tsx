import { AppCollegate } from '@/components/AppCollegate'
import { soloAmministratore } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// ⭐ 11/09/2026 — APP COLLEGATE (richiesta dell'utente: «dammi possibilità di
// aggiungere tue chiavi ad altre app»).
//
// ⚠️ Qui il cancello è sulla PAGINA, non solo nella rotta: questa schermata è
// la mappa di dove arrivano le nostre chiamate e con quali credenziali. Non è
// roba da far vedere «in sola lettura» a chi non può cambiarla.
export default async function PaginaAppCollegate() {
  await soloAmministratore()
  return <AppCollegate />
}
