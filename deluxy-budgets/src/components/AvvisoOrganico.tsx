import type { StatoOrganico } from "@/lib/calc";

// Cosa non è arrivato da Personale, detto dove si guarda il personale (06/09/2026).
// Un componente solo per tre pagine (/dipendenti, /team, /pl): la stessa
// mancanza non può avere tre spiegazioni diverse.
export function AvvisoOrganico({ organico }: { organico: StatoOrganico }) {
  if (organico.stato === "senza-chiave") {
    return (
      <div className="avviso-errore">
        ⚠️ <strong>L&apos;organico non arriva: manca la chiave di Personale.</strong> Serve una chiave di
        sola lettura emessa da Personale → Chiavi delle app, messa come <code>PERSONALE_API_KEY</code>
        (ambiente, Configurazione → Chiavi, o cassaforte del Hub). Finché manca, il costo del
        personale nel P&amp;L vale <strong>zero</strong>: un buco, non un organico vuoto.
      </div>
    );
  }
  if (organico.stato === "errore") {
    return (
      <div className="avviso-errore">
        ⚠️ <strong>Personale non risponde</strong> ({organico.motivo}). Persone e squadre non si vedono e il
        costo del personale nel P&amp;L vale <strong>zero</strong> finché non torna. Ricarica fra qualche
        secondo.
      </div>
    );
  }
  const righe: string[] = [];
  if (!organico.storia) {
    righe.push(
      "Il Personale in produzione non espone ancora le storie di contratto e compenso (?storia=1): per ogni persona vale il compenso corrente su tutti i mesi in forza, e chi decorre da un mese futuro non costa finché non decorre."
    );
  }
  righe.push(...organico.avvisi);
  if (organico.nonInPersonale.length > 0) {
    righe.push(
      `Nel vecchio roster di Budgets c'erano nomi che Personale non conosce e che quindi NON contano più: ${organico.nonInPersonale.join(", ")}. Se sono persone vere vanno scritte in Personale (con contratto e compenso); se erano righe di piano, restano solo nella storia.`
    );
  }
  if (righe.length === 0) return null;
  return (
    <div className="card" style={{ borderColor: "var(--orange)", marginBottom: 16 }}>
      <p style={{ margin: 0, fontSize: 13.5 }}>
        <strong>Da sapere sull&apos;organico letto da Personale:</strong>
      </p>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
        {righe.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
