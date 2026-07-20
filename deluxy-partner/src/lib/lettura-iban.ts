// Lettura con AI (OpenAI vision) dei dati di un bonifico da una foto/immagine:
// coordinate bancarie, IBAN da una fattura, screenshot di un conto, ecc.
// Restituisce solo dati strutturati; nessun pagamento viene disposto qui.
// La chiave OpenAI resta lato server (OPENAI_API_KEY).

export type DatiBonificoLetti = {
  beneficiario: string | null;
  iban: string | null;
  bic: string | null;
  importo: number | null;
  causale: string | null;
  note: string | null; // eventuale avviso (es. "importo non presente nell'immagine")
};

const ISTRUZIONI =
  "Sei un assistente che estrae dati per un bonifico bancario da un'immagine (foto o " +
  "screenshot) di coordinate bancarie, una fattura, o dati di un conto. " +
  "Estrai SOLO ciò che è effettivamente leggibile, senza inventare. " +
  "Regole: " +
  "- iban: rimuovi spazi, tutto maiuscolo; null se non presente o illeggibile. " +
  "- bic/swift: null se assente. " +
  "- beneficiario: intestatario del conto (ragione sociale o nome). " +
  "- importo: numero in euro (punto come separatore decimale) SOLO se chiaramente indicato " +
  "come importo da pagare; altrimenti null. Non dedurre importi. " +
  "- causale: causale/riferimento se presente (es. numero fattura); altrimenti null. " +
  "- note: se qualcosa è ambiguo o mancante segnalalo qui in breve, altrimenti null. " +
  "Rispondi SOLO con un oggetto JSON con le chiavi: beneficiario, iban, bic, importo, causale, note.";

export async function leggiBonificoDaImmagine(
  dataUrl: string
): Promise<DatiBonificoLetti> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Lettura AI non configurata: manca OPENAI_API_KEY.");
  }
  // Modello con capacità visiva; OPENAI_MODEL può non essere vision, quindi
  // usiamo un default vision dedicato salvo override esplicito.
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ISTRUZIONI },
        {
          role: "user",
          content: [
            { type: "text", text: "Estrai i dati del bonifico da questa immagine." },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Errore OpenAI (${res.status}). ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const contenuto = data?.choices?.[0]?.message?.content;
  if (!contenuto) throw new Error("Risposta AI vuota.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(contenuto);
  } catch {
    throw new Error("La risposta AI non è un JSON valido.");
  }

  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    return s === "" || s.toLowerCase() === "null" ? null : s;
  };
  const numero = (v: unknown) => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    const s = str(v);
    if (!s) return null;
    const n = parseFloat(s.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  };
  const iban = str(parsed.iban);

  return {
    beneficiario: str(parsed.beneficiario),
    iban: iban ? iban.replace(/\s/g, "").toUpperCase() : null,
    bic: str(parsed.bic),
    importo: numero(parsed.importo),
    causale: str(parsed.causale),
    note: str(parsed.note),
  };
}
