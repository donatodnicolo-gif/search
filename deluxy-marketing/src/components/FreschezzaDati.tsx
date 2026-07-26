import { prisma } from "@/lib/db";

// Quanto sono freschi i numeri che stai guardando.
// Un cruscotto che mostra dati di tre giorni fa senza dirlo è peggio di un
// cruscotto vuoto: sembra aggiornato. Qui si dichiara sempre l'ultimo giorno
// arrivato, e si avvisa quando la consegna si è fermata.
//
// Il giorno in corso è normale che manchi o sia parziale: le piattaforme
// consolidano le conversioni nelle ore (e nei giorni) successivi.
export async function FreschezzaDati({
  brand,
  canale = "google_ads",
}: {
  brand?: string;
  canale?: string;
}) {
  const ultimo = await prisma.metricaCampagna.aggregate({
    where: { campagna: { canale, ...(brand ? { brand } : {}) } },
    _max: { data: true },
  });
  if (!ultimo._max.data) return null;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorniIndietro = Math.round((oggi.getTime() - ultimo._max.data.getTime()) / 86_400_000);

  // Fino a ieri è normale: il giorno in corso arriva con la corsa successiva.
  if (giorniIndietro <= 1) return null;

  const grave = giorniIndietro >= 3;
  return (
    <div
      className="nota-info"
      style={{
        borderColor: grave ? "rgba(215,0,21,.35)" : "rgba(201,52,0,.35)",
        background: grave ? "rgba(215,0,21,.06)" : "rgba(201,52,0,.06)",
      }}
    >
      <span className="nota-icona" style={{ color: grave ? "var(--red)" : "var(--orange)" }}>⚠</span>
      <span>
        <b>
          I dati si fermano al {ultimo._max.data.toLocaleDateString("it-IT")}
          {giorniIndietro > 1 ? ` — ${giorniIndietro} giorni fa` : ""}
        </b>
        : mancano i giorni successivi, quindi i totali del periodo sono più bassi del vero.
        Di solito significa che lo script di Google Ads non è schedulato o non è andato a buon
        fine: controlla il log in Google Ads (Strumenti → Azioni collettive → Script) e la
        pagina <a href="/ricezione" style={{ color: "var(--blue)" }}>Dati in arrivo</a>.
      </span>
    </div>
  );
}
