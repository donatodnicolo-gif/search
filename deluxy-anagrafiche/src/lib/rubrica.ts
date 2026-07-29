// Nome con cui un referente va in rubrica Google quando il campo
// "Nome su rubrica" della scheda contatto è vuoto:
// [STATO] [AZIENDA] [CITTÀ] [Nome contatto]
export function nomeRubricaDefault(r: {
  statoLabel: string;
  partnerNome: string;
  citta: string | null;
  nome: string | null;
}): string {
  const stato = (r.statoLabel || "").toUpperCase();
  const azienda = (r.partnerNome || "").trim();
  const citta = (r.citta || "").trim().toUpperCase();
  const persona = (r.nome || "").trim();
  return [stato, azienda, citta, persona].filter(Boolean).join(" ");
}

// Prefissi che le app Deluxy antepongono al nome in rubrica: gli stati del
// registro e le etichette dell'app Ricerca fornitori
// ("FORNITORE [NOME] [FIORAIO|PASTICCERE] PROV. [PR]").
const PREFISSI_RUBRICA = [
  "PROSPECT", "IN CONTATTO", "IN ATTESA", "IN TRATTATIVA", "DA RICONTATTARE",
  "PARTNER", "ATTIVO", "NON INTERESSATO", "DISMESSO", "ARCHIVIATA",
  "FORNITORE", "FIORAIO", "PASTICCERE",
];

// Operazione inversa di `nomeRubricaDefault`: dal nome del contatto in rubrica
// torna al nome della PERSONA, togliendo i pezzi che ci abbiamo messo noi —
// stato, azienda, città e le etichette dell'app fornitori. Serve importando un
// referente dalla rubrica: senza, nel registro finirebbe "PARTNER Basara
// Milano MILANO Mara Roveda" invece di "Mara Roveda".
// Se non resta niente di riconoscibile si tiene il nome originale: meglio un
// nome sporco che un campo vuoto.
export function nomePersonaDaRubrica(
  displayName: string,
  contesto: { partnerNome?: string | null; citta?: string | null } = {},
): string {
  let out = ` ${String(displayName || "").trim()} `;
  const togli = (testo: string) => {
    const t = testo.trim();
    if (t.length < 2) return;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\s${esc}\\s`, "gi"), " ");
  };
  // Prima i pezzi che conosciamo per certo (azienda e città di questa scheda),
  // poi le etichette generiche e la provincia dell'app fornitori.
  if (contesto.partnerNome) togli(contesto.partnerNome);
  if (contesto.citta) togli(contesto.citta);
  for (const p of PREFISSI_RUBRICA) togli(p);
  out = out.replace(/\sPROV\.?\s*\(?[A-Z]{2}\)?\s/gi, " ");
  const pulito = out.replace(/\s+/g, " ").trim();
  return pulito || String(displayName || "").trim();
}
