// L'appuntamento che l'AI propone su una mail (invito a una riunione), salvato
// come JSON in Messaggio.eventoProposto. Qui il tipo e il lettore sicuro: stanno
// fuori dalle server action perché servono anche ai componenti server.

export type EventoPropostoSalvato = {
  titolo: string
  inizio: string // "YYYY-MM-DDTHH:MM" in ora italiana (o "YYYY-MM-DD" se giornata intera)
  fine: string | null
  luogo: string
  giornataIntera: boolean
} | null

export function leggiEventoProposto(json: string | null): EventoPropostoSalvato {
  if (!json) return null
  try {
    const e = JSON.parse(json)
    if (e && typeof e.titolo === 'string' && typeof e.inizio === 'string') {
      return {
        titolo: e.titolo,
        inizio: e.inizio,
        fine: typeof e.fine === 'string' ? e.fine : null,
        luogo: typeof e.luogo === 'string' ? e.luogo : '',
        giornataIntera: e.giornataIntera === true,
      }
    }
  } catch {
    /* JSON rotto: nessuna proposta */
  }
  return null
}
