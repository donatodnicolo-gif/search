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
