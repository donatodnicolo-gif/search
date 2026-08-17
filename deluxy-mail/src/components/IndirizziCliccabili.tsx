import Link from 'next/link'

/**
 * Rende cliccabili gli indirizzi dentro un campo di recapiti («a», «Cc»):
 * ogni indirizzo porta alla sua scheda in rubrica, il resto del testo (nomi,
 * virgole, parentesi angolari) resta esattamente come era.
 *
 * Segnalato il 17/08/2026: «non posso cliccare su mail "a" linn_ per andare nel
 * dettaglio di tutte le sue mail». Il MITTENTE era un link dal primo giorno, il
 * destinatario testo morto — eppure una mail inviata è proprio il caso in cui
 * la controparte sta lì.
 *
 * ⚠️ Si spezza il testo e si tocca solo ciò che È un indirizzo: i campi
 * destinatari arrivano dal server nelle forme più varie (`a@b.it`,
 * `Nome <a@b.it>, Altro <c@d.it>`, con o senza virgolette). Ricostruirli da un
 * elenco di indirizzi vorrebbe dire perdere i nomi; qui non si perde niente.
 */
export function IndirizziCliccabili({ testo }: { testo: string }) {
  // La regex ha il gruppo di cattura, quindi `split` restituisce anche gli
  // indirizzi trovati, alternati ai pezzi di testo che li separano.
  const pezzi = testo.split(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)
  return (
    <>
      {pezzi.map((p, i) =>
        i % 2 === 1 ? (
          <Link
            key={i}
            href={`/rubrica/${encodeURIComponent(p.toLowerCase())}`}
            style={{ textDecoration: 'underline' }}
            title={`Vedi tutti i messaggi scambiati con ${p}`}
          >
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
